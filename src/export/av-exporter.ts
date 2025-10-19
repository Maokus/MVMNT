/**
 * AV Exporter
 * ---------------------------------------------
 * Produces an MP4 (or future alternative container) by combining a deterministic offline audio mix with
 * video frames rendered from the existing visualizer pipeline (canvas → WebCodecs via mediabunny).
 *
 * Key Guarantees:
 *  - Deterministic when `deterministicTiming` is true (tempo / tick mapping snapshot + pure offline mix).
 *  - Provides a reproducibility hash derived from canonical track + timing serialization.
 *  - Graceful degradation: if audio muxing or codec selection fails, returns a video-only blob plus a
 *    standalone WAV for UI download.
 *
 * Design Notes:
 *  - All bitrate / codec heuristics are encapsulated here to keep callers simple.
 *  - The class is intentionally stateful only during an active export (guarded by `isExporting`).
 *  - Future extensions (multi‑audio track, alternative containers) should isolate branching inside
 *    local helper sections instead of leaking flags into public API.
 *
 * Limitations / Current Assumptions:
 *  - Single mixed audio track (stereo) fed as one `AudioBuffer` (no per‑track metadata in container).
 *  - Canvas rendering assumed synchronous & side‑effect free for a given render time.
 *  - No adaptive chunk flushing: entire result buffered in memory (sufficient for short / mid‑length exports).
 */
import { offlineMix } from '@audio/offline-audio-mixer';
import { computeReproHash, normalizeTracksForHash } from './repro-hash';
import { ExportClock } from './export-clock';
import { createExportTimingSnapshot } from './export-timing-snapshot';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    AudioBufferSource,
    canEncodeVideo,
    canEncodeAudio,
    getEncodableVideoCodecs,
    getEncodableAudioCodecs,
} from 'mediabunny';
import { ensureMp3EncoderRegistered } from './mp3-encoder-loader';

// NOTE: MP3 encoder registration has been moved to a lazy path (`ensureMp3EncoderRegistered`) to avoid
// loading the WASM + encoder code during initial app load. See `mp3-encoder-loader.ts`.

// Helper: convert absolute timeline render time to zero-based encoding timestamp to avoid leading gaps.
function toEncodeTimestamp(absSeconds: number, exportStartSeconds: number): number {
    const rel = absSeconds - exportStartSeconds;
    return rel < 0 ? 0 : rel;
}

export interface AVExportOptions {
    fps?: number;
    width?: number;
    height?: number;
    sceneName?: string;
    // Optional explicit desired filename (used by caller when creating download link)
    filename?: string;
    startTick: number; // export range
    endTick: number;
    includeAudio?: boolean;
    deterministicTiming?: boolean;
    sampleRate?: number; // audio mix sample rate (default 48000)
    onProgress?: (p: number, text?: string) => void;
    onComplete?: (result: AVExportResult) => void;
    bitrate?: number;
    // Container & codec overrides. "auto" selects the best supported implementation (currently mp4/avc fallback).
    container?: 'auto' | 'mp4' | 'webm';
    videoCodec?: string; // 'auto' | specific (avc, hevc, av1, vp9)
    videoBitrateMode?: 'auto' | 'manual';
    videoBitrate?: number; // manual override (bps) when videoBitrateMode === 'manual'
    audioCodec?: string; // 'auto' | specific (aac, opus, etc.)
    audioBitrate?: number; // audio target bitrate (bps)
    audioSampleRate?: 'auto' | 44100 | 48000; // requested mix SR
    audioChannels?: 1 | 2; // channel layout (currently mix always produces 2 when channels=2)
}

export interface AVExportResult {
    videoBlob: Blob | null;
    audioBlob: Blob | null; // WAV or inside MP4
    combinedBlob?: Blob; // MP4 with audio when successful
    reproducibilityHash: string | null;
    mixPeak: number | null;
    durationSeconds: number;
}

export class AVExporter {
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

