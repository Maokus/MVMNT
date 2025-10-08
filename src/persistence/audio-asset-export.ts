import { useTimelineStore } from '@state/timelineStore';
import type { AudioCacheEntry } from '@audio/audioTypes';
import { encodeAudioBufferToWavFloat32 } from '@audio/wav/encode-audio-buffer';
import { uint8ArrayToBase64 } from '@utils/base64';
import { sha256Hex } from '@utils/hash/sha256';
import { serializeStable } from './stable-stringify';
import { strToU8 } from 'fflate';

export type AssetStorageMode =
    | 'zip-package'
    | /** @deprecated Legacy inline JSON exports are deprecated. Use packaged exports instead. */ 'inline-json';

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

export interface WaveformAssetRecord {
    version: 1;
    channelPeaks: number[];
    sampleStep: number;
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
    inlineRejected?: boolean;
    inlineOversizedAssets?: string[];
}

export interface CollectAssetsOptions {
    mode: AssetStorageMode;
    maxInlineBytes: number;
    inlineWarnBytes: number;
    maxInlineAssetBytes: number;
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
    const wavBytes = encodeAudioBufferToWavFloat32(entry.audioBuffer);
    const mimeType = 'audio/wav';
    const filename = inferFilename(sourceId, mimeType, undefined);
    return { bytes: wavBytes, mimeType, kind: 'wav', filename };
}

export async function collectAudioAssets(options: CollectAssetsOptions): Promise<CollectedAudioAssets> {
    const state = useTimelineStore.getState();
    const referencedIds = new Set<string>();
    for (const id of state.tracksOrder) {
        const track = state.tracks[id] as any;
        if (!track || track.type !== 'audio') continue;
        const audioId = track.audioSourceId || id;
        referencedIds.add(audioId);
    }

    const audioById: Record<string, AudioAssetRecord> = {};
    const waveforms: Record<string, WaveformExportRecord> = {};
    const assetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const waveformAssetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const audioIdMap: Record<string, string> = {};
    const warnings: string[] = [];
    const missingIds: string[] = [];
    const oversizedInlineAssets: string[] = [];

    let processed = 0;
    let totalBytes = 0;
    for (const audioId of referencedIds) {
        processed++;
        options.onProgress?.(processed / Math.max(1, referencedIds.size), `Preparing audio ${audioId}`);
        const entry = state.audioCache[audioId];
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
                durationSeconds: entry.durationSeconds ?? entry.audioBuffer.duration,
                sampleRate: entry.sampleRate,
                channels: entry.channels,
                durationSamples: entry.durationSamples ?? entry.audioBuffer.length,
            };
            if (options.mode === 'inline-json') {
                if (bytes.byteLength > options.maxInlineAssetBytes) {
                    oversizedInlineAssets.push(audioId);
                }
                record.dataBase64 = uint8ArrayToBase64(bytes);
            }
            audioById[hash] = record;
            assetPayloads.set(hash, { bytes, filename, mimeType });
            totalBytes += bytes.byteLength;
        } else {
            if (!record.filename && filename) record.filename = filename;
            if (record.kind === 'wav' && kind === 'original') record.kind = 'original';
        }
        audioIdMap[audioId] = hash;
        if (entry.waveform?.channelPeaks && entry.waveform.channelPeaks.length > 0) {
            const waveformRecord: WaveformAssetRecord = {
                version: 1,
                channelPeaks: Array.from(entry.waveform.channelPeaks),
                sampleStep: entry.waveform.sampleStep,
            };
            if (options.mode === 'zip-package') {
                const assetId = hash;
                const assetRef = `assets/waveforms/${assetId}/${WAVEFORM_ASSET_FILENAME}`;
                waveforms[hash] = { version: 1, assetId, assetRef };
                const payloadJson = serializeStable(waveformRecord);
                waveformAssetPayloads.set(assetId, {
                    bytes: strToU8(payloadJson, true),
                    filename: WAVEFORM_ASSET_FILENAME,
                    mimeType: 'application/json',
                });
            } else {
                waveforms[hash] = waveformRecord;
            }
        }
    }

    if (options.mode === 'inline-json') {
        if (totalBytes > options.inlineWarnBytes) {
            warnings.push(
                `Inline audio payload is ${(totalBytes / (1024 * 1024)).toFixed(1)} MB which exceeds the warning threshold.`
            );
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
        inlineRejected: options.mode === 'inline-json' && totalBytes > options.maxInlineBytes,
        inlineOversizedAssets: oversizedInlineAssets.length ? oversizedInlineAssets : undefined,
    };
}
