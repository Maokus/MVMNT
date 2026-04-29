import { validateSceneEnvelope } from './validate';
import { DocumentGateway } from './document-gateway';
import type { SceneExportEnvelope, ScenePluginDependency } from './export';
import { isMidiBinary } from '@core/midi/midi-encoder';
import { parseMIDIArrayBuffer } from '@core/midi/midi-library';
import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
import {
    deserializeAudioFeatureCache,
    type SerializedAudioFeatureCache,
    type SerializedAudioFeatureTrack,
    type SerializedAudioFeatureTrackDataRef,
} from '@audio/features/audioFeatureAnalysis';
import { base64ToUint8Array } from '@utils/base64';
import { sha256Hex } from '@utils/hash/sha256';
import { FontBinaryStore } from './font-binary-store';
import { PluginBinaryStore } from './plugin-binary-store';
import { loadPlugin, satisfiesVersion } from '@core/scene/plugins';
import { usePluginStore } from '@state/pluginStore';
import { ensureFontVariantsRegistered } from '@fonts/font-loader';
import type { FontAsset } from '@state/scene/fonts';
import { decodeSceneText, parseLegacyInlineScene, parseScenePackage, ScenePackageError } from './scene-package';
import { isTestEnvironment } from '@utils/env';
import { useVisualAssetRegistryStore, type ProjectAsset } from '@state/visualAssetRegistryStore';

const AUDIO_FEATURE_ASSET_FILENAME = 'feature_caches.json';
const WAVEFORM_ASSET_FILENAME = 'waveform.json';

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
export type ImportSceneInput = string | ArrayBuffer | Uint8Array | Blob;

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

async function parseArtifact(input: ImportSceneInput): Promise<ParsedArtifact | { error: ImportError }> {
    if (typeof input === 'string') {
        try {
            if (!isTestEnvironment()) {
                console.warn(
                    '[importScene] Inline JSON scene imports are deprecated. Please re-export scenes as packaged .mvt files.'
                );
            }
            const legacy = parseLegacyInlineScene(input);
            return {
                envelope: legacy.envelope,
                warnings: legacy.warnings,
                audioPayloads: legacy.audioPayloads,
                midiPayloads: legacy.midiPayloads,
                fontPayloads: legacy.fontPayloads,
                visualPayloads: legacy.visualPayloads,
                waveformPayloads: legacy.waveformPayloads,
                audioFeaturePayloads: legacy.audioFeaturePayloads,
                pluginPayloads: legacy.pluginPayloads,
            };
        } catch (error: any) {
            return { error: { code: 'ERR_JSON_PARSE', message: 'Invalid JSON: ' + error.message } };
        }
    }

    let bytes: Uint8Array | null = null;
    if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
    } else if (input instanceof Uint8Array) {
        bytes = input;
    } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
        bytes = new Uint8Array(await input.arrayBuffer());
    }

    if (!bytes) {
        return { error: { code: 'ERR_INPUT_TYPE', message: 'Unsupported import input' } };
    }

    try {
        return parseScenePackage(bytes);
    } catch (error) {
        if (error instanceof ScenePackageError) {
            if (error.code === 'ERR_PACKAGE_FORMAT') {
                try {
                    const text = decodeSceneText(bytes);
                    if (!isTestEnvironment()) {
                        console.warn(
                            '[importScene] Inline JSON scene imports are deprecated. Please re-export scenes as packaged .mvt files.'
                        );
                    }
                    const legacy = parseLegacyInlineScene(text);
                    return {
                        envelope: legacy.envelope,
                        warnings: legacy.warnings,
                        audioPayloads: legacy.audioPayloads,
                        midiPayloads: legacy.midiPayloads,
                        fontPayloads: legacy.fontPayloads,
                        visualPayloads: legacy.visualPayloads,
                        waveformPayloads: legacy.waveformPayloads,
                        audioFeaturePayloads: legacy.audioFeaturePayloads,
                        pluginPayloads: legacy.pluginPayloads,
                    };
                } catch (inner: any) {
                    return { error: { code: 'ERR_JSON_PARSE', message: 'Invalid JSON: ' + inner.message } };
                }
            }
            return { error: { code: error.code, message: error.message } };
        }
        return { error: { code: 'ERR_PACKAGE_FORMAT', message: (error as Error).message } };
    }
}