    async export(options: AVExportOptions): Promise<AVExportResult> {
        console.log('[AVExporter] Starting export with options', options);
        if (this.isExporting) throw new Error('AV export already in progress');
        this.isExporting = true;
        const {
            fps = 60,
            width = 1500,
            height = 1500,
            sceneName = 'My Scene',
            startTick,
            endTick,
            includeAudio = true,
            deterministicTiming = true,
            sampleRate = 48000,
            onProgress = () => {},
            onComplete = () => {},
            bitrate,
            container = 'auto',
            videoCodec = 'auto',
            videoBitrateMode = 'auto',
            videoBitrate,
            audioCodec = 'auto',
            audioBitrate,
            audioSampleRate = 'auto',
            audioChannels = 2,
        } = options;

        const originalWidth = this.canvas.width;
        const originalHeight = this.canvas.height;

        try {
            this.canvas.width = width;
            this.canvas.height = height;
            this.visualizer.resize(width, height);
            onProgress(0, 'Preparing export...');

            const tm = getSharedTimingManager();
            const ticksPerSecond = (tm.bpm * tm.ticksPerQuarter) / 60; // fallback formula if tm doesn't expose bpm property names
            const snapshot = deterministicTiming ? createExportTimingSnapshot(tm) : undefined;

            // Prepare audio mix
            let mixBlob: Blob | null = null; // separate WAV fallback / download
            let mixPeak: number | null = null;
            let mixDuration = (endTick - startTick) / ticksPerSecond;
            // Keep reference to raw mixed AudioBuffer so we can feed it into mediabunny directly
            let mixedAudioBuffer: AudioBuffer | null = null;
            let mixedAudioChannels = 2;
            if (includeAudio) {
                console.log('[AVExporter] Mixing audio for export range', startTick, 'to', endTick);
                onProgress(3, 'Mixing audio...');
                const s = useTimelineStore.getState();
                const mixRes = await offlineMix({
                    tracks: s.tracks,
                    tracksOrder: s.tracksOrder,
                    audioCache: s.audioCache,
                    startTick,
                    endTick,
                    ticksPerSecond,
                    sampleRate,
                    channels: 2,
                });
                mixPeak = mixRes.peak;
                mixDuration = mixRes.durationSeconds;
                mixedAudioBuffer = mixRes.buffer;
                mixedAudioChannels = mixRes.channels;
                if (mixRes.buffer.length === 0 || mixDuration === 0) {
                    console.warn(
                        '[AVExporter] Mixed audio buffer is empty (no audible tracks or zero-duration range). Video will have no audio.'
                    );
                }
                try {
                    // Provide separate WAV blob for UI download / fallback even if we mux successfully.
                    mixBlob = audioBufferToWavBlob(mixRes.buffer);
                } catch (e) {
                    console.warn('Failed to create WAV blob from mixed audio', e);
                }
                console.log('[AVExporter] Mixed audio buffer', mixRes.buffer, 'duration', mixDuration, 'peak', mixPeak);
            }

            // Derive nominal timeline duration from ticks (single-tempo approximation)
            const nominalDurationSeconds = (endTick - startTick) / ticksPerSecond;
            // If we have an audio mix and its measured duration differs (tempo changes, stretch, trailing silence trimmed)
            // prefer the actual audio duration so A/V lengths match. A mismatch leads to container timestamps that cause
            // the player to resample (pitch shift) or truncate/pad.
            let videoDurationSeconds = nominalDurationSeconds;
            if (includeAudio && mixedAudioBuffer) {
                const audioDuration = mixedAudioBuffer.duration; // high precision duration from WebAudio buffer
                if (Math.abs(audioDuration - nominalDurationSeconds) > 0.01) {
                    console.warn(
                        '[AVExporter] Adjusting video duration to match mixed audio duration',
                        'nominal=',
                        nominalDurationSeconds.toFixed(3),
                        'audio=',
                        audioDuration.toFixed(3)
                    );
                    videoDurationSeconds = audioDuration;
                }
            }
            const totalFrames = Math.ceil(videoDurationSeconds * fps);
            const clock = new ExportClock({ fps, timingSnapshot: snapshot as any });

            // Setup mediabunny output
            onProgress(8, 'Configuring video encoder...');
            // Container selection (currently mediabunny only exposes Mp4OutputFormat; future: WebMOutputFormat)
            let resolvedContainer: 'mp4' | 'webm' = 'mp4';
            if (container === 'webm') resolvedContainer = 'webm';
            // Video codec resolution
            // Resolve video codec. Accept user alias 'h264' which maps to internal 'avc'.
            let codecInput = videoCodec && videoCodec !== 'auto' ? videoCodec : 'avc';
            if (codecInput === 'h264') codecInput = 'avc';
            let codec: string = codecInput;
            if (!(await canEncodeVideo?.(codec as any))) {
                try {
                    const codecs = await (getEncodableVideoCodecs?.() as any);
                    if (Array.isArray(codecs) && codecs.length) codec = codecs[0];
                } catch {}
            }
            const target = new BufferTarget();
            // NOTE: Only mp4 implemented in current mediabunny build; webm path reserved for future addition.
            const output = new Output({ format: new Mp4OutputFormat(), target });
            // Bitrate handling & quality rationale:
            // Previous implementation hard-coded 100_000 bps (~0.1 Mbps) when user bitrate invalid, producing extreme macroblocking.
            // We now:
            //  1. Interpret small numeric values (< 500_000) as Kbps (common UX expectation) -> multiply by 1000.
            //  2. If no bitrate provided, compute a heuristic based on resolution & fps using bits-per-pixel-per-frame (bpppf).
            //     Typical high quality H.264 visually lossless for synthetic graphics ~0.09 bpppf.
            //     bitrate ≈ width * height * fps * bpppf.
            //  3. Clamp to sane bounds (0.5 Mbps – 80 Mbps) to avoid pathological values.
            const MIN_FALLBACK = 500_000; // 0.5 Mbps lower bound
            const MAX_FALLBACK = 80_000_000; // 80 Mbps upper bound to protect from runaway huge canvases
            const BPPPF = 0.09; // heuristic bits per pixel per frame
            function computeHeuristicBitrate(w: number, h: number, f: number) {
                const est = w * h * f * BPPPF; // bits per second
                return Math.min(Math.max(est, MIN_FALLBACK), MAX_FALLBACK);
            }
            let resolvedBitrate: number | undefined;
            // videoBitrateMode/manual takes precedence over legacy bitrate prop
            const userBitrateCandidate = videoBitrateMode === 'manual' ? videoBitrate : bitrate;
            if (
                typeof userBitrateCandidate === 'number' &&
                Number.isFinite(userBitrateCandidate) &&
                userBitrateCandidate > 0
            ) {
                resolvedBitrate = userBitrateCandidate < 500_000 ? userBitrateCandidate * 1000 : userBitrateCandidate; // treat as Kbps if suspiciously small
            } else {
                resolvedBitrate = computeHeuristicBitrate(width, height, fps);
                console.log('[AVExporter] Using heuristic video bitrate', Math.round(resolvedBitrate), 'bps');
            }
            resolvedBitrate = Math.round(Math.min(Math.max(resolvedBitrate, MIN_FALLBACK), MAX_FALLBACK));
            const videoSourceConfig: any = { codec: codec as any, bitrate: resolvedBitrate };
            if (resolvedBitrate <= 1_000_000) {
                console.warn(
                    '[AVExporter] Selected video bitrate is quite low (<=1 Mbps). Expect visible compression. bitrate=',
                    resolvedBitrate
                );
            }
            const canvasSource = new CanvasSource(this.canvas, videoSourceConfig);
            output.addVideoTrack(canvasSource);

            // Prepare audio track (correct mediabunny API using AudioBufferSource)
            let audioAdded = false;
            let audioSource: AudioBufferSource | null = null;
            if (includeAudio && mixedAudioBuffer) {
                onProgress(6, 'Preparing audio track...');
                try {
                    // Resolve audio codec
                    // Prefer aac by default now (UI default). 'auto' attempts aac → opus.
                    let resolvedAudioCodec: any = audioCodec && audioCodec !== 'auto' ? audioCodec : 'aac';
                    const preferOrder = ['aac', 'opus', 'vorbis', 'flac', 'pcm-s16'];
                    const supportedPreferred = await canEncodeAudio?.(resolvedAudioCodec as any).catch(() => false);
                    console.log('[AVExporter] Audio codec', resolvedAudioCodec, 'supported=', supportedPreferred);
                    if (!supportedPreferred) {
                        try {
                            const encodable = await (getEncodableAudioCodecs?.() as any);
                            const match = preferOrder.find((c) => encodable?.includes?.(c));
                            if (match) resolvedAudioCodec = match;
                            // If user explicitly requested mp3 or auto fallback includes it, attempt registration lazily
                            if (audioCodec === 'mp3' || encodable?.includes?.('mp3')) {
                                await ensureMp3EncoderRegistered();
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                    // If user explicitly selected mp3 (even if reported unsupported initially), attempt lazy registration before constructing source.
                    if (audioCodec === 'mp3') {
                        await ensureMp3EncoderRegistered();
                        resolvedAudioCodec = 'mp3';
                    }
                    // Choose sample rate
                    const resolvedSampleRate =
                        audioSampleRate === 'auto' ? mixedAudioBuffer.sampleRate : audioSampleRate;
                    const bitrateBps = typeof audioBitrate === 'number' && audioBitrate > 0 ? audioBitrate : 192_000; // sensible default
                    audioSource = new AudioBufferSource({
                        codec: resolvedAudioCodec,
                        numberOfChannels: mixedAudioChannels,
                        sampleRate: resolvedSampleRate,
                        bitrate: bitrateBps,
                    } as any);
                    output.addAudioTrack(audioSource as any);
                    audioAdded = true;
                } catch (e) {
                    console.warn(
                        'Failed to configure audio track – proceeding with video only (audio will be separate WAV)',
                        e
                    );
                }
            }

            await output.start();

            // Feed audio samples after output.start()
            if (audioAdded && audioSource && mixedAudioBuffer) {
                try {
                    onProgress(9, 'Encoding audio...');
                    await audioSource.add(mixedAudioBuffer);
                    audioSource.close();
                } catch (e) {
                    console.warn('Failed while adding mixed audio buffer – audio will be omitted from container', e);
                    audioAdded = false;
                }
            }

            onProgress(10, 'Rendering frames...');
            const exportStartSeconds = startTick / ticksPerSecond;
            for (let i = 0; i < totalFrames; i++) {
                const renderTime = clock.timeForFrame(i) + exportStartSeconds; // absolute scene time
                this.visualizer.renderAtTime(renderTime);
                const encodeTime = toEncodeTimestamp(renderTime, exportStartSeconds);
                await canvasSource.add(encodeTime, 1 / fps);
                if (i % 10 === 0) onProgress(10 + (i / totalFrames) * 80, 'Rendering frames...');
            }
            canvasSource.close();

            onProgress(92, 'Finalizing container...');
            await output.finalize();
            const raw = target.buffer;
            const videoBlob = raw ? new Blob([raw as ArrayBuffer], { type: 'video/mp4' }) : null;

            let combinedBlob: Blob | undefined = audioAdded ? videoBlob ?? undefined : undefined;
            if (includeAudio && !audioAdded) {
                console.warn('[AVExporter] Audio track not muxed into MP4. Providing separate WAV blob instead.');
            }

            // Compute reproducibility hash
            let reproducibilityHash: string | null = null;
            try {
                const s2 = useTimelineStore.getState();
                const normalizedTracks = normalizeTracksForHash(s2.tracks, s2.tracksOrder);
                reproducibilityHash = await computeReproHash({
                    version: (window as any).APP_VERSION || '0.0.0-dev',
                    tempoBPM: tm.bpm,
                    ppq: tm.ticksPerQuarter,
                    ticksPerSecond,
                    exportRange: { start: startTick, end: endTick },
                    tracks: normalizedTracks,
                    fps,
                });
            } catch (e) {
                console.warn('Failed to compute reproducibility hash', e);
            }

            const result: AVExportResult = {
                videoBlob,
                audioBlob: mixBlob,
                combinedBlob,
                reproducibilityHash,
                mixPeak,
                durationSeconds: mixDuration,
            };
            onProgress(100, 'Export complete');
            onComplete(result);
            return result;
        } finally {
            this.canvas.width = originalWidth;
            this.canvas.height = originalHeight;
            this.visualizer.resize(originalWidth, originalHeight);
            this.isExporting = false;
        }
    }
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    // 16-bit PCM WAV
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const format = 1; // PCM
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) >> 3;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    let offset = 0;
    function writeString(s: string) {
        for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
    }
    function writeUint32(v: number) {
        view.setUint32(offset, v, true);
        offset += 4;
    }
    function writeUint16(v: number) {
        view.setUint16(offset, v, true);
        offset += 2;
    }
    // RIFF header
    writeString('RIFF');
    writeUint32(totalSize - 8);
    writeString('WAVE');
    // fmt chunk
    writeString('fmt ');
    writeUint32(16); // PCM chunk size
    writeUint16(format);
    writeUint16(numChannels);
    writeUint32(sampleRate);
    writeUint32(byteRate);
    writeUint16(blockAlign);
    writeUint16(bitsPerSample);
    // data chunk
    writeString('data');
    writeUint32(dataSize);
    // Interleave samples
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));
    for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = channelData[ch][i];
            let s = Math.max(-1, Math.min(1, sample));
            s = s < 0 ? s * 0x8000 : s * 0x7fff;
            view.setInt16(offset, s, true);
            offset += 2;
        }
    }
    return new Blob([buf], { type: 'audio/wav' });
}

declare global {
    interface Window {
        AVExporter: typeof AVExporter;
    }
}
(window as any).AVExporter = AVExporter;
