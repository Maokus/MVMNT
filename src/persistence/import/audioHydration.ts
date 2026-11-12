import { measureProjectLoadWork } from '@utils/projectLoadDiagnostics';
import { decodeAudioSource } from '@audio/decode-audio-source';
import type { SceneExportEnvelope } from '../export';
import { AudioAssetStore, createAudioAssetId } from '../audio-asset-store';
import { sha256Hex } from '@utils/hash/sha256';
import { decodeSceneText } from '../scene-package';
import { getTimelineMutationGeneration, useTimelineStore } from '@state/timelineStore';
import { findReferencedAudioSourceIds, getAudioClipsForTrack } from '@state/timeline/audioClips';
import type { AudioCacheEntry } from '@audio/audioTypes';
import { throwIfImportAborted as throwIfAborted } from '../import-abort';
import type { ImportSceneOptions } from './contracts';

const WAVEFORM_ASSET_FILENAME = 'waveform.json';
const INLINE_ORIGINAL_FILE_LIMIT_BYTES = 16 * 1024 * 1024;

export { createAudioBufferFromAsset } from '@audio/decode-audio-source';

export function buildLightweightAudioCacheEntry(
    record: any,
    originalFile: {
        name?: string;
        mimeType: string;
        bytes?: Uint8Array;
        byteLength: number;
        hash?: string;
        assetId?: string;
        storage?: 'indexeddb' | 'memory' | 'inline' | 'missing';
    }
) {
    const durationSeconds = typeof record.durationSeconds === 'number' ? record.durationSeconds : 0;
    const sampleRate = typeof record.sampleRate === 'number' ? record.sampleRate : 44100;
    const channels = typeof record.channels === 'number' ? record.channels : 1;
    const durationSamples =
        typeof record.durationSamples === 'number'
            ? record.durationSamples
            : Math.max(0, Math.round(durationSeconds * sampleRate));
    return {
        durationSeconds,
        durationSamples,
        sampleRate,
        channels,
        originalFile,
        decodedState: 'deferred' as const,
        decodedFailureReason: undefined,
    };
}

export function buildWaveform(record: any | undefined) {
    if (!record || !Number.isFinite(record.sampleStep) || record.sampleStep <= 0) return undefined;
    const channelPeaks =
        record.channelPeaks instanceof Float32Array ? record.channelPeaks : new Float32Array(record.channelPeaks ?? []);
    if (!channelPeaks.length || !channelPeaks.every(Number.isFinite)) return undefined;
    return { version: 1 as const, channelPeaks, sampleStep: record.sampleStep };
}

export function resolveWaveformRecord(
    waveforms: Record<string, any>,
    assetId: string,
    waveformPayloads: Map<string, Map<string, Uint8Array>>,
    warnings: string[]
): any | undefined {
    const entry = waveforms[assetId];
    if (!entry) return undefined;
    if (entry && typeof entry === 'object' && 'channelPeaks' in entry) {
        return entry;
    }
    if (entry && typeof entry === 'object' && 'assetRef' in entry) {
        const waveformAssetId = typeof (entry as any).assetId === 'string' ? (entry as any).assetId : assetId;
        const payloadGroup = waveformPayloads.get(waveformAssetId);
        if (!payloadGroup) {
            warnings.push(`Missing waveform payload for asset ${assetId}`);
            return undefined;
        }
        try {
            const metadataBytes = payloadGroup.get(WAVEFORM_ASSET_FILENAME);
            if (!metadataBytes) {
                warnings.push(`Missing waveform metadata for asset ${assetId}`);
                return undefined;
            }
            const metadata = JSON.parse(decodeSceneText(metadataBytes));
            if (metadata?.dataRef && typeof metadata.dataRef === 'object') {
                const ref = metadata.dataRef as { filename?: string; valueCount?: number };
                const filename = typeof ref.filename === 'string' ? ref.filename : undefined;
                if (!filename) {
                    warnings.push(`Waveform metadata missing filename for asset ${assetId}`);
                    return undefined;
                }
                const binary = payloadGroup.get(filename);
                if (!binary) {
                    warnings.push(`Missing waveform data file ${filename} for asset ${assetId}`);
                    return undefined;
                }
                const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
                const values = new Float32Array(buffer);
                const expected = typeof ref.valueCount === 'number' ? ref.valueCount : values.length;
                if (values.length < expected) {
                    warnings.push(`Waveform data truncated for asset ${assetId}`);
                }
                const channelPeaks = values.slice(0, expected);
                metadata.channelPeaks = channelPeaks;
                delete metadata.dataRef;
            }
            return metadata;
        } catch (error) {
            warnings.push(`Failed to parse waveform payload for asset ${assetId}: ${(error as Error).message}`);
            return undefined;
        }
    }
    return undefined;
}

