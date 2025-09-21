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
    canEncodeVideo,
    getEncodableVideoCodecs,
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
            let mixBlob: Blob | null = null;
            let mixPeak: number | null = null;
            let mixDuration = (endTick - startTick) / ticksPerSecond;
            if (includeAudio) {
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
                mixBlob = audioBufferToWavBlob(mixRes.buffer);
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
            const canvasSource = new CanvasSource(this.canvas, { codec: codec as any, bitrate: bitrate as any });
            output.addVideoTrack(canvasSource);

            // Try to add audio track if supported and we have audio
            let audioAdded = false;
            if (includeAudio && mixBlob) {
                try {
                    // naive approach: create a simple AudioBuffer-like source if mediabunny exposes addAudioTrack
                    // For forward compatibility we check existence
                    // @ts-ignore
                    if (typeof output.addAudioTrack === 'function') {
                        // Convert WAV blob to ArrayBuffer -> PCM frames extraction delegated to mediabunny
                        // @ts-ignore
                        output.addAudioTrack(mixBlob, { sampleRate });
                        audioAdded = true;
                    }
                } catch (e) {
                    console.warn('Audio muxing not supported; falling back to separate blobs', e);
                }
            }

            await output.start();

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

            let combinedBlob: Blob | undefined;
            if (audioAdded && videoBlob) {
                combinedBlob = videoBlob; // audio already inside
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