async function assessPluginDependencies(
    dependencies: ScenePluginDependency[] | undefined,
    pluginPayloads: Map<string, Uint8Array>
): Promise<{
    missing: ScenePluginDependency[];
    versionAdvisory: ScenePluginDependency[];
    embeddedMissing: ScenePluginDependency[];
    warnings: string[];
}> {
    const warnings: string[] = [];
    const missing: ScenePluginDependency[] = [];
    const versionAdvisory: ScenePluginDependency[] = [];
    const embeddedMissing: ScenePluginDependency[] = [];

    if (!dependencies?.length) {
        return { missing, versionAdvisory, embeddedMissing, warnings };
    }

    const installedPlugins = usePluginStore.getState().plugins;

    for (const dep of dependencies) {
        if (!dep || !dep.pluginId) continue;
        const installed = installedPlugins[dep.pluginId];
        let versionOk = true;
        let isAdvisory = false;
        if (installed && dep.version && dep.version !== 'unknown') {
            versionOk = satisfiesVersion(installed.manifest.version, dep.version);
            if (!versionOk) {
                // Determine direction: extract the lower bound of the range and check if installed >= it.
                const lowerBound = dep.version
                    .replace(/^[\^~>=]+/, '')
                    .trim()
                    .split(' ')[0];
                isAdvisory = satisfiesVersion(installed.manifest.version, `>=${lowerBound}`);
                if (isAdvisory) {
                    // Installed plugin is newer than what was used to create the scene — likely harmless.
                } else {
                    warnings.push(
                        `Plugin ${dep.pluginId} version mismatch (requires ${dep.version}, found ${installed.manifest.version}).`
                    );
                }
            }
        }

        let hashOk = true;
        if (installed && dep.hash) {
            try {
                const stored = await PluginBinaryStore.get(dep.pluginId);
                if (stored) {
                    const storedHash = await sha256Hex(new Uint8Array(stored));
                    if (storedHash !== dep.hash) {
                        hashOk = false;
                        warnings.push(`Plugin ${dep.pluginId} hash mismatch; embedded install recommended.`);
                    }
                }
            } catch {
                /* ignore hash failures */
            }
        }

        if (!installed || (!versionOk && !isAdvisory) || !hashOk) {
            missing.push(dep);
            if (dep.embedded && pluginPayloads.has(dep.pluginId)) {
                embeddedMissing.push(dep);
            }
        } else if (isAdvisory) {
            versionAdvisory.push(dep);
        }
    }

    return { missing, versionAdvisory, embeddedMissing, warnings };
}

async function installEmbeddedPlugins(
    dependencies: ScenePluginDependency[],
    pluginPayloads: Map<string, Uint8Array>
): Promise<string[]> {
    const warnings: string[] = [];
    for (const dep of dependencies) {
        const payload = pluginPayloads.get(dep.pluginId);
        if (!payload) {
            warnings.push(`Embedded plugin payload missing for ${dep.pluginId}.`);
            continue;
        }

        if (dep.hash) {
            try {
                const payloadHash = await sha256Hex(payload);
                if (payloadHash !== dep.hash) {
                    warnings.push(`Embedded plugin ${dep.pluginId} failed hash verification.`);
                    continue;
                }
            } catch {
                warnings.push(`Failed to verify embedded plugin ${dep.pluginId}.`);
                continue;
            }
        }

        if (usePluginStore.getState().plugins[dep.pluginId]) {
            continue;
        }

        const pluginBuffer = new ArrayBuffer(payload.byteLength);
        new Uint8Array(pluginBuffer).set(payload);
        const result = await loadPlugin(pluginBuffer);
        if (!result.success) {
            warnings.push(`Failed to install plugin ${dep.pluginId}: ${result.error || 'Unknown error'}`);
        }
    }

    return warnings;
}

