import { validateSceneEnvelope } from '../validate';
import { migrateSceneV8 } from '../migrations/sceneV8';
import { DocumentGateway } from '../document-gateway';
import type { SceneExportEnvelope, ScenePluginDependency } from '../export';
import { isMidiBinary } from '@core/midi/midi-encoder';
import { parseMIDIArrayBuffer } from '@core/midi/midi-library';
import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
import {
    deserializeAudioFeatureCache,
    type SerializedAudioFeatureCache,
    type SerializedAudioFeatureTrack,
    type SerializedAudioFeatureTrackDataRef,
} from '@audio/features/audioFeatureAnalysis';
import { AudioAssetStore, createAudioAssetId } from '../audio-asset-store';
import { sha256Hex } from '@utils/hash/sha256';
import { FontBinaryStore } from '../font-binary-store';
import { PluginBinaryStore } from '../plugin-binary-store';
import { loadPlugin, satisfiesVersion } from '@core/scene/plugins';
import { clearSpectrogramTileCache } from '@core/scene/elements/audio-displays/spectrogram-tiles';
import { usePluginStore } from '@state/pluginStore';
import { ensureFontVariantsRegistered, ensureSceneFontsLoaded } from '@fonts/font-loader';
import type { FontAsset } from '@state/scene/fonts';
import { decodeSceneText, parseScenePackage, ScenePackageError } from '../scene-package';
import { isTestEnvironment } from '@utils/env';
import { useVisualAssetRegistryStore, type ProjectAsset } from '@state/visualAssetRegistryStore';
import { useSceneStore } from '@state/sceneStore';
import {
    advanceTimelineMutationGeneration,
    getTimelineMutationGeneration,
    useTimelineStore,
} from '@state/timelineStore';
import { findReferencedAudioSourceIds, getAudioClipsForTrack } from '@state/timeline/audioClips';
import type { AudioCacheEntry } from '@audio/audioTypes';
import { migrateSceneRotationUnitsV7 } from '../migrations/rotationUnitsV7';
import { prepareTextBoundsMigrationFonts } from '../migrations/textBoundsV11';
import { throwIfImportAborted, throwIfImportAborted as throwIfAborted } from '../import-abort';

const AUDIO_FEATURE_ASSET_FILENAME = 'feature_caches.json';
const WAVEFORM_ASSET_FILENAME = 'waveform.json';
const INLINE_ORIGINAL_FILE_LIMIT_BYTES = 16 * 1024 * 1024;

export interface ImportError {
    code?: string;
    message: string;
    path?: string;
}

export interface ImportResultSuccess {
    ok: true;
    errors: [];
    warnings: { message: string }[];
}

export interface ImportResultFailureEnabled {
    ok: false;
    errors: ImportError[];
    warnings: { message: string }[];
}

export type ImportSceneResult = ImportResultSuccess | ImportResultFailureEnabled;
export type ImportSceneInput = ArrayBuffer | Uint8Array | Blob;
export interface ImportSceneOptions {
    signal?: AbortSignal;
    onProgress?: (progress: number, text?: string) => void;
    /** Install embedded dependencies without prompting (used by isolated background exports). */
    autoInstallEmbeddedPlugins?: boolean;
}

interface ParsedArtifact {
    envelope: any;
    warnings: { message: string }[];
    audioPayloads: Map<string, Uint8Array>;
    midiPayloads: Map<string, Uint8Array>;
    fontPayloads: Map<string, Uint8Array>;
    visualPayloads: Map<string, Uint8Array>;
    waveformPayloads: Map<string, Map<string, Uint8Array>>;
    audioFeaturePayloads: Map<string, Map<string, Uint8Array>>;
    pluginPayloads: Map<string, Uint8Array>;
}

