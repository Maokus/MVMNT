// Video Exporter (mediabunny based)
// Migrated from the previous ffmpeg.wasm implementation to mediabunny for
// hardware accelerated (WebCodecs) encoding directly in the browser.
// The public API is intentionally kept the same so existing callers keep working.

import SimulatedClock from '@export/simulated-clock';
import { createExportTimingSnapshot, type ExportTimingSnapshot } from '@export/export-timing-snapshot';
import { getSharedTimingManager } from '@state/timelineStore';
import {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    QUALITY_HIGH,
    canEncodeVideo,
    getEncodableVideoCodecs,
} from 'mediabunny';

export interface VideoExportOptions {
    fps?: number;
    width?: number;
    height?: number;
    sceneName?: string;
    maxFrames?: number | null;
    onProgress?: (progress: number, text?: string) => void;
    onComplete?: (blob: Blob) => void;
    _startFrame?: number; // internal start frame when exporting a range
    bitrate?: number; // explicit target bitrate in bps (overrides quality preset)
    qualityPreset?: 'low' | 'medium' | 'high';
    deterministicTiming?: boolean; // default true – snapshot tempo map at start
}

interface InternalFrameData {
    frameNumber: number;
    blob: Blob;
}

export class VideoExporter {
    private canvas: HTMLCanvasElement;
    private visualizer: any;
    private isExporting = false;
    private frames: InternalFrameData[] = [];

    constructor(canvas: HTMLCanvasElement, visualizer: any) {
        this.canvas = canvas;
        this.visualizer = visualizer;
    }

    isBusy() {
        return this.isExporting;
    }

    async exportVideo(options: VideoExportOptions = {}): Promise<void> {
        const {
            fps = 60,
            width = 1500,
            height = 1500,
            sceneName = 'My Scene',
            maxFrames = null,
            onProgress = () => {},
            onComplete = () => {},
            _startFrame = 0,
            bitrate,
            qualityPreset = 'high',
            deterministicTiming = true,
        } = options;

        if (this.isExporting) throw new Error('Video export already in progress');
        this.isExporting = true;
        this.frames = [];

        const originalWidth = this.canvas.width;
        const originalHeight = this.canvas.height;

        try {
            // Resize for export resolution
            this.canvas.width = width;
            this.canvas.height = height;
            this.visualizer.resize(width, height);

            // Determine duration & frame count
            const duration = this.visualizer.getCurrentDuration
                ? this.visualizer.getCurrentDuration()
                : this.visualizer.duration;
            const totalFrames = Math.ceil(duration * fps);
            const actualMaxFrames = maxFrames || totalFrames;
            const limitedFrames = Math.min(totalFrames - _startFrame, actualMaxFrames);

            onProgress(0, 'Preparing encoder...');

            // Decide on codec (prefer avc, else first encodable fall-back)
            let codec: string = 'avc';
            if (!(await canEncodeVideo?.(codec as any))) {
                try {
                    const codecs = await (getEncodableVideoCodecs?.() as any);
                    if (Array.isArray(codecs) && codecs.length) codec = codecs[0];
                } catch {
                    /* ignore */
                }
            }

            // mediabunny Output setup
            const target = new BufferTarget();
            const output = new Output({ format: new Mp4OutputFormat(), target });
            // Determine bitrate: explicit overrides preset; else map preset -> mediabunny heuristic
            // QUALITY_HIGH may be an enum/opaque value; use simple numeric fallbacks if arithmetic not allowed.
            const presetMap: Record<string, number> = {
                low: 1_000_000, // 1 Mbps
                medium: 4_000_000, // 4 Mbps
                high: 8_000_000, // 8 Mbps default
            };
            const chosenBitrate =
                typeof bitrate === 'number' && bitrate > 0 ? bitrate : presetMap[qualityPreset] || presetMap.high;

            const canvasSource = new CanvasSource(this.canvas, {
                codec: codec as any,
                bitrate: chosenBitrate as any,
            });
            output.addVideoTrack(canvasSource);
            await output.start();

            // Phase 1: Render + encode frames progressively (0-95%)
            const total = limitedFrames;
            const frameDuration = 1 / fps;
            const prePadding = (() => {
                try {
                    return this.visualizer?.getSceneBuilder?.()?.getSceneSettings?.().prePadding || 0;
                } catch {
                    return 0;
                }
            })();
            const playRangeStart = (() => {
                try {
                    const pr = this.visualizer?.getPlayRange?.();
                    if (pr && typeof pr.startSec === 'number') return pr.startSec as number;
                    return 0;
                } catch {
                    return 0;
                }
            })();

            // Create timing snapshot if deterministic export requested
            let snapshot: ExportTimingSnapshot | undefined;
            if (deterministicTiming) {
                try {
                    const tm = getSharedTimingManager();
                    snapshot = createExportTimingSnapshot(tm);
                } catch (e) {
                    console.warn('Failed to create export timing snapshot; continuing without determinism', e);
                }
            }

            const clock = new SimulatedClock({
                fps,
                prePaddingSec: prePadding,
                playRangeStartSec: playRangeStart,
                startFrame: _startFrame,
                timingSnapshot: snapshot,
            });
            for (let i = 0; i < total; i++) {
                const currentTime = clock.timeForFrame(i);
                this.visualizer.renderAtTime(currentTime);
                // Add frame directly from canvas – timestamp sec, duration sec
                await canvasSource.add(currentTime, frameDuration);
                if (i % 10 === 0) {
                    const prog = i / total;
                    onProgress(prog * 95, 'Rendering & encoding frames...');
                }
            }
            canvasSource.close();

            // Phase 2: Finalize (95-100%)
            onProgress(97, 'Finalizing video...');
            await output.finalize();
            const raw = target.buffer;
            if (!raw) throw new Error('No video data produced');
            const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
            const videoBlob = new Blob([u8.buffer], { type: 'video/mp4' });
            onProgress(100, 'Video ready');
            this.downloadBlob(videoBlob, `${sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_video.mp4`);
            onComplete(videoBlob);
        } catch (err) {
            console.error('Video export failed', err);
            throw err;
        } finally {
            // Cleanup
            this.frames = [];
            // restore canvas
            this.canvas.width = originalWidth;
            this.canvas.height = originalHeight;
            this.visualizer.resize(originalWidth, originalHeight);
            this.isExporting = false;
        }
    }

    // Legacy leftover methods (now unused) intentionally removed to reduce bundle size.

    private downloadBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

declare global {
    interface Window {
        VideoExporter: typeof VideoExporter;
    }
}
(window as any).VideoExporter = VideoExporter;
