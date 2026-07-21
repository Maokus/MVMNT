// Image Sequence Generator Module
// Generates PNG image sequences instead of video files
import { ExportClock } from '@export/export-clock';
import { createExportTimingSnapshot, type ExportTimingSnapshot } from '@export/export-timing-snapshot';
import { getSharedTimingManager } from '@state/timelineStore';
interface GenerateSequenceOptions {
    fps?: number;
    width?: number;
    height?: number;
    sceneName?: string;
    maxFrames?: number | null;
    onProgress?: (progress: number, text?: string) => void;
    onComplete?: (blob: Blob | null) => void;
    transparent?: boolean;
    // Internal/advanced options (not exposed in UI yet)
    _startFrame?: number; // used for partial exports
    deterministicTiming?: boolean; // snapshot tempo map at start (default true)
    frameSink: (filename: string, blob: Blob, frameNumber: number) => Promise<void>;
    signal?: AbortSignal;
}

export class ImageSequenceGenerator {
    private canvas: HTMLCanvasElement;
    private visualizer: any; // Keep as any for now since visualizer is still JS
    private isGenerating: boolean = false;

    constructor(canvas: HTMLCanvasElement, visualizer: any) {
        this.canvas = canvas;
        this.visualizer = visualizer;
    }

    async generateImageSequence(options: GenerateSequenceOptions): Promise<void> {
        const {
            fps = 60,
            width = 1500,
            height = 1500,
            sceneName = 'My Scene',
            maxFrames = null, // null = unlimited (full duration)
            onProgress = () => {},
            onComplete = () => {},
            transparent = false,
            _startFrame = 0,
            deterministicTiming = true,
            frameSink,
            signal,
        } = options;

        if (this.isGenerating) {
            throw new Error('Image sequence generation already in progress');
        }

        // Store original canvas dimensions at the start
        const originalWidth = this.canvas.width;
        const originalHeight = this.canvas.height;

        this.isGenerating = true;

        try {
            // Resize canvas to target resolution
            this.canvas.width = width;
            this.canvas.height = height;
            this.visualizer.resize(width, height);

            const duration = this.visualizer.getCurrentDuration
                ? this.visualizer.getCurrentDuration()
                : this.visualizer.duration;
            const totalFrames = Math.ceil(duration * fps);

            // Get maximum frames from options, default to unlimited (full duration)
            const actualMaxFrames = maxFrames || totalFrames;
            const limitedFrames = Math.min(totalFrames, actualMaxFrames);

            if (totalFrames > actualMaxFrames && actualMaxFrames !== totalFrames) {
                console.warn(`Limiting frames from ${totalFrames} to ${limitedFrames} based on maxFrames setting`);
            }

            console.log(
                `Starting image sequence generation: ${limitedFrames} frames at ${fps}fps (${(
                    limitedFrames / fps
                ).toFixed(2)}s)`
            );
            console.log(`Resolution: ${width}x${height}`);

            onProgress(0);

            // Step 1: Render all frames to PNG images (80% of progress)
            console.log('Rendering frames to PNG images...');
            await this.renderFramesToPNG(
                duration,
                fps,
                limitedFrames,
                onProgress,
                _startFrame,
                deterministicTiming,
                transparent,
                frameSink,
                signal,
            );

            onProgress(100, 'Image sequence ready');
            this.canvas.width = originalWidth;
            this.canvas.height = originalHeight;
            this.visualizer.resize(originalWidth, originalHeight);
            onComplete(null);
            this.isGenerating = false;
        } catch (error) {
            this.isGenerating = false;
            // Restore original canvas size on error
            this.canvas.width = originalWidth;
            this.canvas.height = originalHeight;
            this.visualizer.resize(originalWidth, originalHeight);
            throw error;
        }
    }

    private async renderFramesToPNG(
        duration: number,
        fps: number,
        totalFrames: number,
        onProgress: (progress: number, text?: string) => void,
        startFrame: number = 0,
        deterministicTiming: boolean = true,
        transparent: boolean = false,
        frameSink: (filename: string, blob: Blob, frameNumber: number) => Promise<void>,
        signal?: AbortSignal,
    ): Promise<void> {
        const prePadding = 0; // padding removed
        const playRangeStart = (() => {
            try {
                const pr = this.visualizer?.getPlayRange?.();
                if (pr && typeof pr.startSec === 'number') return pr.startSec as number;
                return 0;
            } catch {
                return 0;
            }
        })();

        let snapshot: ExportTimingSnapshot | undefined;
        if (deterministicTiming) {
            try {
                snapshot = createExportTimingSnapshot(getSharedTimingManager());
            } catch (e) {
                console.warn('Failed to create export timing snapshot; continuing without determinism', e);
            }
        }
        const clock = new ExportClock({
            fps,
            playRangeStartSec: playRangeStart,
            startFrame,
            timingSnapshot: snapshot,
        });

        console.log('Rendering frames to PNG...');
        if (transparent) this.visualizer.setTransparentMode?.(true);
        try {
            for (let frame = 0; frame < totalFrames; frame++) {
                if (!this.isGenerating || signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
                const currentTime = clock.timeForFrame(frame);

                // Use the stateless rendering method from the visualizer
                this.visualizer.renderAtTime(currentTime);

                // Convert canvas to PNG blob
                const blob = await this.canvasToPngBlob();

                const outputFrame = startFrame + frame;
                const outputFilename = `frame_${String(outputFrame).padStart(6, '0')}.png`;
                await frameSink(outputFilename, blob, outputFrame);

                // Update progress for frame rendering (80% of total progress)
                const renderProgress = (frame / totalFrames) * 80;
                onProgress(renderProgress);

                // Small delay to prevent UI blocking
                if (frame % 10 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 1));
                }
            }
        } finally {
            if (transparent) this.visualizer.setTransparentMode?.(false);
        }

        console.log(`Rendered ${totalFrames} PNG frames`);
    }

    private async canvasToPngBlob(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to convert canvas to PNG blob'));
                    }
                },
                'image/png',
                1.0
            ); // Maximum quality
        });
    }

    stop(): void {
        this.isGenerating = false;
        console.log('Image sequence generation stopped');
    }

    isGeneratingSequence(): boolean {
        return this.isGenerating;
    }
}

// Export for use in other modules
declare global {
    interface Window {
        ImageSequenceGenerator: typeof ImageSequenceGenerator;
    }
}

window.ImageSequenceGenerator = ImageSequenceGenerator;
