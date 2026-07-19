import { useTimelineStore } from '@state/timelineStore';
import type { AudioCacheEntry } from '@audio/audioTypes';
import { encodeAudioBufferToWavFloat32 } from '@audio/wav/encode-audio-buffer';
import { sha256Hex } from '@utils/hash/sha256';
import { serializeStable } from './stable-stringify';
import { strToU8 } from 'fflate';
import { AudioAssetStore } from './audio-asset-store';
import { findReferencedAudioSourceIds, getAudioClipsForTrack } from '@state/timeline/audioClips';

export type AssetStorageMode = 'zip-package';

export interface AudioAssetRecord {
    kind: 'original' | 'wav';
    filename?: string;
    mimeType: string;
    byteLength: number;
    hash: string;
    durationSeconds: number;
    sampleRate: number;
    channels: number;
    durationSamples: number;
    /** @deprecated Legacy inline JSON payload data. */
    dataBase64?: string;
}

export interface WaveformDataReference {
    type: 'float32';
    filename: string;
    valueCount: number;
}

export interface WaveformAssetRecord {
    version: 1;
    channelPeaks?: number[];
    sampleStep: number;
    channelCount?: number;
    dataRef?: WaveformDataReference;
}

export interface WaveformAssetReference {
    version: 1;
    assetId: string;
    assetRef: string;
}

export type WaveformExportRecord = WaveformAssetRecord | WaveformAssetReference;

export interface CollectedAudioAssets {
    audioById: Record<string, AudioAssetRecord>;
    waveforms?: { byAudioId: Record<string, WaveformExportRecord> };
    audioIdMap: Record<string, string>;
    assetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
    waveformAssetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
    totalBytes: number;
    warnings: string[];
    missingIds: string[];
}

export interface CollectAssetsOptions {
    onProgress?: (value: number, label?: string) => void;
}

const MIME_EXT: Record<string, string> = {
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/wave': '.wav',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
};

const WAVEFORM_ASSET_FILENAME = 'waveform.json';
const WAVEFORM_BINARY_FILENAME = 'waveform.f32';

function sanitizeFilename(name: string, fallback: string): string {
    const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
    const noSpaces = cleaned.replace(/\s+/g, '_');
    const trimmed = noSpaces || fallback;
    return trimmed.slice(0, 180);
}

function inferFilename(baseId: string, mimeType: string, originalName?: string): string {
    if (originalName) {
        const safe = sanitizeFilename(originalName, baseId);
        if (safe.lastIndexOf('.') > 0) return safe;
        const ext = MIME_EXT[mimeType] || '';
        return safe + ext;
    }
    const ext = MIME_EXT[mimeType] || '.bin';
    return sanitizeFilename(baseId, 'audio') + ext;
}

function findCacheIdForReferencedAudioSource(
    sourceId: string,
    state: ReturnType<typeof useTimelineStore.getState>,
    unreferencedCacheIds: string[]
): string {
    if (state.audioCache[sourceId]) {
        return sourceId;
    }

    const hashMatch = unreferencedCacheIds.find((cacheId) => state.audioCache[cacheId]?.originalFile?.hash === sourceId);
    if (hashMatch) {
        return hashMatch;
    }

    return unreferencedCacheIds.length === 1 ? unreferencedCacheIds[0] : sourceId;
}

async function resolveBytes(entry: AudioCacheEntry, sourceId: string): Promise<{
    bytes: Uint8Array;
    mimeType: string;
    kind: 'original' | 'wav';
    filename: string;
}> {
    if (entry.originalFile?.bytes && entry.originalFile.byteLength > 0) {
        const mimeType = entry.originalFile.mimeType || 'application/octet-stream';
        const filename = inferFilename(sourceId, mimeType, entry.originalFile.name);
        return { bytes: entry.originalFile.bytes, mimeType, kind: 'original', filename };
    }
    if (entry.originalFile?.assetId && entry.originalFile.byteLength > 0) {
        const stored = await AudioAssetStore.get(entry.originalFile.assetId);
        if (stored) {
            const mimeType = entry.originalFile.mimeType || 'application/octet-stream';
            const filename = inferFilename(sourceId, mimeType, entry.originalFile.name);
            return { bytes: new Uint8Array(stored), mimeType, kind: 'original', filename };
        }
    }
    if (!entry.audioBuffer) {
        throw new Error(`Audio source ${sourceId} has no decoded buffer or readable original asset`);
    }
    const wavBytes = encodeAudioBufferToWavFloat32(entry.audioBuffer);
    const mimeType = 'audio/wav';
    const filename = inferFilename(sourceId, mimeType, undefined);
    return { bytes: wavBytes, mimeType, kind: 'wav', filename };
}

