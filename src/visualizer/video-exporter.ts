// Video Exporter using @ffmpeg/ffmpeg new API (no createFFMPEG)
// Mirrors the behavior of ImageSequenceGenerator but outputs MP4 video.

import { toBlobURL } from '@ffmpeg/util';
import { FFmpeg } from '@ffmpeg/ffmpeg';

export interface VideoExportOptions {
    fps?: number;
    width?: number;
    height?: number;
    sceneName?: string;
    maxFrames?: number | null;
    onProgress?: (progress: number, text?: string) => void;
    onComplete?: (blob: Blob) => void;
    _startFrame?: number; // internal start frame when exporting a range
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
    private ffmpeg: FFmpeg | null = null;
    private loadPromise: Promise<void> | null = null;

    constructor(canvas: HTMLCanvasElement, visualizer: any) {
        this.canvas = canvas;
        this.visualizer = visualizer;
    }

    isBusy() {
        return this.isExporting;
    }

    async ensureFFmpeg(onProgress?: (p: number, text?: string) => void) {
        if (this.loadPromise) return this.loadPromise;
        this.ffmpeg = new FFmpeg();
        const coreVersion = '0.12.6';
        const baseURL = `https://unpkg.com/@ffmpeg/core@${coreVersion}/dist/esm`;
        const loadParams = {
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        };
        this.loadPromise = (async () => {
            onProgress?.(0, 'Loading ffmpeg core...');
            await this.ffmpeg!.load(loadParams);
            onProgress?.(0, 'ffmpeg loaded');
        })();
        return this.loadPromise;
    }

    async exportVideo(options: VideoExportOptions = {}): Promise<void> {
        const {
            fps = 30,
            width = 1500,
            height = 1500,
            sceneName = 'My Scene',
            maxFrames = null,
            onProgress = () => {},
            onComplete = () => {},
            _startFrame = 0,
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

            onProgress(0, 'Preparing ffmpeg...');
            await this.ensureFFmpeg(onProgress);
            const ffmpeg = this.ffmpeg!;

            // Phase 1: Render frames (0-40%)
            await this.renderFrames(fps, limitedFrames, _startFrame, (p, txt) => onProgress(p * 40, txt));

            // Phase 2: Write frames into ffmpeg FS (40-50%)
            onProgress(40, 'Writing frames to virtual FS');
            let i = 0;
            for (const frame of this.frames) {
                const arrayBuffer = await frame.blob.arrayBuffer();
                await ffmpeg.writeFile(`frame_${String(i).padStart(5, '0')}.png`, new Uint8Array(arrayBuffer));
                i++;
                if (i % 10 === 0) onProgress(40 + (i / this.frames.length) * 10, 'Writing frames...');
            }

            // Phase 3: Run ffmpeg to encode (50-99%)
            const outputName = 'output.mp4';
            const inputPattern = 'frame_%05d.png';
            // Attach progress listener
            // Attach progress listener only once per instance
            if (!(ffmpeg as any)._progressAttached) {
                ffmpeg.on('progress', (e: any) => {
                    const prog = typeof e?.progress === 'number' ? e.progress : 0;
                    const encProgress = 50 + prog * 49; // up to 99
                    onProgress(encProgress, 'Encoding video...');
                });
                (ffmpeg as any)._progressAttached = true;
            }
            // Run
            await ffmpeg.exec([
                '-framerate',
                String(fps),
                '-i',
                inputPattern,
                '-c:v',
                'libx264',
                '-preset',
                'ultrafast',
                '-pix_fmt',
                'yuv420p',
                '-movflags',
                '+faststart',
                outputName,
            ]);

            // Phase 4: Read result (99-100%)
            onProgress(99, 'Finalizing video...');
            const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
            // Cast to any to satisfy TS in browser context
            const videoBlob = new Blob([data as any], { type: 'video/mp4' });
            onProgress(100, 'Video ready');
            this.downloadBlob(videoBlob, `${sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.mp4`);
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

    private async renderFrames(
        fps: number,
        totalFrames: number,
        startFrame: number,
        progress: (p: number, t?: string) => void
    ) {
        const frameInterval = 1 / fps;
        for (let i = 0; i < totalFrames; i++) {
            const currentTime = (i + startFrame) * frameInterval;
            this.visualizer.renderAtTime(currentTime);
            const blob = await this.canvasToPngBlob();
            this.frames.push({ frameNumber: i, blob });
            if (i % 10 === 0) progress(i / totalFrames, 'Rendering frames...');
        }
        progress(1, 'Frames rendered');
    }

    private async canvasToPngBlob(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))), 'image/png', 1.0);
        });
    }

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
