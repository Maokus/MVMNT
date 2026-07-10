import type { AudioCacheEntry } from './audioTypes';
import type { AudioFeatureCache, AudioFeatureTrackData } from './features/audioFeatureTypes';

export const AUDIO_IMPORT_WARNING_BYTES = 1.5 * 1024 * 1024 * 1024;
export const AUDIO_IMPORT_DANGER_BYTES = 2.5 * 1024 * 1024 * 1024;

export interface AudioFileEstimate {
    fileName: string;
    fileBytes: number;
    decodedPcmBytes?: number;
    retainedHeapBytes?: number;
    durationSeconds?: number;
    sampleRate?: number;
    channels?: number;
    bitsPerSample?: number;
    format: 'wav' | 'unknown';
    warning?: string;
}

export interface AudioImportBatchEstimate {
    fileCount: number;
    fileBytes: number;
    decodedPcmBytes: number;
    retainedHeapBytes: number;
    files: AudioFileEstimate[];
    severity: 'ok' | 'warning' | 'danger';
}

export interface TimelineAudioMemorySummary {
    sourceCount: number;
    decodedPcmBytes: number;
    originalFileBytes: number;
    waveformBytes: number;
    featureCacheBytes: number;
    retainedAudioBytes: number;
    browserHeapUsedBytes?: number;
    browserHeapLimitBytes?: number;
}

const FLOAT32_BYTES = 4;

function isWavFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return file.type === 'audio/wav' || file.type === 'audio/x-wav' || name.endsWith('.wav') || name.endsWith('.wave');
}

function readAscii(view: DataView, offset: number, length: number): string {
    let result = '';
    for (let index = 0; index < length && offset + index < view.byteLength; index += 1) {
        result += String.fromCharCode(view.getUint8(offset + index));
    }
    return result;
}

function parseWavHeader(buffer: ArrayBuffer): Omit<AudioFileEstimate, 'fileName' | 'fileBytes' | 'format'> | null {
    const view = new DataView(buffer);
    if (view.byteLength < 44 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
        return null;
    }

    let offset = 12;
    let channels: number | undefined;
    let sampleRate: number | undefined;
    let bitsPerSample: number | undefined;
    let dataBytes: number | undefined;

    while (offset + 8 <= view.byteLength) {
        const chunkId = readAscii(view, offset, 4);
        const chunkSize = view.getUint32(offset + 4, true);
        const dataOffset = offset + 8;
        if (chunkId === 'fmt ' && dataOffset + 16 <= view.byteLength) {
            channels = view.getUint16(dataOffset + 2, true);
            sampleRate = view.getUint32(dataOffset + 4, true);
            bitsPerSample = view.getUint16(dataOffset + 14, true);
        } else if (chunkId === 'data') {
            dataBytes = chunkSize;
        }
        offset = dataOffset + chunkSize + (chunkSize % 2);
    }

    if (!channels || !sampleRate || !bitsPerSample || !dataBytes) {
        return null;
    }

    const bytesPerSampleFrame = channels * Math.max(1, bitsPerSample / 8);
    const durationSeconds = dataBytes / bytesPerSampleFrame / sampleRate;
    return {
        decodedPcmBytes: Math.ceil(durationSeconds * sampleRate * channels * FLOAT32_BYTES),
        durationSeconds,
        sampleRate,
        channels,
        bitsPerSample,
    };
}

export async function estimateAudioFileMemory(file: File): Promise<AudioFileEstimate> {
    if (!isWavFile(file)) {
        return {
            fileName: file.name,
            fileBytes: file.size,
            retainedHeapBytes: file.size,
            format: 'unknown',
            warning: 'decoded PCM size unknown until browser decode completes',
        };
    }

    const header = await file.slice(0, 256 * 1024).arrayBuffer();
    const parsed = parseWavHeader(header);
    if (!parsed?.decodedPcmBytes) {
        return {
            fileName: file.name,
            fileBytes: file.size,
            decodedPcmBytes: file.size * 2,
            retainedHeapBytes: file.size * 3,
            format: 'wav',
            warning: 'WAV header incomplete; using conservative estimate',
        };
    }

    return {
        fileName: file.name,
        fileBytes: file.size,
        ...parsed,
        retainedHeapBytes: file.size + parsed.decodedPcmBytes,
        format: 'wav',
    };
}

