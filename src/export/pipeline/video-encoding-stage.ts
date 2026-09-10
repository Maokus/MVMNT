/**
 * Encodes a video container by combining a deterministic offline audio mix with
 * video frames rendered from the existing visualizer pipeline (canvas → WebCodecs via mediabunny).
 *
 * Key Guarantees:
 *  - Deterministic when `deterministicTiming` is true (tempo / tick mapping snapshot + pure offline mix).
 *  - Provides a reproducibility hash derived from canonical track + timing serialization.
 *  - Streams the encoded container to Electron's native export destination.
 *
 * Limitations / Current Assumptions:
 *  - Single mixed audio track (stereo) fed as one `AudioBuffer` (no per‑track metadata in container).
 *  - Canvas rendering assumed synchronous & side‑effect free for a given render time.
 *  - Audio master and stem artifacts are passed to the desktop export sink separately.
 */
import { offlineMix } from '@audio/offline-audio-mixer';
import { computeReproHash, normalizeTracksForHash } from '../diagnostics/repro-hash';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    type Target,
    CanvasSource,
    AudioBufferSource,
    canEncodeVideo,
    canEncodeAudio,
    getEncodableVideoCodecs,
    getEncodableAudioCodecs,
} from 'mediabunny';
import { ensureMp3EncoderRegistered } from '../codecs/mp3-encoder-loader';
import { ensureAacEncoderRegistered } from '../codecs/aac-encoder-loader';
import { beginExportSurface, driveFrames } from './frame-driver';

// NOTE: MP3 encoder registration has been moved to a lazy path (`ensureMp3EncoderRegistered`) to avoid
// loading the WASM + encoder code during initial app load. See `mp3-encoder-loader.ts`.

// Helper: convert absolute timeline render time to zero-based encoding timestamp to avoid leading gaps.
function toEncodeTimestamp(absSeconds: number, exportStartSeconds: number): number {
    const rel = absSeconds - exportStartSeconds;
    return rel < 0 ? 0 : rel;
}

export interface VideoEncodingOptions {
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
    onComplete?: (result: VideoEncodingResult) => void;
    bitrate?: number;
    // Container & codec overrides. "auto" selects the best supported implementation (currently mp4/avc fallback).
    container?: 'auto' | 'mp4' | 'webm';
    videoCodec?: string; // 'auto' | specific (avc, hevc, av1, vp9)
    videoBitrateMode?: 'auto' | 'manual';
    videoBitrate?: number; // manual override (bps) when videoBitrateMode === 'manual'
    audioCodec?: string; // 'auto' | specific (mp3, opus, etc.)
    audioBitrate?: number; // audio target bitrate (bps)
    audioSampleRate?: 'auto' | 44100 | 48000; // requested mix SR
    audioChannels?: 1 | 2; // channel layout (currently mix always produces 2 when channels=2)
    outputTarget?: Target;
    signal?: AbortSignal;
    exportAudioMaster?: boolean;
    exportAudioStems?: boolean;
    audioWavBitDepth?: 16 | 24 | 32;
    normalizeAudio?: boolean;
    transparentBackground?: boolean;
}

export interface VideoEncodingArtifact {
    filename: string;
    blob: Blob;
}

export interface VideoEncodingResult {
    videoBlob: Blob | null;
    audioBlob: Blob | null; // WAV or inside MP4
    combinedBlob?: Blob; // MP4 with audio when successful
    reproducibilityHash: string | null;
    mixPeak: number | null;
    durationSeconds: number;
    frameCount: number;
    writtenToTarget: boolean;
    artifacts: VideoEncodingArtifact[];
}

export class VideoEncodingStage {
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