export async function collectAudioAssets(options: CollectAssetsOptions): Promise<CollectedAudioAssets> {
    const state = useTimelineStore.getState();
    const referencedIds = findReferencedAudioSourceIds(state);

    const audioById: Record<string, AudioAssetRecord> = {};
    const waveforms: Record<string, WaveformExportRecord> = {};
    const assetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const waveformAssetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const audioIdMap: Record<string, string> = {};
    const warnings: string[] = [];
    const missingIds: string[] = [];

    let processed = 0;
    let totalBytes = 0;
    const unreferencedCacheIds = Object.keys(state.audioCache).filter((id) => !referencedIds.has(id));
    for (const audioId of referencedIds) {
        processed++;
        options.onProgress?.(processed / Math.max(1, referencedIds.size), `Preparing audio ${audioId}`);
        const fallbackCacheId = findCacheIdForReferencedAudioSource(audioId, state, unreferencedCacheIds);
        const entry = state.audioCache[fallbackCacheId];
        if (!entry) {
            missingIds.push(audioId);
            continue;
        }
        const { bytes, mimeType, kind, filename } = await resolveBytes(entry, audioId);
        const hash = await sha256Hex(bytes);
        if (entry.originalFile) {
            entry.originalFile.hash = hash;
            entry.originalFile.byteLength = entry.originalFile.byteLength || bytes.byteLength;
        }
        let record = audioById[hash];
        if (!record) {
            record = {
                kind,
                filename,
                mimeType,
                byteLength: bytes.byteLength,
                hash,
                durationSeconds: entry.durationSeconds ?? entry.audioBuffer?.duration ?? 0,
                sampleRate: entry.sampleRate,
                channels: entry.channels,
                durationSamples: entry.durationSamples ?? entry.audioBuffer?.length ?? 0,
            };
            audioById[hash] = record;
            assetPayloads.set(hash, { bytes, filename, mimeType });
            totalBytes += bytes.byteLength;
        } else {
            if (!record.filename && filename) record.filename = filename;
            if (record.kind === 'wav' && kind === 'original') record.kind = 'original';
        }
        audioIdMap[audioId] = hash;
        if (entry.waveform?.channelPeaks && entry.waveform.channelPeaks.length > 0) {
            const peaksArray = entry.waveform.channelPeaks;
            const sampleStep = entry.waveform.sampleStep;
            const channelCount = entry.channels ?? 1;
            {
                const assetId = hash;
                const assetRef = `assets/waveforms/${assetId}/${WAVEFORM_ASSET_FILENAME}`;
                const valueCount = peaksArray.length;
                const metadata: WaveformAssetRecord = {
                    version: 1,
                    sampleStep,
                    channelCount,
                    dataRef: {
                        type: 'float32',
                        filename: WAVEFORM_BINARY_FILENAME,
                        valueCount,
                    },
                };
                waveforms[hash] = { version: 1, assetId, assetRef };
                const payloadJson = serializeStable(metadata);
                waveformAssetPayloads.set(`${assetId}/${WAVEFORM_ASSET_FILENAME}`, {
                    bytes: strToU8(payloadJson, true),
                    filename: WAVEFORM_ASSET_FILENAME,
                    mimeType: 'application/json',
                });
                const buffer = peaksArray.buffer.slice(
                    peaksArray.byteOffset,
                    peaksArray.byteOffset + peaksArray.byteLength,
                );
                waveformAssetPayloads.set(`${assetId}/${WAVEFORM_BINARY_FILENAME}`, {
                    bytes: new Uint8Array(buffer),
                    filename: WAVEFORM_BINARY_FILENAME,
                    mimeType: 'application/octet-stream',
                });
            }
        }
    }

    return {
        audioById,
        waveforms: Object.keys(waveforms).length ? { byAudioId: waveforms } : undefined,
        audioIdMap,
        assetPayloads,
        waveformAssetPayloads,
        totalBytes,
        warnings,
        missingIds,
    };
}