export async function estimateAudioImportBatch(files: File[]): Promise<AudioImportBatchEstimate> {
    const estimates = await Promise.all(files.map((file) => estimateAudioFileMemory(file)));
    const fileBytes = estimates.reduce((sum, file) => sum + file.fileBytes, 0);
    const decodedPcmBytes = estimates.reduce((sum, file) => sum + (file.decodedPcmBytes ?? 0), 0);
    const retainedAudioBytes = estimates.reduce((sum, file) => sum + (file.retainedHeapBytes ?? file.fileBytes), 0);
    return {
        fileCount: estimates.length,
        fileBytes,
        decodedPcmBytes,
        retainedHeapBytes: retainedAudioBytes,
        files: estimates,
        severity:
            retainedAudioBytes >= AUDIO_IMPORT_DANGER_BYTES
                ? 'danger'
                : retainedAudioBytes >= AUDIO_IMPORT_WARNING_BYTES
                  ? 'warning'
                  : 'ok',
    };
}

export function estimateAudioBufferBytes(buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels'>): number {
    return buffer.length * buffer.numberOfChannels * FLOAT32_BYTES;
}

function typedArrayBytes(value: unknown): number {
    if (ArrayBuffer.isView(value)) {
        return value.byteLength;
    }
    return 0;
}

function estimateFeatureTrackDataBytes(data: AudioFeatureTrackData | undefined): number {
    if (!data) return 0;
    if (ArrayBuffer.isView(data)) {
        return data.byteLength;
    }
    return typedArrayBytes(data.min) + typedArrayBytes(data.max);
}

export function estimateFeatureCacheBytes(cache: AudioFeatureCache | undefined): number {
    if (!cache) return 0;
    return Object.values(cache.featureTracks ?? {}).reduce(
        (sum, track) => sum + estimateFeatureTrackDataBytes(track?.data),
        0
    );
}

export function summarizeAudioMemory(
    audioCache: Record<string, AudioCacheEntry>,
    audioFeatureCaches: Record<string, AudioFeatureCache>
): TimelineAudioMemorySummary {
    let decodedPcmBytes = 0;
    let originalFileBytes = 0;
    let waveformBytes = 0;
    for (const entry of Object.values(audioCache ?? {})) {
        if (!entry) continue;
        decodedPcmBytes += estimateAudioBufferBytes(entry.audioBuffer);
        originalFileBytes += entry.originalFile?.byteLength ?? entry.originalFile?.bytes?.byteLength ?? 0;
        waveformBytes += entry.waveform?.channelPeaks?.byteLength ?? 0;
    }
    const featureCacheBytes = Object.values(audioFeatureCaches ?? {}).reduce(
        (sum, cache) => sum + estimateFeatureCacheBytes(cache),
        0
    );
    const memory = typeof performance !== 'undefined' ? (performance as Performance & {
        memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
    }).memory : undefined;
    return {
        sourceCount: Object.keys(audioCache ?? {}).length,
        decodedPcmBytes,
        originalFileBytes,
        waveformBytes,
        featureCacheBytes,
        retainedAudioBytes: decodedPcmBytes + originalFileBytes + waveformBytes + featureCacheBytes,
        browserHeapUsedBytes: memory?.usedJSHeapSize,
        browserHeapLimitBytes: memory?.jsHeapSizeLimit,
    };
}

export function formatBytes(bytes: number | undefined): string {
    if (!bytes || !Number.isFinite(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Math.abs(bytes);
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const signed = bytes < 0 ? '-' : '';
    const digits = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${signed}${value.toFixed(digits)} ${units[unitIndex]}`;
}