function hydrateAudioFeatureCacheFromAssets(
    serialized: SerializedAudioFeatureCache,
    payloads: Map<string, Uint8Array>,
    cacheId: string,
    warnings: string[]
): SerializedAudioFeatureCache | null {
    const hydratedTracks: Record<string, SerializedAudioFeatureTrack> = {};
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
                    if (ref.valueCount && values.length !== ref.valueCount) {
                        warnings.push(
                            `Audio feature data length mismatch for ${cacheId}:${trackKey} (expected ${ref.valueCount}, got ${values.length})`
                        );
                    }
                    hydrated.data = { type: ref.type, values };
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
                continue;
            }
        }
        hydratedTracks[trackKey] = hydrated;
    }
    return { ...serialized, featureTracks: hydratedTracks };
}

function buildDocumentShape(
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
    if (tl.audioFeatureCaches && typeof tl.audioFeatureCaches === 'object') {
        for (const [id, cache] of Object.entries(tl.audioFeatureCaches as Record<string, any>)) {
            if (cache && typeof cache === 'object' && 'assetRef' in cache) {
                const assetId =
                    typeof (cache as any).assetId === 'string' ? (cache as any).assetId : encodeURIComponent(id);
                const payloadGroup = audioFeaturePayloads.get(assetId);
                if (!payloadGroup) {
                    featureWarnings.push(`Missing audio feature payload for cache ${id}`);
                    continue;
                }
                try {
                    const metadataBytes = payloadGroup.get(AUDIO_FEATURE_ASSET_FILENAME);
                    if (!metadataBytes) {
                        featureWarnings.push(`Missing feature cache metadata for ${id}`);
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
                        featureCaches[id] = deserializeAudioFeatureCache(hydrated as any);
                    }
                } catch (error) {
                    console.warn('[importScene] failed to parse audio feature payload', id, error);
                    featureWarnings.push(`Failed to parse audio feature payload for cache ${id}`);
                }
                continue;
            }
            try {
                featureCaches[id] = deserializeAudioFeatureCache(cache as any);
            } catch (error) {
                console.warn('[importScene] failed to deserialize audio feature cache', id, error);
            }
        }
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
            audioFeatureCacheStatus: tl.audioFeatureCacheStatus || {},
            scene: { ...envelope.scene },
            metadata: envelope.metadata,
        },
        featureWarnings,
    };
}

async function restoreMidiCache(
    midiSection: any,
    midiPayloads: Map<string, Uint8Array>
): Promise<{ cache: Record<string, any>; warnings: string[] }> {
    if (!midiSection || typeof midiSection !== 'object') {
        return { cache: {}, warnings: [] };
    }
    const restored: Record<string, any> = {};
    const warnings: string[] = [];
    for (const [cacheId, value] of Object.entries(midiSection)) {
        if (!value || typeof value !== 'object') {
            restored[cacheId] = value;
            continue;
        }
        const assetRef = (value as any).assetRef;
        if (typeof assetRef !== 'string') {
            restored[cacheId] = value;
            continue;
        }
        const assetId =
            typeof (value as any).assetId === 'string' ? (value as any).assetId : encodeURIComponent(cacheId);
        const payload = midiPayloads.get(assetId);
        if (!payload) {
            warnings.push(`Missing MIDI payload for cache ${cacheId}`);
            continue;
        }
        if (isMidiBinary(payload)) {
            try {
                const buffer = payload.buffer.slice(
                    payload.byteOffset,
                    payload.byteOffset + payload.byteLength
                ) as ArrayBuffer;
                const midiData = await parseMIDIArrayBuffer(buffer);
                restored[cacheId] = buildNotesFromMIDI(midiData);
            } catch (error) {
                warnings.push(`Failed to parse binary MIDI for cache ${cacheId}: ${(error as Error).message}`);
            }
        } else {
            try {
                const parsed = JSON.parse(decodeSceneText(payload));
                restored[cacheId] = parsed;
            } catch (error) {
                warnings.push(`Failed to parse MIDI payload for cache ${cacheId}: ${(error as Error).message}`);
            }
        }
    }
    return { cache: restored, warnings };
}

