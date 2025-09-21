// AV Exporter (Phase 4)
// Combines offline audio mix (deterministic) with video frames rendered using existing visualizer pipeline.
// Uses mediabunny Output. If direct raw PCM ingestion not supported by current mediabunny build, falls back
// to delivering separate WAV blob & video blob to caller.
//
// Limitations:
//  - Current mediabunny typings (if any) may not expose addAudioTrack(AudioSource). We'll feature-detect.
//  - If audio mux unsupported, we still provide reproducibility hash and offline audio buffer.
//
// Fallback Strategy:
//  - Provide { videoBlob, audioBlob, combinedBlob?: Blob } to caller.
//  - combinedBlob present only if mux succeeded.
//
// Determinism:
//  - Timing snapshot used for consistent frame->time mapping when deterministicTiming = true.
//  - Audio mix uses offlineMix pure function.
//
import { offlineMix } from './offline-audio-mixer';
import { computeReproHash, normalizeTracksForHash } from './repro-hash';
import SimulatedClock from './simulated-clock';
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
    startTick: number; // export range
    endTick: number;
    includeAudio?: boolean;
    deterministicTiming?: boolean;
    sampleRate?: number; // audio mix sample rate (default 48000)
    onProgress?: (p: number, text?: string) => void;
    onComplete?: (result: AVExportResult) => void;
    bitrate?: number;
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

            // Derive frame count from duration vs fps
            const durationSeconds = (endTick - startTick) / ticksPerSecond;
            const totalFrames = Math.ceil(durationSeconds * fps);
            const clock = new SimulatedClock({ fps, timingSnapshot: snapshot as any });

            // Setup mediabunny output
            onProgress(8, 'Configuring video encoder...');
            let codec: string = 'avc';
            if (!(await canEncodeVideo?.(codec as any))) {
                try {
                    const codecs = await (getEncodableVideoCodecs?.() as any);
                    if (Array.isArray(codecs) && codecs.length) codec = codecs[0];
                } catch {}
            }
            const target = new BufferTarget();
            const output = new Output({ format: new Mp4OutputFormat(), target });
            // Validate bitrate: mediabunny expects a positive integer (bps) or a quality token. If invalid/undefined, omit so library uses its own default.
            let videoSourceConfig: any = { codec: codec as any };
            if (typeof bitrate === 'number' && Number.isFinite(bitrate) && bitrate > 0) {
                // Round to integer just in case a float slipped through
                videoSourceConfig.bitrate = Math.round(bitrate);
            } else if (bitrate != null) {
                console.warn('[AVExporter] Ignoring invalid bitrate value', bitrate, '– using library default.');
            }
            const canvasSource = new CanvasSource(this.canvas, videoSourceConfig);
            output.addVideoTrack(canvasSource);

            // Prepare audio track (correct mediabunny API using AudioBufferSource)
            let audioAdded = false;
            let audioSource: AudioBufferSource | null = null;
            if (includeAudio && mixedAudioBuffer) {
                onProgress(6, 'Preparing audio track...');
                try {
                    // Choose preferred audio codec (attempt aac -> opus -> mp3 -> pcm-s16)
                    let audioCodec: any = 'aac';
                    const preferOrder = ['aac', 'opus', 'mp3', 'vorbis', 'flac', 'pcm-s16'];
                    // Verify support for preferred codec; if not, ask mediabunny for available audio codecs
                    const supportedPreferred = await canEncodeAudio?.(audioCodec as any).catch(() => false);
                    if (!supportedPreferred) {
                        try {
                            const encodable = await (getEncodableAudioCodecs?.() as any);
                            const match = preferOrder.find((c) => encodable?.includes?.(c));
                            if (match) audioCodec = match;
                        } catch {
                            /* ignore */
                        }
                    }
                    const bitrateBps = 192_000; // sensible default for music
                    audioSource = new AudioBufferSource({
                        codec: audioCodec,
                        numberOfChannels: mixedAudioChannels,
                        sampleRate: mixedAudioBuffer.sampleRate,
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