export function hydrateAudioFeatureCacheFromAssets(
    serialized: SerializedAudioFeatureCache,
    payloads: Map<string, Uint8Array>,
    cacheId: string,
    warnings: string[]
): { cache: SerializedAudioFeatureCache; complete: boolean } | null {
    const hydratedTracks: Record<string, SerializedAudioFeatureTrack> = {};
    let complete = true;
    for (const [trackKey, track] of Object.entries(serialized.featureTracks || {})) {
        const hydrated: SerializedAudioFeatureTrack = { ...track };
        let includeTrack = true;
        if (hydrated.dataRef) {
            const ref = hydrated.dataRef;
            const binary = payloads.get(ref.filename);
            if (!binary) {
                warnings.push(`Missing audio feature data file for ${cacheId}:${trackKey}`);
                includeTrack = false;
            } else {
                const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
                if (ref.kind === 'typed-array') {
                    let values: Float32Array | Uint8Array | Int16Array;
                    if (ref.type === 'float32') {
                        values = new Float32Array(buffer);
                    } else if (ref.type === 'uint8') {
                        values = new Uint8Array(buffer);
                    } else {
                        values = new Int16Array(buffer);
                    }
                    const expectedValues =
                        Math.max(0, Math.floor(track.frameCount)) * Math.max(1, Math.floor(track.channels));
                    if ((ref.valueCount && values.length !== ref.valueCount) || values.length !== expectedValues) {
                        warnings.push(
                            `Audio feature data length mismatch for ${cacheId}:${trackKey} (expected ${expectedValues}, got ${values.length})`
                        );
                        includeTrack = false;
                    } else {
                        hydrated.data = { type: ref.type, values };
                    }
                } else {
                    const values = new Float32Array(buffer);
                    const expected = (ref.minLength || 0) + (ref.maxLength || 0);
                    if (values.length < expected) {
                        warnings.push(`Audio feature waveform payload too small for ${cacheId}:${trackKey}`);
                        includeTrack = false;
                    } else {
                        const min = values.slice(0, ref.minLength);
                        const max = values.slice(ref.minLength, ref.minLength + ref.maxLength);
                        hydrated.data = { type: 'waveform-minmax', min, max };
                    }
                }
            }
            delete (hydrated as { dataRef?: SerializedAudioFeatureTrackDataRef }).dataRef;
        }
        if (!hydrated.data) {
            if (!includeTrack) {
                complete = false;
                continue;
            }
        }
        hydratedTracks[trackKey] = hydrated;
    }
    return { cache: { ...serialized, featureTracks: hydratedTracks }, complete };
}

export function buildDocumentShape(
    envelope: any,
    audioFeaturePayloads: Map<string, Map<string, Uint8Array>>
): {
    doc: {
        timeline: any;
        tracks: any;
        tracksOrder: string[];
        playbackRange?: any;
        playbackRangeUserDefined: boolean;
        rowHeight: number;
        midiCache: Record<string, any>;
        audioFeatureCaches: Record<string, any>;
        audioFeatureCacheStatus: Record<string, any>;
        scene: any;
        metadata: any;
    };
    featureWarnings: string[];
} {
    const tl = envelope.timeline || {};
    const featureCaches: Record<string, any> = {};
    const featureWarnings: string[] = [];
    const incompleteFeatureCacheIds = new Set<string>();
    if (tl.audioFeatureCaches && typeof tl.audioFeatureCaches === 'object') {
        for (const [id, cache] of Object.entries(tl.audioFeatureCaches as Record<string, any>)) {
            if (cache && typeof cache === 'object' && 'assetRef' in cache) {
                const assetId =
                    typeof (cache as any).assetId === 'string' ? (cache as any).assetId : encodeURIComponent(id);
                const payloadGroup = audioFeaturePayloads.get(assetId);
                if (!payloadGroup) {
                    featureWarnings.push(`Missing audio feature payload for cache ${id}`);
                    incompleteFeatureCacheIds.add(id);
                    continue;
                }
                try {
                    const metadataBytes = payloadGroup.get(AUDIO_FEATURE_ASSET_FILENAME);
                    if (!metadataBytes) {
                        featureWarnings.push(`Missing feature cache metadata for ${id}`);
                        incompleteFeatureCacheIds.add(id);
                        continue;
                    }
                    const serialized = JSON.parse(decodeSceneText(metadataBytes));
                    const hydrated = hydrateAudioFeatureCacheFromAssets(
                        serialized as SerializedAudioFeatureCache,
                        payloadGroup,
                        id,
                        featureWarnings
                    );
                    if (hydrated) {
                        featureCaches[id] = deserializeAudioFeatureCache(hydrated.cache as any);
                        if (!hydrated.complete) {
                            incompleteFeatureCacheIds.add(id);
                        }
                    }
                } catch (error) {
                    console.warn('[importScene] failed to parse audio feature payload', id, error);
                    featureWarnings.push(`Failed to parse audio feature payload for cache ${id}`);
                    incompleteFeatureCacheIds.add(id);
                }
                continue;
            }
            try {
                featureCaches[id] = deserializeAudioFeatureCache(cache as any);
            } catch (error) {
                console.warn('[importScene] failed to deserialize audio feature cache', id, error);
                incompleteFeatureCacheIds.add(id);
            }
        }
    }
    const audioFeatureCacheStatus = { ...(tl.audioFeatureCacheStatus || {}) };
    for (const id of incompleteFeatureCacheIds) {
        audioFeatureCacheStatus[id] = {
            ...(audioFeatureCacheStatus[id] || {}),
            state: 'stale',
            message: 'analysis cache incomplete after restore',
            updatedAt: Date.now(),
        };
    }
    return {
        doc: {
            timeline: tl.timeline,
            tracks: tl.tracks,
            tracksOrder: tl.tracksOrder || [],
            playbackRange: tl.playbackRange,
            playbackRangeUserDefined: !!tl.playbackRangeUserDefined,
            rowHeight: tl.rowHeight,
            midiCache: tl.midiCache || {},
            audioFeatureCaches: featureCaches,
            audioFeatureCacheStatus,
            scene: { ...envelope.scene },
            metadata: envelope.metadata,
        },
        featureWarnings,
    };
}