/**
 * Restore visual assets from ZIP payloads.
 *
 * For each asset ID recorded in `envelope.assets.visual.byId`, reconstruct a
 * File object from the ZIP bytes. Then scan all element property bindings in
 * `doc.scene` for constant values that match a known asset ID and replace them
 * with the reconstructed File. This runs before DocumentGateway.apply() so that
 * the scene store receives File values it already understands at runtime.
 */
function restoreVisualAssets(
    scene: any,
    visualAssetsSection: { byId: Record<string, any> } | undefined,
    visualPayloads: Map<string, Uint8Array>
): { warnings: string[]; fileById: Map<string, File> } {
    const warnings: string[] = [];
    const fileById = new Map<string, File>();
    if (!visualAssetsSection?.byId || typeof visualAssetsSection.byId !== 'object') return { warnings, fileById };

    // Build a map of assetId → reconstructed File
    for (const [assetId, record] of Object.entries(visualAssetsSection.byId)) {
        if (!record || typeof record !== 'object') continue;
        const bytes = visualPayloads.get(assetId);
        if (!bytes) {
            warnings.push(`Missing visual asset payload for ${assetId}`);
            continue;
        }
        const mimeType = typeof record.mimeType === 'string' ? record.mimeType : 'application/octet-stream';
        const originalFileName =
            typeof record.originalFileName === 'string' ? record.originalFileName : `${assetId}.bin`;
        try {
            const file = new File(
                [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
                originalFileName,
                { type: mimeType }
            );
            fileById.set(assetId, file);
        } catch {
            warnings.push(`Failed to reconstruct File for visual asset ${assetId}`);
        }
    }

    if (fileById.size === 0) return { warnings, fileById };

    // Patch element property bindings: replace asset ID strings with File objects
    // (for prop.file()-type elements; assetRef elements will be migrated back to IDs later)
    const elements = scene?.elements;
    if (!elements || typeof elements !== 'object') return { warnings, fileById };
    for (const element of Object.values(elements) as any[]) {
        if (!element || typeof element !== 'object') continue;
        const props = element.properties;
        if (!props || typeof props !== 'object') continue;
        for (const [propKey, propData] of Object.entries(props) as [string, any][]) {
            if (propData?.type !== 'constant') continue;
            const value = propData.value;
            if (typeof value !== 'string') continue;
            const file = fileById.get(value);
            if (file) {
                props[propKey] = { type: 'constant', value: file };
            }
        }
    }

    return { warnings, fileById };
}

/** Populate the visual asset registry from imported files and optional metadata. */
function hydrateVisualAssetRegistry(
    fileById: Map<string, File>,
    visualAssetsSection: { byId: Record<string, any> } | undefined,
    registrySection:
        | { assets: Record<string, { id: string; name: string; filename: string }>; assetsOrder: string[] }
        | undefined
): void {
    if (fileById.size === 0) return;

    const entries: ProjectAsset[] = [];
    const orderedIds = registrySection?.assetsOrder?.length ? registrySection.assetsOrder : Array.from(fileById.keys());

    for (const assetId of orderedIds) {
        const file = fileById.get(assetId);
        if (!file) continue;
        const registryMeta = registrySection?.assets?.[assetId];
        const visualMeta = visualAssetsSection?.byId?.[assetId];
        const filename =
            registryMeta?.name ??
            (visualMeta?.originalFileName ? (visualMeta.originalFileName as string).replace(/\.[^.]+$/, '') : null) ??
            assetId;
        const type =
            file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
                ? ('gif' as const)
                : ('image' as const);
        entries.push({ id: assetId, name: filename, file, type, origin: 'user', deletable: true, visibleInAssetManager: true });
    }

    // Include any IDs not in the ordered list
    for (const [assetId, file] of fileById) {
        if (orderedIds.includes(assetId)) continue;
        const registryMeta = registrySection?.assets?.[assetId];
        const visualMeta = visualAssetsSection?.byId?.[assetId];
        const filename =
            registryMeta?.name ??
            (visualMeta?.originalFileName ? (visualMeta.originalFileName as string).replace(/\.[^.]+$/, '') : null) ??
            assetId;
        const type =
            file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
                ? ('gif' as const)
                : ('image' as const);
        entries.push({ id: assetId, name: filename, file, type, origin: 'user', deletable: true, visibleInAssetManager: true });
    }

    useVisualAssetRegistryStore.getState()._hydrateFromImport(entries);
}

/**
 * After DocumentGateway.apply(), convert any File objects in scene store bindings
 * back to asset ID strings for assetRef-type properties. Uses the fileById reverse map
 * so we can identify which File corresponds to which registry entry.
 */
function migrateStoreAssetRefBindings(fileById: Map<string, File>): void {
    if (fileById.size === 0) return;

    // Build File → assetId reverse lookup (same File instances as in the store bindings)
    const fileToId = new Map<File, string>();
    for (const [id, file] of fileById) {
        fileToId.set(file, id);
    }

    const { useSceneStore } = require('@state/sceneStore') as typeof import('@state/sceneStore');
    const state = useSceneStore.getState();
    const updates: Array<{ elementId: string; propKey: string; assetId: string }> = [];

    for (const [elementId, elementBindings] of Object.entries(state.bindings.byElement)) {
        if (!elementBindings) continue;
        for (const [propKey, binding] of Object.entries(elementBindings)) {
            if (!binding || (binding as any).type !== 'constant') continue;
            const value = (binding as any).value;
            if (!(value instanceof File)) continue;
            const assetId = fileToId.get(value);
            if (assetId) {
                updates.push({ elementId, propKey, assetId });
            }
        }
    }

    if (updates.length === 0) return;

    useSceneStore.setState((prev) => {
        const nextByElement = { ...prev.bindings.byElement };
        for (const { elementId, propKey, assetId } of updates) {
            const elementBindings = nextByElement[elementId];
            if (!elementBindings) continue;
            nextByElement[elementId] = {
                ...elementBindings,
                [propKey]: { type: 'constant', value: assetId },
            };
        }
        return { bindings: { ...prev.bindings, byElement: nextByElement } };
    });
}

async function createAudioBufferFromAsset(record: any, bytes: Uint8Array): Promise<AudioBuffer> {
    const length = Math.max(1, record.durationSamples || Math.round(record.durationSeconds * record.sampleRate));
    const sampleRate = record.sampleRate || 44100;
    const channels = Math.max(1, record.channels || 1);
    if (typeof window !== 'undefined' && typeof (window as any).AudioContext === 'function') {
        try {
            const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
            const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
            ctx.close?.();
            return buffer;
        } catch {
            /* fall through */
        }
    }
    if (typeof AudioBuffer === 'function') {
        try {
            return new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
        } catch {
            /* ignore */
        }
    }
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) channelData.push(new Float32Array(length));
    const durationSeconds = typeof record.durationSeconds === 'number' ? record.durationSeconds : length / sampleRate;
    const fallback: AudioBuffer = {
        length,
        duration: durationSeconds,
        sampleRate,
        numberOfChannels: channels,
        copyFromChannel: (destination: Float32Array, channelNumber: number, startInChannel = 0) => {
            const source = channelData[Math.min(channelNumber, channelData.length - 1)] ?? channelData[0];
            destination.set(source.subarray(startInChannel, startInChannel + destination.length));
        },
        copyToChannel: (source: Float32Array, channelNumber: number, startInChannel = 0) => {
            const target = channelData[Math.min(channelNumber, channelData.length - 1)] ?? channelData[0];
            target.set(source, startInChannel);
        },
        getChannelData: (channel: number) => channelData[Math.min(channel, channelData.length - 1)] ?? channelData[0],
    } as unknown as AudioBuffer;
    return fallback;
}