    async run(options: VideoEncodingOptions): Promise<VideoEncodingResult> {
        console.log('[VideoEncodingStage] Starting export with options', options);
        if (this.isExporting) throw new Error('Video encoding already in progress');
        this.isExporting = true;
        const {
            fps = 60,
            width = 1500,
            height = 1500,
            sceneName = 'My Scene',
            startTick,
            endTick,
            includeAudio = true,
            deterministicTiming: _deterministicTiming = true,
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
            outputTarget,
            signal,
            exportAudioMaster = false,
            exportAudioStems = false,
            audioWavBitDepth = 24,
            normalizeAudio = false,
            transparentBackground = false,
        } = options;

        const restoreSurface = beginExportSurface(this.canvas, this.visualizer, width, height, transparentBackground);

        try {
            onProgress(0, 'Preparing export...');

            const tm = getSharedTimingManager();
            const ticksPerSecond = (tm.bpm * tm.ticksPerQuarter) / 60; // kept for reproducibility hash
            const t2s = (ticks: number) => tm.ticksToSeconds(ticks);

            // Prepare audio mix
            let mixBlob: Blob | null = null; // separate WAV fallback / download
            let mixPeak: number | null = null;
            let mixDuration = t2s(endTick) - t2s(startTick);
            // Keep reference to raw mixed AudioBuffer so we can feed it into mediabunny directly
            let mixedAudioBuffer: AudioBuffer | null = null;
            const desiredMixChannels = (typeof audioChannels === 'number' ? audioChannels : 2) === 1 ? 1 : 2;
            const desiredMixSampleRate = audioSampleRate === 'auto' ? sampleRate : audioSampleRate;
            let mixedAudioChannels: 1 | 2 = desiredMixChannels;
            const artifacts: VideoEncodingArtifact[] = [];
            if (includeAudio) {
                console.log('[VideoEncodingStage] Mixing audio for export range', startTick, 'to', endTick);
                onProgress(3, 'Mixing audio...');
                const s = useTimelineStore.getState();
                const mixRes = await offlineMix({
                    tracks: s.tracks,
                    tracksOrder: s.tracksOrder,
                    audioCache: s.audioCache,
                    startTick,
                    endTick,
                    ticksPerSecond,
                    ticksToSeconds: t2s,
                    sampleRate: desiredMixSampleRate,
                    channels: desiredMixChannels,
                    normalize: normalizeAudio,
                });
                mixPeak = mixRes.peak;
                mixDuration = mixRes.durationSeconds;
                mixedAudioBuffer = mixRes.buffer;
                mixedAudioChannels = mixRes.channels === 1 ? 1 : 2;
                if (mixRes.buffer.length === 0 || mixDuration === 0) {
                    console.warn(
                        '[VideoEncodingStage] Mixed audio buffer is empty (no audible tracks or zero-duration range). Video will have no audio.'
                    );
                }
                try {
                    // Provide separate WAV blob for UI download / fallback even if we mux successfully.
                    mixBlob = audioBufferToWavBlob(mixRes.buffer, audioWavBitDepth);
                    if (exportAudioMaster) artifacts.push({ filename: 'master.wav', blob: mixBlob });
                } catch (e) {
                    console.warn('Failed to create WAV blob from mixed audio', e);
                }
                console.log(
                    '[VideoEncodingStage] Mixed audio buffer',
                    mixRes.buffer,
                    'duration',
                    mixDuration,
                    'peak',
                    mixPeak
                );

                if (exportAudioStems) {
                    let stemIndex = 0;
                    for (const trackId of s.tracksOrder) {
                        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
                        const track = s.tracks[trackId] as any;
                        if (!track || track.type !== 'audio') continue;
                        const stem = await offlineMix({
                            tracks: { [trackId]: track },
                            tracksOrder: [trackId],
                            audioCache: s.audioCache,
                            startTick,
                            endTick,
                            ticksPerSecond,
                            ticksToSeconds: t2s,
                            sampleRate: desiredMixSampleRate,
                            channels: desiredMixChannels,
                            normalize: normalizeAudio,
                        });
                        const safeName =
                            String(track.name || trackId)
                                .replace(/[^a-z0-9_.-]+/gi, '_')
                                .replace(/^_|_$/g, '') || `track_${stemIndex + 1}`;
                        artifacts.push({
                            filename: `${String(++stemIndex).padStart(2, '0')}_${safeName}.wav`,
                            blob: audioBufferToWavBlob(stem.buffer, audioWavBitDepth),
                        });
                    }
                }
            }

            // Derive nominal timeline duration from tempo-aware conversion
            const nominalDurationSeconds = t2s(endTick) - t2s(startTick);
            // If we have an audio mix and its measured duration differs (tempo changes, stretch, trailing silence trimmed)
            // prefer the actual audio duration so A/V lengths match. A mismatch leads to container timestamps that cause
            // the player to resample (pitch shift) or truncate/pad.
            let videoDurationSeconds = nominalDurationSeconds;
            if (includeAudio && mixedAudioBuffer) {
                const audioDuration = mixedAudioBuffer.duration; // high precision duration from WebAudio buffer
                if (Math.abs(audioDuration - nominalDurationSeconds) > 0.01) {
                    console.warn(
                        '[VideoEncodingStage] Adjusting video duration to match mixed audio duration',
                        'nominal=',
                        nominalDurationSeconds.toFixed(3),
                        'audio=',
                        audioDuration.toFixed(3)
                    );
                    videoDurationSeconds = audioDuration;
                }
            }
            const totalFrames = Math.ceil(videoDurationSeconds * fps);

            // Setup mediabunny output
            onProgress(8, 'Configuring video encoder...');
            // Transparent video requires WebM with VP9 alpha.
            let resolvedContainer: 'mp4' | 'webm' = transparentBackground
                ? 'webm'
                : container === 'webm'
                  ? 'webm'
                  : 'mp4';
            // Video codec resolution
            // Resolve video codec. Accept user alias 'h264' which maps to internal 'avc'. Prefer vp9 for webm.
            const defaultCodecForContainer = transparentBackground || resolvedContainer === 'webm' ? 'vp9' : 'avc';
            let codecInput = videoCodec && videoCodec !== 'auto' ? videoCodec : defaultCodecForContainer;
            if (codecInput === 'h264') codecInput = 'avc';
            let codec: string = codecInput;
            if (!(await canEncodeVideo?.(codec as any))) {
                try {
                    const codecs = await (getEncodableVideoCodecs?.() as any);
                    if (Array.isArray(codecs) && codecs.length) {
                        const mp4Priority = ['avc', 'h264', 'hevc', 'av1', 'vp9'];
                        const webmPriority = ['vp9', 'av1', 'avc', 'h264'];
                        const priority = resolvedContainer === 'webm' ? webmPriority : mp4Priority;
                        const match = priority.find((c) => codecs.includes(c));
                        codec = match || codecs[0];
                    }
                } catch {}
            }
            if (transparentBackground && codec !== 'vp9') {
                throw new Error('Transparent video export requires a VP9 encoder.');
            }
            if (!outputTarget) throw new Error('Desktop export requires a native output target.');
            const target = outputTarget;
            const outputFormat = resolvedContainer === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
            const output = new Output({ format: outputFormat, target });
            // Bitrate handling:
            // Prefer the numeric bitrate resolved by export planning, with a defensive fallback for direct stage use.
            const MIN_FALLBACK = 500_000; // 0.5 Mbps lower bound
            const MAX_FALLBACK = 80_000_000; // 80 Mbps upper bound to protect from runaway huge canvases
            const BPPPF = 0.09; // heuristic bits per pixel per frame
            function computeHeuristicBitrate(w: number, h: number, f: number) {
                const est = w * h * f * BPPPF; // bits per second
                return Math.min(Math.max(est, MIN_FALLBACK), MAX_FALLBACK);
            }
            let resolvedBitrate: number | undefined;
            const upstreamBitrateCandidate =
                typeof videoBitrate === 'number' && videoBitrate > 0
                    ? videoBitrate
                    : typeof bitrate === 'number' && bitrate > 0
                      ? bitrate
                      : null;
            if (upstreamBitrateCandidate != null) {
                resolvedBitrate = upstreamBitrateCandidate;
            } else {
                resolvedBitrate = computeHeuristicBitrate(width, height, fps);
                console.log('[VideoEncodingStage] Using heuristic video bitrate', Math.round(resolvedBitrate), 'bps');
            }
            resolvedBitrate = Math.round(Math.min(Math.max(resolvedBitrate, MIN_FALLBACK), MAX_FALLBACK));
            const videoSourceConfig: any = {
                codec: codec as any,
                bitrate: resolvedBitrate,
                alpha: transparentBackground ? 'keep' : 'discard',
            };
            if (resolvedBitrate <= 1_000_000) {
                console.warn(
                    '[VideoEncodingStage] Selected video bitrate is quite low (<=1 Mbps). Expect visible compression. bitrate=',
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
                    const defaultAudioCodec = resolvedContainer === 'webm' ? 'opus' : 'aac';
                    let resolvedAudioCodec: any = !audioCodec || audioCodec === 'auto' ? defaultAudioCodec : audioCodec;
                    const preferOrder =
                        resolvedContainer === 'webm'
                            ? ['opus', 'vorbis', 'flac', 'pcm-s16', 'mp3']
                            : ['aac', 'mp3', 'pcm-s16', 'opus', 'vorbis', 'flac'];
                    const resolvedSampleRate =
                        audioSampleRate === 'auto' ? mixedAudioBuffer.sampleRate : audioSampleRate;
                    const bitrateBps = typeof audioBitrate === 'number' && audioBitrate > 0 ? audioBitrate : 192_000; // sensible default
                    const capabilityOptions = {
                        numberOfChannels: mixedAudioChannels,
                        sampleRate: resolvedSampleRate,
                        bitrate: bitrateBps,
                    };
                    const supportedPreferred = await canEncodeAudio?.(
                        resolvedAudioCodec as any,
                        capabilityOptions
                    ).catch(() => false);
                    console.log(
                        '[VideoEncodingStage] Audio codec',
                        resolvedAudioCodec,
                        'supported=',
                        supportedPreferred,
                        capabilityOptions
                    );
                    if (!supportedPreferred) {
                        try {
                            const encodable = await (getEncodableAudioCodecs?.(undefined, capabilityOptions) as any);
                            const sanitized = Array.isArray(encodable)
                                ? encodable.filter((c): c is string => typeof c === 'string')
                                : [];
                            const match = preferOrder.find((c) => sanitized.includes(c));
                            if (match) resolvedAudioCodec = match;
                            // Lazily register encoders for codecs that need it
                            if (audioCodec === 'mp3' || encodable?.includes?.('mp3')) {
                                await ensureMp3EncoderRegistered();
                            }
                            if (audioCodec === 'aac' || encodable?.includes?.('aac')) {
                                await ensureAacEncoderRegistered();
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                    // If user explicitly selected mp3 or aac, attempt lazy registration before constructing source.
                    if (audioCodec === 'mp3') {
                        await ensureMp3EncoderRegistered();
                        resolvedAudioCodec = 'mp3';
                    }
                    if (audioCodec === 'aac' || resolvedAudioCodec === 'aac') {
                        await ensureAacEncoderRegistered();
                        resolvedAudioCodec = 'aac';
                    }
                    // Choose sample rate
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
            const exportStartSeconds = t2s(startTick);
            await driveFrames(
                {
                    startSeconds: exportStartSeconds,
                    fps,
                    frameCount: totalFrames,
                    signal,
                    prepareFrame: (seconds, signal) => this.visualizer.prepareFrame(seconds, signal),
                    renderAtTime: (seconds) => this.visualizer.renderAtTime(seconds),
                },
                async (_frameIndex, renderTime, _encodeTime, frameDuration) => {
                    await canvasSource.add(toEncodeTimestamp(renderTime, exportStartSeconds), frameDuration);
                },
                (completed) => onProgress(10 + (completed / totalFrames) * 80, 'Rendering frames...')
            );
            canvasSource.close();

            onProgress(92, 'Finalizing container...');
            await output.finalize();
            const videoBlob = null;
            const combinedBlob: Blob | undefined = undefined;
            if (includeAudio && !audioAdded) {
                const containerLabel = resolvedContainer.toUpperCase();
                console.warn(
                    `[VideoEncodingStage] Audio track not muxed into ${containerLabel}. Providing separate WAV blob instead.`
                );
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

            const result: VideoEncodingResult = {
                videoBlob,
                audioBlob: mixBlob,
                combinedBlob,
                reproducibilityHash,
                mixPeak,
                durationSeconds: mixDuration,
                frameCount: totalFrames,
                writtenToTarget: true,
                artifacts,
            };
            onProgress(100, 'Export complete');
            onComplete(result);
            return result;
        } finally {
            restoreSurface();
            this.isExporting = false;
        }
    }
}

export function audioBufferToWavBlob(buffer: AudioBuffer, bitsPerSample: 16 | 24 | 32 = 16): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const format = 1; // PCM
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
            if (bitsPerSample === 16) {
                s = s < 0 ? s * 0x8000 : s * 0x7fff;
                view.setInt16(offset, s, true);
                offset += 2;
            } else if (bitsPerSample === 24) {
                const value = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
                view.setUint8(offset, value & 0xff);
                view.setUint8(offset + 1, (value >> 8) & 0xff);
                view.setUint8(offset + 2, (value >> 16) & 0xff);
                offset += 3;
            } else {
                const value = Math.round(s < 0 ? s * 0x80000000 : s * 0x7fffffff);
                view.setInt32(offset, value, true);
                offset += 4;
            }
        }
    }
    return new Blob([buf], { type: 'audio/wav' });
}
