// Video Exporter (mediabunny based)
// Uses mediabunny/WebCodecs in Electron's renderer and streams output through
// the native desktop export sink.

import { ExportClock } from '@export/export-clock';
import { createExportTimingSnapshot, type ExportTimingSnapshot } from '@export/export-timing-snapshot';
import { getSharedTimingManager } from '@state/timelineStore';
import {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    type Target,
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
    onComplete?: (blob: Blob | null) => void;
    _startFrame?: number; // internal start frame when exporting a range
    bitrate?: number; // explicit target bitrate in bps (overrides quality preset)
    qualityPreset?: 'low' | 'medium' | 'high';
    deterministicTiming?: boolean; // default true – snapshot tempo map at start
    includeAudio?: boolean; // when true, delegate to AVExporter for combined audio+video if ticks resolvable
    startTick?: number; // optional explicit range (when includeAudio true & using AVExporter)
    endTick?: number;
    // Advanced A/V controls. Some combinations may not yet be supported by the underlying encoder build.
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
    container?: 'auto' | 'mp4' | 'webm';
    outputTarget?: Target;
    signal?: AbortSignal;
    exportAudioMaster?: boolean;
    exportAudioStems?: boolean;
    onArtifacts?: (artifacts: Array<{ filename: string; blob: Blob }>) => void | Promise<void>;
    audioWavBitDepth?: 16 | 24 | 32;
    normalizeAudio?: boolean;
    transparentBackground?: boolean;
}

export class VideoExporter {
    private canvas: HTMLCanvasElement;
    private visualizer: any;
    private isExporting = false;

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
            videoCodec = 'auto',
            videoBitrateMode = 'auto',
            videoBitrate,
            audioCodec = 'auto',
            audioBitrate,
            audioSampleRate = 'auto',
            audioChannels = 2,
            container = 'mp4',
            outputTarget,
            signal,
            exportAudioMaster = false,
            exportAudioStems = false,
            onArtifacts,
            audioWavBitDepth = 24,
            normalizeAudio = false,
            transparentBackground = false,
        } = options;

        if (this.isExporting) throw new Error('Video export already in progress');
        this.isExporting = true;

        // Alpha is supported by the WebM/VP9 pipeline, not MP4/H.264.
        const effectiveContainer: 'mp4' | 'webm' = transparentBackground ? 'webm' : container === 'webm' ? 'webm' : 'mp4';

        const originalWidth = this.canvas.width;
        const originalHeight = this.canvas.height;

        try {
            // Resolve current playback range (seconds) up-front (needed both for frame logic & optional audio delegation)
            const pr = this.visualizer?.getPlayRange?.();
            const playRangeStartSec = pr && typeof pr.startSec === 'number' ? pr.startSec : 0;
            const playRangeEndSec = pr && typeof pr.endSec === 'number' ? pr.endSec : null; // may be null (open ended)

            // Audio delegation strategy:
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
                            container: effectiveContainer,
                            videoCodec,
                            videoBitrateMode,
                            videoBitrate,
                            audioCodec,
                            audioBitrate,
                            audioSampleRate,
                            audioChannels,
                            onProgress: (p: number, text?: string) => onProgress(p, text),
                            outputTarget,
                            signal,
                            exportAudioMaster,
                            exportAudioStems,
                            audioWavBitDepth,
                            normalizeAudio,
                            transparentBackground,
                        });
                        if (result.artifacts.length > 0) await onArtifacts?.(result.artifacts);
                        if (result.writtenToTarget) {
                            onComplete(null);
                            return;
                        }
                        if (result.combinedBlob || result.videoBlob) {
                            throw new Error('Desktop export did not receive a native output target.');
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

            // Decide on codec (prefer avc/vp9 based on container, else first encodable fall-back)
            // Resolve video codec (allow user override). Accept alias 'h264' → 'avc'.
            const defaultCodecForContainer = transparentBackground || effectiveContainer === 'webm' ? 'vp9' : 'avc';
            let codecInput = videoCodec && videoCodec !== 'auto' ? videoCodec : defaultCodecForContainer;
            if (codecInput === 'h264') codecInput = 'avc';
            let codec: string = codecInput;
            if (!(await canEncodeVideo?.(codec as any))) {
                try {
                    const codecs = await (getEncodableVideoCodecs?.() as any);
                    if (Array.isArray(codecs) && codecs.length) {
                        const mp4Priority = ['avc', 'h264', 'hevc', 'av1', 'vp9'];
                        const webmPriority = ['vp9', 'av1', 'avc', 'h264'];
                        const priority = effectiveContainer === 'webm' ? webmPriority : mp4Priority;
                        const match = priority.find((c) => codecs.includes(c));
                        codec = match || codecs[0];
                    }
                } catch {
                    /* ignore */
                }
            }
            if (transparentBackground && codec !== 'vp9') {
                throw new Error('Transparent video export requires a VP9 encoder.');
            }

            // mediabunny Output setup
            if (!outputTarget) throw new Error('Desktop export requires a native output target.');
            const target = outputTarget;
            const outputFormat = effectiveContainer === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
            const output = new Output({ format: outputFormat, target });
            // Determine bitrate: explicit overrides preset; else map preset -> mediabunny heuristic
            // QUALITY_HIGH may be an enum/opaque value; use simple numeric fallbacks if arithmetic not allowed.
            const presetMap: Record<string, number> = {
                low: 1_000_000, // 1 Mbps – lightweight / preview quality
                medium: 4_000_000, // 4 Mbps – good balance for social sharing
                // prePadding removed (kept var for compatibility if downstream expects key)
                high: 8_000_000, // 8 Mbps default for visually lossless exports
            };
            // Prefer explicit bitrate supplied by caller (RenderModal now resolves presets into numeric values).
            let chosenBitrate: number;
            if (typeof videoBitrate === 'number' && videoBitrate > 0) {
                chosenBitrate = videoBitrate;
            } else if (typeof bitrate === 'number' && bitrate > 0) {
                chosenBitrate = bitrate;
            } else {
                chosenBitrate = presetMap[qualityPreset] || presetMap.high;
            }

            const canvasSource = new CanvasSource(this.canvas, {
                codec: codec as any,
                bitrate: chosenBitrate as any,
                alpha: transparentBackground ? 'keep' : 'discard',
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

            const clock = new ExportClock({
                fps,
                playRangeStartSec: playRangeStart,
                startFrame: _startFrame,
                timingSnapshot: snapshot,
            });
            // CanvasSource can retain alpha, but only if the renderer clears rather than paints the scene background.
            // Keep this scoped to export so preview rendering remains unchanged afterwards.
            if (transparentBackground) this.visualizer.setTransparentMode?.(true);
            try {
                for (let i = 0; i < total; i++) {
                    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
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
            } finally {
                if (transparentBackground) this.visualizer.setTransparentMode?.(false);
            }
            canvasSource.close();

            // Finalize (95-100%)
            onProgress(97, 'Finalizing video...');
            await output.finalize();
            onProgress(100, 'Video ready');
            onComplete(null);
        } catch (err) {
            console.error('Video export failed', err);
            throw err;
        } finally {
            // Cleanup
            // restore canvas
            this.canvas.width = originalWidth;
            this.canvas.height = originalHeight;
            this.visualizer.resize(originalWidth, originalHeight);
            this.isExporting = false;
        }
    }

}

declare global {
    interface Window {
        VideoExporter: typeof VideoExporter;
    }
}
(window as any).VideoExporter = VideoExporter;