function buildWaveform(record: any | undefined) {
    if (!record) return undefined;
    return {
        version: 1 as const,
        channelPeaks: new Float32Array(record.channelPeaks ?? []),
        sampleStep: record.sampleStep ?? 1,
    };
}

function resolveWaveformRecord(
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

async function hydrateAudioAssets(
    envelope: SceneExportEnvelope,
    assetPayloads: Map<string, Uint8Array>,
    waveformPayloads: Map<string, Map<string, Uint8Array>>
): Promise<string[]> {
    const warnings: string[] = [];
    const audioById = envelope.assets?.audio?.byId || {};
    const waveforms = envelope.assets?.waveforms?.byAudioId || {};
    const audioIdMap = Object.keys(envelope.references?.audioIdMap || {}).length
        ? envelope.references!.audioIdMap!
        : Object.keys(audioById).reduce((acc: Record<string, string>, id) => {
              acc[id] = id;
              return acc;
          }, {});
    const { useTimelineStore } = (await import('@state/timelineStore')) as typeof import('@state/timelineStore');
    const ingest = useTimelineStore.getState().ingestAudioToCache;

    const assetData = new Map<string, { record: any; bytes: Uint8Array }>();
    for (const [assetId, record] of Object.entries(audioById)) {
        let bytes: Uint8Array | undefined;
        if (record.dataBase64) {
            try {
                bytes = base64ToUint8Array(record.dataBase64);
            } catch {
                warnings.push(`Failed to decode base64 for asset ${assetId}`);
                continue;
            }
        } else if (assetPayloads.has(assetId)) {
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
        try {
            const hash = await sha256Hex(bytes);
            if (record.hash && hash !== record.hash) warnings.push(`Hash mismatch for asset ${assetId}`);
        } catch {
            warnings.push(`Failed to hash asset ${assetId}`);
        }
        assetData.set(assetId, { record, bytes });
    }

    const consumed = new Set<string>();
    for (const [originalId, assetId] of Object.entries(audioIdMap)) {
        if (consumed.has(originalId)) continue;
        const payload = assetData.get(assetId);
        if (!payload) {
            warnings.push(`Referenced asset ${assetId} missing for audio ${originalId}`);
            continue;
        }
        const waveformRecord = resolveWaveformRecord(waveforms, assetId, waveformPayloads, warnings);
        const waveform = buildWaveform(waveformRecord);
        const buffer = await createAudioBufferFromAsset(payload.record, payload.bytes);
        const originalFile = {
            name: payload.record.filename,
            mimeType: payload.record.mimeType,
            bytes: payload.bytes,
            byteLength: payload.bytes.byteLength,
            hash: payload.record.hash,
        };
        try {
            const timelineState = useTimelineStore.getState();
            const cacheStatus = timelineState.audioFeatureCacheStatus?.[originalId];
            const hasReadyFeatureCache =
                !!timelineState.audioFeatureCaches?.[originalId] && cacheStatus?.state === 'ready';
            ingest(originalId, buffer, {
                originalFile,
                waveform,
                skipAutoAnalysis: hasReadyFeatureCache,
            });
        } catch (error) {
            warnings.push(`Failed to ingest audio ${originalId}: ${(error as Error).message}`);
        }
        consumed.add(originalId);
    }

    return warnings;
}

export async function importScene(input: ImportSceneInput): Promise<ImportSceneResult> {
    const parsed = await parseArtifact(input);
    if ('error' in parsed) {
        return { ok: false, errors: [parsed.error], warnings: [] };
    }

    const {
        envelope,
        warnings: artifactWarnings,
        audioPayloads,
        midiPayloads,
        fontPayloads,
        visualPayloads,
        waveformPayloads,
        audioFeaturePayloads,
        pluginPayloads,
    } = parsed;
    const validation = validateSceneEnvelope(envelope);
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors.map((e) => ({ code: e.code, message: e.message, path: e.path })),
            warnings: [...artifactWarnings, ...validation.warnings.map((w) => ({ message: w.message }))],
        };
    }

    const pluginWarnings: string[] = [];
    const dependencies = Array.isArray(envelope?.plugins) ? (envelope.plugins as ScenePluginDependency[]) : [];
    const dependencyAssessment = await assessPluginDependencies(dependencies, pluginPayloads);
    pluginWarnings.push(...dependencyAssessment.warnings);

    if (dependencyAssessment.embeddedMissing.length) {
        const canPrompt = !isTestEnvironment() && typeof window !== 'undefined' && typeof window.confirm === 'function';
        const shouldInstall = canPrompt
            ? window.confirm('This scene includes embedded plugins needed for some elements. Install them now?')
            : false;
        if (shouldInstall) {
            pluginWarnings.push(
                ...(await installEmbeddedPlugins(dependencyAssessment.embeddedMissing, pluginPayloads))
            );
        }
    }

    if (dependencyAssessment.missing.length) {
        const missingList = dependencyAssessment.missing.map((dep) => dep.pluginId).filter(Boolean);
        if (missingList.length) {
            pluginWarnings.push(`Missing plugins: ${missingList.join(', ')}. Some elements are shown as placeholders.`);
        }
    }

    if (dependencyAssessment.versionAdvisory.length) {
        for (const dep of dependencyAssessment.versionAdvisory) {
            const installed = usePluginStore.getState().plugins[dep.pluginId];
            if (installed) {
                pluginWarnings.push(
                    `This scene was made with plugin '${dep.pluginId}' ${dep.version}. You have v${installed.manifest.version} installed — it should work, but some details may differ.`
                );
            }
        }
    }

    const { doc, featureWarnings } = buildDocumentShape(envelope, audioFeaturePayloads);
    const midiRestoration = await restoreMidiCache(envelope?.timeline?.midiCache, midiPayloads);
    doc.midiCache = midiRestoration.cache;

    const { warnings: visualWarnings, fileById } = restoreVisualAssets(
        doc.scene,
        envelope.assets?.visual,
        visualPayloads
    );

    // Clear registry before applying (previous project's assets should not persist)
    useVisualAssetRegistryStore.getState()._clear();

    DocumentGateway.apply(doc as any);

    // Populate visual asset registry and migrate assetRef bindings from File → asset ID
    hydrateVisualAssetRegistry(fileById, envelope.assets?.visual, (envelope as any).visualAssetRegistry);
    migrateStoreAssetRefBindings(fileById);

    let hydrationWarnings: string[] = [];
    const fontWarnings: string[] = [];
    if (
        (envelope.schemaVersion === 2 ||
            envelope.schemaVersion === 4 ||
            envelope.schemaVersion === 5 ||
            envelope.schemaVersion === 6) &&
        envelope.assets
    ) {
        hydrationWarnings = await hydrateAudioAssets(envelope, audioPayloads, waveformPayloads);
    }

    if (envelope.scene?.fontAssets && typeof envelope.scene.fontAssets === 'object') {
        const fontAssets = envelope.scene.fontAssets as Record<string, FontAsset>;
        for (const asset of Object.values(fontAssets)) {
            if (!asset || !asset.id) continue;
            const payload = fontPayloads.get(asset.id);
            if (!payload) {
                fontWarnings.push(`Missing font payload for asset ${asset.id}`);
                continue;
            }
            try {
                await FontBinaryStore.put(asset.id, payload);
                await ensureFontVariantsRegistered(asset, asset.variants ?? []);
            } catch (error) {
                fontWarnings.push(`Failed to hydrate font ${asset.id}: ${(error as Error).message}`);
            }
        }
    }

    const warnings = [
        ...artifactWarnings,
        ...validation.warnings.map((w) => ({ message: w.message })),
        ...midiRestoration.warnings.map((message) => ({ message })),
        ...featureWarnings.map((message) => ({ message })),
        ...visualWarnings.map((message) => ({ message })),
        ...hydrationWarnings.map((message) => ({ message })),
        ...fontWarnings.map((message) => ({ message })),
        ...pluginWarnings.map((message) => ({ message })),
    ];
    return { ok: true, errors: [], warnings };
}
