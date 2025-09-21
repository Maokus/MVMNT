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

// Helper: shift absolute render time to zero-based encode timeline so exported MP4 starts at 0.
function computeEncodeTimestamp(renderTime: number, playRangeStartSec: number): number {
    const t = renderTime - playRangeStartSec;
    return t < 0 ? 0 : t; // clamp small negatives due to FP rounding
}

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
    includeAudio?: boolean; // new Phase 4 option (false preserves previous behavior)
    startTick?: number; // optional explicit range (when includeAudio true & using AVExporter)
    endTick?: number;
    // Extended (Phase 5 UI upgrade): advanced A/V controls. Not all combinations currently supported by mediabunny build.
    // container: 'auto' selects MP4 today; placeholder for future WebM pipeline once available.
    container?: 'auto' | 'mp4' | 'webm';
    // videoCodec: 'auto' tries H.264/AVC then falls back to first encodable codec reported by mediabunny.
    videoCodec?: string; // 'auto' | concrete codec id (e.g. 'avc', 'hevc', 'av1', 'vp9')
    // videoBitrateMode: when 'manual', use videoBitrate (bps) > legacy bitrate > preset; when 'auto' use preset or heuristic downstream.
    videoBitrateMode?: 'auto' | 'manual';
    videoBitrate?: number; // manual override (bps) when videoBitrateMode === 'manual'
    // Advanced audio fields are passed through only when includeAudio + AVExporter path; video-only exporter ignores them presently.
    audioCodec?: string; // 'auto' | specific (aac, opus, etc.)
    audioBitrate?: number; // target audio bitrate (bps)
    audioSampleRate?: 'auto' | 44100 | 48000; // mixing / encode SR preference
    audioChannels?: 1 | 2; // channel layout
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
            includeAudio = false,
            startTick,
            endTick,
            container = 'auto',
            videoCodec = 'auto',
            videoBitrateMode = 'auto',
            videoBitrate,
            audioCodec = 'auto',
            audioBitrate,
            audioSampleRate = 'auto',
            audioChannels = 2,
        } = options;

        if (this.isExporting) throw new Error('Video export already in progress');
        this.isExporting = true;
        this.frames = [];

        const originalWidth = this.canvas.width;
        const originalHeight = this.canvas.height;

        try {
            // Resolve current playback range (seconds) up-front (needed both for frame logic & optional audio delegation)
            const pr = this.visualizer?.getPlayRange?.();
            const playRangeStartSec = pr && typeof pr.startSec === 'number' ? pr.startSec : 0;
            const playRangeEndSec = pr && typeof pr.endSec === 'number' ? pr.endSec : null; // may be null (open ended)

            // Phase 4 / Audio delegation strategy:
            // 1. If caller explicitly passed startTick/endTick we trust and delegate.
            // 2. Else if includeAudio true but ticks not supplied, derive them from playback range seconds.
            //    We use shared timing manager (tempo + PPQ) to convert seconds -> ticks so that
            //    AVExporter can leverage offline deterministic mix.
            let derivedStartTick: number | undefined = startTick;
            let derivedEndTick: number | undefined = endTick;
            if (includeAudio && (typeof derivedStartTick !== 'number' || typeof derivedEndTick !== 'number')) {
                try {
                    const tm = getSharedTimingManager();
                    // ticksPerSecond = (bpm * ticksPerQuarter)/60 (same formula as av-exporter)
                    const ticksPerSecond = (tm.bpm * tm.ticksPerQuarter) / 60;
                    derivedStartTick = Math.round(playRangeStartSec * ticksPerSecond);
                    // If explicit endSec not defined, fall back to (start + getCurrentDuration()) so export matches visual length
                    const effectiveEndSec =
                        playRangeEndSec != null
                            ? playRangeEndSec
                            : playRangeStartSec + (this.visualizer.getCurrentDuration?.() || 0);
                    derivedEndTick = Math.round(effectiveEndSec * ticksPerSecond);
                } catch (e) {
                    console.warn('Failed to derive ticks for audio export; continuing without audio delegation', e);
                }
            }

            // If audio delegation possible, hand off to AVExporter before continuing with video-only path.
            if (includeAudio && typeof derivedStartTick === 'number' && typeof derivedEndTick === 'number') {
                try {
                    const { AVExporter } = window as any;
                    if (AVExporter) {
                        onProgress(0, 'Delegating to AV exporter...');
                        const av = new AVExporter(this.canvas, this.visualizer);
                        const result = await av.export({
                            fps,
                            width,
                            height,
                            sceneName,
                            startTick: derivedStartTick,
                            endTick: derivedEndTick,
                            includeAudio: true,
                            deterministicTiming,
                            bitrate, // legacy support
                            container,
                            videoCodec,
                            videoBitrateMode,
                            videoBitrate,
                            audioCodec,
                            audioBitrate,
                            audioSampleRate,
                            audioChannels,
                            onProgress: (p: number, text?: string) => onProgress(p, text),
                        });
                        if (result.combinedBlob) {
                            this.downloadBlob(
                                result.combinedBlob,
                                `${sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_av.mp4`
                            );
                            onComplete(result.combinedBlob);
                            return;
                        } else if (result.videoBlob) {
                            // fallback: deliver video only (separate audio returned separately if UI wants to prompt)
                            this.downloadBlob(
                                result.videoBlob,
                                `${sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_video.mp4`
                            );
                            onComplete(result.videoBlob);
                            return;
                        }
                    } else {
                        console.warn(
                            'AVExporter not found on window – audio will be omitted from MP4 (video-only export). Ensure av-exporter bundle is imported.'
                        );
                        onProgress(0, 'Audio exporter unavailable; continuing with video-only export');
                    }
                } catch (e) {
                    console.warn('AV exporter delegation failed, falling back to video-only path', e);
                }
            }
            // Resize for export resolution
            this.canvas.width = width;
            this.canvas.height = height;
            // Derive total frames from current visualizer duration (external playback range aware)
            const durationSec = this.visualizer.getCurrentDuration?.() || 0;
            const totalFrames = Math.ceil(durationSec * fps);
            const actualMaxFrames = maxFrames || totalFrames;
            const limitedFrames = Math.min(totalFrames - _startFrame, actualMaxFrames);

            onProgress(0, 'Preparing encoder...');

            // Decide on codec (prefer avc, else first encodable fall-back)
            // Container currently fixed to mp4 for mediabunny; webm reserved for future.
            // Resolve video codec (allow user override)
            let codec: string = videoCodec && videoCodec !== 'auto' ? videoCodec : 'avc';
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
                // prePadding removed (kept var for compatibility if downstream expects key)
                high: 8_000_000, // 8 Mbps default
            };
            // Manual bitrate overrides preset. videoBitrateMode/manual > legacy bitrate > preset.
            let chosenBitrate: number;
            if (videoBitrateMode === 'manual' && typeof videoBitrate === 'number' && videoBitrate > 0) {
                chosenBitrate = videoBitrate;
            } else if (typeof bitrate === 'number' && bitrate > 0) {
                chosenBitrate = bitrate;
            } else {
                chosenBitrate = presetMap[qualityPreset] || presetMap.high;
            }

            const canvasSource = new CanvasSource(this.canvas, {
                codec: codec as any,
                bitrate: chosenBitrate as any,
            });
            output.addVideoTrack(canvasSource);
            await output.start();

            // Render + encode frames progressively (0-95%)
            const total = limitedFrames;
            const frameDuration = 1 / fps;
            const prePadding = 0; // padding removed
            // Use the previously resolved playback range start (playRangeStartSec). This ensures consistency
            // with any tick derivation we may have just performed.
            const playRangeStart = playRangeStartSec;

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
                playRangeStartSec: playRangeStart,
                startFrame: _startFrame,
                timingSnapshot: snapshot,
            });
            for (let i = 0; i < total; i++) {
                const renderTime = clock.timeForFrame(i); // absolute timeline time (includes play range start)
                this.visualizer.renderAtTime(renderTime);
                // IMPORTANT: Pass a zero-based timestamp to encoder to avoid leading blank gap when playRangeStart > 0.
                // Previously we supplied absolute renderTime which caused MP4 timelines to have an initial gap (black frames / silence).
                const encodeTimestamp = computeEncodeTimestamp(renderTime, playRangeStart);
                await canvasSource.add(encodeTimestamp, frameDuration);
                if (i % 10 === 0) {
                    const prog = i / total;
                    onProgress(prog * 95, 'Rendering & encoding frames...');
                }
            }
            canvasSource.close();

            // Finalize (95-100%)
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

    // Removed unused methods to reduce bundle size.

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