export function findAudioAssetIdForReferencedSource(
    sourceId: string,
    state: ReturnType<typeof useTimelineStore.getState>,
    assetIds: string[],
    audioById: Record<string, any>
): string | undefined {
    if (audioById[sourceId]) {
        return sourceId;
    }

    return assetIds.length === 1 ? assetIds[0] : undefined;
}

export function isAudioHydrationStillCurrent(expectedGeneration: number): boolean {
    return getTimelineMutationGeneration() === expectedGeneration;
}

export function shouldHydrateAudioSource(
    sourceId: string,
    state: ReturnType<typeof useTimelineStore.getState>
): boolean {
    return Boolean(state.audioCache[sourceId]) || findReferencedAudioSourceIds(state).has(sourceId);
}

export async function hydrateAudioAssets(
    envelope: SceneExportEnvelope,
    assetPayloads: Map<string, Uint8Array>,
    waveformPayloads: Map<string, Map<string, Uint8Array>>,
    options: ImportSceneOptions = {},
    expectedTimelineGeneration = getTimelineMutationGeneration()
): Promise<string[]> {
    const warnings: string[] = [];
    const audioById = envelope.assets?.audio?.byId || {};
    const waveforms = envelope.assets?.waveforms?.byAudioId || {};
    const { useTimelineStore } = (await import('@state/timelineStore')) as typeof import('@state/timelineStore');
    const ingest = useTimelineStore.getState().ingestAudioToCache;
    const audioIdMap: Record<string, string> = Object.keys(envelope.references?.audioIdMap || {}).length
        ? { ...envelope.references!.audioIdMap! }
        : {};
    const assetIds = Object.keys(audioById);
    const timelineState = useTimelineStore.getState();
    for (const sourceId of findReferencedAudioSourceIds(timelineState)) {
        if (audioIdMap[sourceId]) continue;
        const assetId = findAudioAssetIdForReferencedSource(sourceId, timelineState, assetIds, audioById);
        if (assetId) {
            audioIdMap[sourceId] = assetId;
        }
    }
    for (const assetId of assetIds) {
        if (!Object.values(audioIdMap).includes(assetId)) {
            audioIdMap[assetId] = assetId;
        }
    }

    const assetData = new Map<string, { record: any; bytes: Uint8Array }>();
    for (const [assetId, record] of Object.entries(audioById)) {
        throwIfAborted(options.signal);
        let bytes: Uint8Array | undefined;
        if (assetPayloads.has(assetId)) {
            bytes = assetPayloads.get(assetId)!;
        }
        if (!bytes) {
            warnings.push(`Missing audio payload for asset ${assetId}`);
            continue;
        }
        if (record.byteLength && bytes.byteLength !== record.byteLength) {
            warnings.push(
                `Byte length mismatch for asset ${assetId} (expected ${record.byteLength}, got ${bytes.byteLength})`
            );
        }
        assetData.set(assetId, { record, bytes });
    }

    // Publish bounds for every referenced source before work that can take a
    // noticeable amount of time (hashing, IndexedDB writes, or decoding). This
    // lets the timeline render all of its loading placeholders at once.
    const pendingAudioCache: Record<string, AudioCacheEntry> = {};
    for (const [originalId, assetId] of Object.entries(audioIdMap)) {
        const payload = assetData.get(assetId);
        if (!payload || pendingAudioCache[originalId]) continue;
        pendingAudioCache[originalId] = {
            ...buildLightweightAudioCacheEntry(payload.record, {
                name: payload.record.filename,
                mimeType: payload.record.mimeType,
                byteLength: payload.bytes.byteLength,
                hash: payload.record.hash,
                storage: 'missing',
            }),
            decodedState: 'decoding',
            decodedFailureReason: undefined,
        };
    }
    useTimelineStore.setState((state) => {
        if (!isAudioHydrationStillCurrent(expectedTimelineGeneration)) return state;
        const audioCache = { ...state.audioCache };
        let changed = false;
        for (const [sourceId, entry] of Object.entries(pendingAudioCache)) {
            if (!shouldHydrateAudioSource(sourceId, state)) continue;
            audioCache[sourceId] = entry;
            changed = true;
        }
        return changed ? { audioCache } : state;
    });

    for (const [assetId, { record, bytes }] of assetData) {
        throwIfAborted(options.signal);
        try {
            const hash = await measureProjectLoadWork('Audio hash validation', () => sha256Hex(bytes));
            if (record.hash && hash !== record.hash) warnings.push(`Hash mismatch for asset ${assetId}`);
        } catch {
            warnings.push(`Failed to hash asset ${assetId}`);
        }
    }

    const consumed = new Set<string>();
    for (const [originalId, assetId] of Object.entries(audioIdMap)) {
        throwIfAborted(options.signal);
        if (!isAudioHydrationStillCurrent(expectedTimelineGeneration)) {
            break;
        }
        if (consumed.has(originalId)) continue;
        const payload = assetData.get(assetId);
        if (!payload) {
            warnings.push(`Referenced asset ${assetId} missing for audio ${originalId}`);
            continue;
        }
        const waveformRecord = resolveWaveformRecord(waveforms, assetId, waveformPayloads, warnings);
        const waveform = buildWaveform(waveformRecord);
        let originalFile: {
            name?: string;
            mimeType: string;
            bytes?: Uint8Array;
            byteLength: number;
            hash?: string;
            assetId?: string;
            storage?: 'indexeddb' | 'memory' | 'inline' | 'missing';
        };
        if (payload.bytes.byteLength > INLINE_ORIGINAL_FILE_LIMIT_BYTES) {
            const storedAssetId = createAudioAssetId('audio-import');
            const storage = await measureProjectLoadWork('Audio original storage', () =>
                AudioAssetStore.put(storedAssetId, payload.bytes)
            );
            if (!isAudioHydrationStillCurrent(expectedTimelineGeneration)) {
                break;
            }
            originalFile = {
                name: payload.record.filename,
                mimeType: payload.record.mimeType,
                byteLength: payload.bytes.byteLength,
                hash: payload.record.hash,
                assetId: storedAssetId,
                storage,
                bytes: storage === 'memory' ? payload.bytes : undefined,
            };
        } else {
            originalFile = {
                name: payload.record.filename,
                mimeType: payload.record.mimeType,
                bytes: payload.bytes,
                byteLength: payload.bytes.byteLength,
                hash: payload.record.hash,
                storage: 'inline',
            };
        }

        // Replace the metadata-only placeholder with the original bytes before
        // this source is decoded.
        const lightweightEntry = {
            ...buildLightweightAudioCacheEntry(payload.record, originalFile),
            waveform,
            decodedState: 'decoding' as const,
            decodedFailureReason: undefined,
        };
        useTimelineStore.setState((state) => {
            if (
                !isAudioHydrationStillCurrent(expectedTimelineGeneration) ||
                !shouldHydrateAudioSource(originalId, state)
            ) {
                return state;
            }
            return {
                audioCache: {
                    ...state.audioCache,
                    [originalId]: lightweightEntry,
                },
            };
        });
        if (options.deferAudioDecoding) {
            useTimelineStore.setState((state) => {
                if (
                    !isAudioHydrationStillCurrent(expectedTimelineGeneration) ||
                    state.audioCache[originalId]?.originalFile !== originalFile
                )
                    return state;
                return {
                    audioCache: {
                        ...state.audioCache,
                        [originalId]: { ...lightweightEntry, waveform, decodedState: 'deferred' },
                    },
                };
            });
            consumed.add(originalId);
            continue;
        }
        try {
            const buffer = await decodeAudioSource(
                lightweightEntry,
                () =>
                    isAudioHydrationStillCurrent(expectedTimelineGeneration) &&
                    useTimelineStore.getState().audioCache[originalId]?.originalFile === originalFile
            );
            throwIfAborted(options.signal);
            const timelineState = useTimelineStore.getState();
            if (
                !isAudioHydrationStillCurrent(expectedTimelineGeneration) ||
                !shouldHydrateAudioSource(originalId, timelineState)
            ) {
                consumed.add(originalId);
                continue;
            }
            const cacheStatus = timelineState.audioFeatureCacheStatus?.[originalId];
            const hasRestoredFeatureCache =
                !!timelineState.audioFeatureCaches?.[originalId] &&
                (cacheStatus?.state === 'ready' || cacheStatus?.state === 'stale');
            ingest(originalId, buffer, {
                originalFile,
                waveform,
                skipAutoAnalysis: hasRestoredFeatureCache,
            });
        } catch (error) {
            throwIfAborted(options.signal);
            if (
                !isAudioHydrationStillCurrent(expectedTimelineGeneration) ||
                !shouldHydrateAudioSource(originalId, useTimelineStore.getState())
            ) {
                consumed.add(originalId);
                continue;
            }
            useTimelineStore.setState((state) => ({
                audioCache: {
                    ...state.audioCache,
                    [originalId]: {
                        ...buildLightweightAudioCacheEntry(payload.record, originalFile),
                        decodedState: 'failed',
                        decodedFailureReason: (error as Error).message,
                        waveform,
                    },
                },
            }));
            warnings.push(`Deferred audio decode for ${originalId}: ${(error as Error).message}`);
        }
        consumed.add(originalId);
    }

    assetPayloads.clear();
    waveformPayloads.clear();
    return warnings;
}

/** Background work retains IDs and generation, never the unpacked package. */
export function prepareImportedAudioInBackground(expectedGeneration: number): void {
    const sources = [...findReferencedAudioSourceIds(useTimelineStore.getState())];
    setTimeout(() => {
        if (!isAudioHydrationStillCurrent(expectedGeneration)) return;
        for (const id of sources) {
            const state = useTimelineStore.getState();
            if (state.audioCache[id]?.decodedState === 'deferred') void state.rehydrateAudioSource(id, 0);
        }
    }, 0);
}
