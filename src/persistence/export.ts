import { serializeStable } from './stable-stringify';
import { encodeMidiToBinary } from '@core/midi/midi-encoder';
import { useTimelineStore } from '@state/timelineStore';
import { DocumentGateway } from './document-gateway';
import { CURRENT_SCHEMA_VERSION, SCHEMA_TO_MIN_APP_VERSION } from './validate';
import {
    collectAudioAssets,
    type AssetStorageMode,
    type AudioAssetRecord,
    type WaveformExportRecord,
} from './audio-asset-export';
import { collectFontAssets } from './font-asset-export';
import { collectVisualAssets, type VisualAssetRecord } from './visual-asset-export';
import pkg from '../../package.json';
import { zipSync, strToU8 } from 'fflate';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { usePluginStore } from '@state/pluginStore';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { PluginBinaryStore } from './plugin-binary-store';
import iconDataUrl from '@assets/Icon.icns?inline';
import { sha256Hex } from '@utils/hash/sha256';
import {
    serializeAudioFeatureCache,
    type SerializedAudioFeatureCache,
    type SerializedAudioFeatureTrack,
    type SerializedAudioFeatureTrackDataRef,
} from '@audio/features/audioFeatureAnalysis';
import type { AudioFeatureCacheStatus } from '@audio/features/audioFeatureTypes';
import { estimateFeatureCacheBytes, formatBytes } from '@audio/audioMemoryDiagnostics';
import { recordAudioMemoryDiagnostic } from '@state/audioMemoryDiagnosticsStore';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import { migrateTimelineTrackMidiClipsV8, stripLegacyMidiPlacementFields } from './migrations/midiClipsV8';

/** Converts an exact plugin version to a ^major.minor.0 semver range for scene exports.
 *  e.g. "1.2.3" → "^1.2.0", so any compatible 1.x install >= 1.2.0 opens the scene without warnings. */
function toPluginVersionRange(version: string): string {
    const match = /^(\d+)\.(\d+)\./.exec(version);
    if (!match) return version; // unknown format — leave as-is
    return `^${match[1]}.${match[2]}.0`;
}

import type { PropertyBindingData } from '@bindings/property-bindings';

export interface SceneMetadata {
    id: string;
    name: string;
    createdAt: string;
    modifiedAt: string;
    format: 'scene';
    description?: string;
    author?: string;
}

export interface ScenePluginDependency {
    pluginId: string;
    version: string;
    hash?: string;
    elementTypesUsed: string[];
    embedded: boolean;
}

/** A scene element as serialized in schema V6+. Properties are nested under the `properties` key. */
export interface SceneSerializedElementV6 {
    id: string;
    type: string;
    properties: Record<string, PropertyBindingData>;
}

interface SceneExportEnvelopeBase {
    format: 'mvmnt.scene';
    metadata: SceneMetadata;
    plugins?: ScenePluginDependency[];
    scene: {
        elements: any[];
        sceneSettings?: any;
        macros?: any;
        automation?: any;
    };
    timeline: {
        timeline: any;
        tracks: any;
        tracksOrder: string[];
        playbackRange?: any;
        playbackRangeUserDefined?: boolean;
        rowHeight?: number;
        midiCache: Record<string, any>;
        audioFeatureCaches?: Record<string, SerializedAudioFeatureCache | AudioFeatureCacheAssetReference>;
        audioFeatureCacheStatus?: Record<string, AudioFeatureCacheStatus>;
    };
    assets: {
        storage: AssetStorageMode;
        createdWith: string;
        minAppVersion?: string;
        audio: { byId: Record<string, AudioAssetRecord> };
        waveforms?: { byAudioId: Record<string, WaveformExportRecord> };
        fonts?: { byId: Record<string, import('./font-asset-export').FontAssetRecord> };
        visual?: { byId: Record<string, VisualAssetRecord> };
    };
    references?: {
        audioIdMap: Record<string, string>;
    };
    visualAssetRegistry?: {
        assets: Record<string, { id: string; name: string; filename: string }>;
        assetsOrder: string[];
    };
    compatibility?: { warnings: { message: string }[] };
}

export interface SceneExportEnvelopeV2 extends SceneExportEnvelopeBase {
    schemaVersion: 2;
}

export interface SceneExportEnvelopeV4 extends SceneExportEnvelopeBase {
    schemaVersion: 4;
}

export interface SceneExportEnvelopeV5 extends SceneExportEnvelopeBase {
    schemaVersion: 5;
}

export interface SceneExportEnvelopeV6 extends Omit<SceneExportEnvelopeBase, 'scene'> {
    schemaVersion: 6;
    scene: {
        elements: Record<string, SceneSerializedElementV6>;
        elementsOrder: string[];
        sceneSettings?: any;
        macros?: any;
        fontAssets?: Record<string, any>;
        fontLicensingAcknowledgedAt?: number;
        automation?: any;
    };
}

export interface SceneExportEnvelopeV7 extends Omit<SceneExportEnvelopeV6, 'schemaVersion'> {
    schemaVersion: 7;
}

export interface SceneExportEnvelopeV8 extends Omit<SceneExportEnvelopeV6, 'schemaVersion'> {
    schemaVersion: 8;
}

export interface SceneExportEnvelopeV9 extends Omit<SceneExportEnvelopeV6, 'schemaVersion'> {
    schemaVersion: 9;
}

export interface SceneExportEnvelopeV10 extends Omit<SceneExportEnvelopeV6, 'schemaVersion'> {
    schemaVersion: 10;
}

export type SceneExportEnvelope =
    | SceneExportEnvelopeV2
    | SceneExportEnvelopeV4
    | SceneExportEnvelopeV5
    | SceneExportEnvelopeV6
    | SceneExportEnvelopeV7
    | SceneExportEnvelopeV8
    | SceneExportEnvelopeV9
    | SceneExportEnvelopeV10;

interface AudioFeatureCacheAssetReference {
    assetId: string;
    assetRef: string;
}

const AUDIO_FEATURE_ASSET_FILENAME = 'feature_caches.json';

export interface ExportSceneOptions {
    onProgress?: (value: number, label?: string) => void;
    embedPlugins?: boolean;
    includeLargeAudioFeatureCaches?: boolean;
    maxAudioFeatureCacheBytes?: number;
}

interface ExportResultBase {
    warnings: string[];
}

export interface ExportSceneResultZip extends ExportResultBase {
    ok: true;
    mode: 'zip-package';
    envelope: SceneExportEnvelopeV10;
    zip: Uint8Array<ArrayBuffer>;
    blob?: Blob;
}

export interface ExportSceneResultFailure extends ExportResultBase {
    ok: false;
    errors: { message: string }[];
}

export type ExportSceneResult = ExportSceneResultZip | ExportSceneResultFailure;
const DEFAULT_MAX_AUDIO_FEATURE_CACHE_BYTES = 128 * 1024 * 1024;

function buildCompatibilityWarnings(messages: string[]): { warnings: { message: string }[] } | undefined {
    if (!messages.length) return undefined;
    return { warnings: messages.map((message) => ({ message })) };
}

function serializeTimelineTracksV8(tracks: Record<string, any>): Record<string, any> {
    const next: Record<string, any> = {};
    for (const [id, track] of Object.entries(tracks || {})) {
        if (track?.type === 'midi') {
            next[id] = stripLegacyMidiPlacementFields(migrateTimelineTrackMidiClipsV8(track));
            continue;
        }
        if (track?.type === 'audio') {
            const {
                offsetTicks: _offsetTicks,
                regionStartTick: _regionStartTick,
                regionEndTick: _regionEndTick,
                audioSourceId: _audioSourceId,
                ...audioTrack
            } = track;
            next[id] = {
                ...audioTrack,
                clips: (Array.isArray(track.clips) ? track.clips : []).map((clip: any) => {
                    const {
                        regionStartTick: _clipRegionStartTick,
                        regionEndTick: _clipRegionEndTick,
                        ...currentClip
                    } = clip ?? {};
                    return currentClip;
                }),
            };
            continue;
        }
        next[id] = track;
    }
    return next;
}

function buildVisualAssetRegistry(): SceneExportEnvelopeBase['visualAssetRegistry'] {
    const registry = useVisualAssetRegistryStore.getState();
    if (registry.assetsOrder.length === 0) return undefined;
    const assets: Record<string, { id: string; name: string; filename: string }> = {};
    const filteredOrder: string[] = [];
    for (const id of registry.assetsOrder) {
        const entry = registry.assets[id];
        if (!entry) continue;
        if (entry.origin === 'plugin') continue;
        const filename = typeof entry.file === 'string' ? entry.name : entry.file.name;
        assets[id] = { id, name: entry.name, filename };
        filteredOrder.push(id);
    }
    if (filteredOrder.length === 0) return undefined;
    return { assets, assetsOrder: filteredOrder };
}

function normalizeBlobPart(part: BlobPart): BlobPart {
    if (ArrayBuffer.isView(part)) {
        const view = part as ArrayBufferView;
        const buffer = view.buffer as ArrayBuffer;
        if (view.byteOffset === 0 && view.byteLength === buffer.byteLength) {
            return buffer;
        }
        if (typeof buffer.slice === 'function') {
            return buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
        const copy = new Uint8Array(view.byteLength);
        copy.set(new Uint8Array(buffer, view.byteOffset, view.byteLength));
        return copy.buffer;
    }
    return part;
}

function createBlob(parts: BlobPart[], type: string): Blob | undefined {
    if (typeof Blob === 'undefined') return undefined;
    try {
        const normalized = parts.map((part) => normalizeBlobPart(part));
        return new Blob(normalized, { type });
    } catch {
        return undefined;
    }
}

function base64ToUint8Array(base64: string): Uint8Array {
    if (typeof atob === 'function') {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    const globalBuffer = (globalThis as any)?.Buffer;
    if (typeof globalBuffer?.from === 'function') {
        return new Uint8Array(globalBuffer.from(base64, 'base64'));
    }
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const char of base64.replace(/=+$/, '')) {
        const index = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(char);
        if (index === -1) continue;
        buffer = (buffer << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }
    return new Uint8Array(bytes);
}

async function collectPluginDependencies(
    elements: Array<{ type?: string }> | Record<string, { type?: string }> | undefined,
    options: { embedPlugins: boolean }
): Promise<{
    dependencies: ScenePluginDependency[];
    pluginAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
    warnings: string[];
}> {
    const warnings: string[] = [];
    const dependencies: ScenePluginDependency[] = [];
    const pluginAssets = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();

    const usedTypes = new Set<string>();
    const elementIterable = Array.isArray(elements) ? elements : Object.values(elements ?? {});
    for (const el of elementIterable) {
        if (el && typeof el.type === 'string') {
            usedTypes.add(el.type);
        }
    }

    if (usedTypes.size === 0) {
        return { dependencies, pluginAssets, warnings };
    }

    const pluginState = usePluginStore.getState();
    const manifestById = new Map<string, (typeof pluginState.plugins)[string]['manifest']>();
    const typeToPluginId = new Map<string, string>();
    for (const plugin of Object.values(pluginState.plugins)) {
        manifestById.set(plugin.manifest.id, plugin.manifest);
        for (const element of plugin.manifest.elements ?? []) {
            if (element?.type) {
                typeToPluginId.set(element.type, plugin.manifest.id);
            }
        }
    }

    const dependencyMap = new Map<string, { elementTypesUsed: Set<string> }>();
    for (const type of usedTypes) {
        const pluginId = sceneElementRegistry.getPluginId(type) ?? typeToPluginId.get(type);
        if (!pluginId) {
            continue;
        }
        const entry = dependencyMap.get(pluginId) ?? { elementTypesUsed: new Set<string>() };
        entry.elementTypesUsed.add(type);
        dependencyMap.set(pluginId, entry);
    }

    for (const [pluginId, entry] of dependencyMap.entries()) {
        const manifest = manifestById.get(pluginId);
        if (!manifest) {
            warnings.push(`Plugin metadata missing for ${pluginId}; dependency recorded without version.`);
        }

        let hash: string | undefined;
        let embedded = false;
        let bundleBytes: Uint8Array | null = null;
        try {
            const bundle = await PluginBinaryStore.get(pluginId);
            if (bundle) {
                bundleBytes = new Uint8Array(bundle);
                hash = await sha256Hex(bundleBytes);
            }
        } catch {
            /* ignore hash failures */
        }

        if (options.embedPlugins) {
            if (bundleBytes) {
                embedded = true;
                pluginAssets.set(pluginId, {
                    bytes: bundleBytes,
                    filename: `${pluginId}.mvmnt-plugin`,
                    mimeType: 'application/octet-stream',
                });
            } else {
                warnings.push(`Plugin bundle missing for ${pluginId}; embedding skipped.`);
            }
        }

        dependencies.push({
            pluginId,
            version: manifest?.version ? toPluginVersionRange(manifest.version) : 'unknown',
            hash,
            elementTypesUsed: Array.from(entry.elementTypesUsed).sort(),
            embedded,
        });
    }

    return { dependencies, pluginAssets, warnings };
}

function decodeDataUrl(dataUrl: string | undefined): Uint8Array | null {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const comma = dataUrl.indexOf(',');
    if (comma === -1) return null;
    const base64 = dataUrl.slice(comma + 1);
    try {
        return base64ToUint8Array(base64);
    } catch {
        return null;
    }
}

const MIDI_ASSET_FILENAME = 'track.mid';

function sanitizeAssetComponent(name: string, fallback: string): string {
    const normalized = name
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized.length ? normalized.slice(0, 80) : fallback;
}

function resolveUniqueFilename(base: string, extension: string, used: Set<string>): string {
    let attempt = `${base}${extension}`;
    let counter = 1;
    while (used.has(attempt)) {
        attempt = `${base}_${counter}${extension}`;
        counter++;
    }
    used.add(attempt);
    return attempt;
}

function prepareMidiAssets(midiCache: Record<string, any> | undefined): {
    timelineMidiCache: Record<string, any>;
    assetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
} {
    const cache = midiCache || {};
    const timelineMidiCache: Record<string, any> = {};
    const assetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    for (const [cacheId, entry] of Object.entries(cache)) {
        if (!entry) {
            continue;
        }
        const assetId = encodeURIComponent(cacheId);
        const assetRef = `assets/midi/${assetId}/${MIDI_ASSET_FILENAME}`;
        let midiBytes: Uint8Array;
        try {
            const midiData = entry.midiData ?? {
                events: [],
                ccEvents: [],
                ticksPerQuarter: 480,
                tempo: 500000,
                duration: 0,
                timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
                trimmedTicks: 0,
            };
            midiBytes = encodeMidiToBinary(midiData);
        } catch (err) {
            console.warn('[exportScene] failed to encode MIDI to binary for', cacheId, err);
            continue;
        }
        assetPayloads.set(assetId, {
            bytes: midiBytes,
            filename: MIDI_ASSET_FILENAME,
            mimeType: 'audio/midi',
        });
        const ticksPerQuarter =
            typeof entry.ticksPerQuarter === 'number'
                ? entry.ticksPerQuarter
                : typeof entry.midiData?.ticksPerQuarter === 'number'
                  ? entry.midiData.ticksPerQuarter
                  : undefined;
        const notesCount = Array.isArray(entry.notesRaw) ? entry.notesRaw.length : undefined;
        timelineMidiCache[cacheId] = {
            assetId,
            assetRef,
            ...(ticksPerQuarter !== undefined ? { ticksPerQuarter } : {}),
            notes: notesCount !== undefined ? { count: notesCount } : undefined,
        };
    }
    return { timelineMidiCache, assetPayloads };
}

function buildZip(
    envelope: SceneExportEnvelope,
    audioAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>,
    midiAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>,
    fontAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>,
    waveformAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>,
    audioFeatureAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>,
    pluginAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>,
    visualAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>
): Uint8Array<ArrayBuffer> {
    const files: Record<string, Uint8Array> = {};
    const docJson = serializeStable(envelope);
    files['document.json'] = strToU8(docJson);
    if (typeof iconDataUrl === 'string') {
        let iconBytes: Uint8Array | null = null;
        if (iconDataUrl.startsWith('data:')) {
            const commaIndex = iconDataUrl.indexOf(',');
            if (commaIndex !== -1) {
                const base64 = iconDataUrl.slice(commaIndex + 1);
                try {
                    iconBytes = base64ToUint8Array(base64);
                } catch {
                    /* ignore decode errors */
                }
            }
        } else {
            try {
                iconBytes = base64ToUint8Array(iconDataUrl);
            } catch {
                /* ignore decode errors */
            }
        }
        files['Icon.icns'] = iconBytes ?? strToU8('icns', true);
    }
    for (const [assetId, payload] of audioAssets.entries()) {
        const safeName = payload.filename || `${assetId}.bin`;
        const path = `assets/audio/${assetId}/${safeName}`;
        files[path] = payload.bytes;
    }
    for (const [assetId, payload] of midiAssets.entries()) {
        const safeName = payload.filename || MIDI_ASSET_FILENAME;
        const path = `assets/midi/${assetId}/${safeName}`;
        files[path] = payload.bytes;
    }
    for (const [assetId, payload] of fontAssets.entries()) {
        const safeName = payload.filename || `${assetId}.bin`;
        const path = `assets/fonts/${assetId}/${safeName}`;
        files[path] = payload.bytes;
    }
    for (const [assetKey, payload] of waveformAssets.entries()) {
        const parts = assetKey.split('/');
        const assetId = parts[0];
        const derivedName = parts.slice(1).join('/') || payload.filename || 'waveform.json';
        const path = `assets/waveforms/${assetId}/${derivedName}`;
        files[path] = payload.bytes;
    }
    for (const [assetKey, payload] of audioFeatureAssets.entries()) {
        const parts = assetKey.split('/');
        const assetId = parts[0];
        const derivedName = parts.slice(1).join('/') || payload.filename || AUDIO_FEATURE_ASSET_FILENAME;
        const path = `assets/audio-features/${assetId}/${derivedName}`;
        files[path] = payload.bytes;
    }
    for (const [pluginId, payload] of pluginAssets.entries()) {
        const filename = payload.filename || `${pluginId}.mvmnt-plugin`;
        const path = `plugins/${filename}`;
        files[path] = payload.bytes;
    }
    for (const [assetId, payload] of visualAssets.entries()) {
        const safeName = payload.filename || `${assetId}.bin`;
        const path = `assets/visual/${assetId}/${safeName}`;
        files[path] = payload.bytes;
    }
    return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
}

function prepareAudioFeatureCaches(
    caches: Record<string, any> | undefined,
    options: { includeLargeAudioFeatureCaches?: boolean; maxAudioFeatureCacheBytes: number }
): {
    timelineCaches: Record<string, SerializedAudioFeatureCache | AudioFeatureCacheAssetReference>;
    assetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
    omittedSourceIds: string[];
    omittedBytes: number;
} {
    const timelineCaches: Record<string, SerializedAudioFeatureCache | AudioFeatureCacheAssetReference> = {};
    const assetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    const omittedSourceIds: string[] = [];
    let omittedBytes = 0;
    if (!caches) {
        return { timelineCaches, assetPayloads, omittedSourceIds, omittedBytes };
    }

    const toTypedArray = (
        data: SerializedAudioFeatureTrack['data'] & { type?: 'float32' | 'uint8' | 'int16' }
    ): Float32Array | Uint8Array | Int16Array => {
        if (!data || typeof data !== 'object') {
            return new Float32Array();
        }
        const type = (data as any).type as 'float32' | 'uint8' | 'int16';
        const values = (data as any).values as number[] | Float32Array | Uint8Array | Int16Array | undefined;
        if (type === 'uint8') {
            if (Array.isArray(values)) return Uint8Array.from(values);
            if (ArrayBuffer.isView(values)) {
                const view = values as ArrayBufferView;
                return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
            }
            return new Uint8Array();
        }
        if (type === 'int16') {
            if (Array.isArray(values)) return Int16Array.from(values);
            if (ArrayBuffer.isView(values)) {
                const view = values as ArrayBufferView;
                return new Int16Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
            }
            return new Int16Array();
        }
        if (Array.isArray(values)) return Float32Array.from(values);
        if (ArrayBuffer.isView(values)) {
            const view = values as ArrayBufferView;
            return new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
        }
        return new Float32Array();
    };

    const toUint8Array = (view: ArrayBufferView): Uint8Array => {
        return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    };

    for (const [sourceId, cache] of Object.entries(caches)) {
        try {
            const cacheBytes = estimateFeatureCacheBytes(cache);
            if (!options.includeLargeAudioFeatureCaches && cacheBytes > options.maxAudioFeatureCacheBytes) {
                omittedSourceIds.push(sourceId);
                omittedBytes += cacheBytes;
                recordAudioMemoryDiagnostic({
                    severity: 'warning',
                    stage: 'feature-cache-export-omitted',
                    message: `Skipped large audio feature cache for ${sourceId} (${formatBytes(cacheBytes)}); it can be regenerated`,
                    sourceId,
                    bytes: { featureCache: cacheBytes },
                });
                continue;
            }
            const serialized = serializeAudioFeatureCache(cache);
            {
                const assetId = encodeURIComponent(sourceId);
                const assetRef = `assets/audio-features/${assetId}/${AUDIO_FEATURE_ASSET_FILENAME}`;
                const metadata: SerializedAudioFeatureCache = {
                    ...serialized,
                    featureTracks: {},
                };
                const usedFilenames = new Set<string>();
                let index = 0;
                for (const [trackKey, track] of Object.entries(serialized.featureTracks || {})) {
                    const metadataTrack: SerializedAudioFeatureTrack = { ...track };
                    if (metadataTrack.data) {
                        const baseName = sanitizeAssetComponent(
                            metadataTrack.key || metadataTrack.calculatorId || `track_${index + 1}`,
                            `track_${index + 1}`
                        );
                        if (metadataTrack.format === 'waveform-minmax') {
                            const waveform = metadataTrack.data as {
                                min: number[] | Float32Array;
                                max: number[] | Float32Array;
                            };
                            const minValues = Array.isArray(waveform.min)
                                ? Float32Array.from(waveform.min)
                                : new Float32Array(
                                      (waveform.min as ArrayBufferView).buffer.slice(
                                          (waveform.min as ArrayBufferView).byteOffset,
                                          (waveform.min as ArrayBufferView).byteOffset +
                                              (waveform.min as ArrayBufferView).byteLength
                                      )
                                  );
                            const maxValues = Array.isArray(waveform.max)
                                ? Float32Array.from(waveform.max)
                                : new Float32Array(
                                      (waveform.max as ArrayBufferView).buffer.slice(
                                          (waveform.max as ArrayBufferView).byteOffset,
                                          (waveform.max as ArrayBufferView).byteOffset +
                                              (waveform.max as ArrayBufferView).byteLength
                                      )
                                  );
                            const combined = new Float32Array(minValues.length + maxValues.length);
                            combined.set(minValues, 0);
                            combined.set(maxValues, minValues.length);
                            const filename = resolveUniqueFilename(baseName, '.f32', usedFilenames);
                            const dataRef: SerializedAudioFeatureTrackDataRef = {
                                kind: 'waveform-minmax',
                                type: 'float32',
                                minLength: minValues.length,
                                maxLength: maxValues.length,
                                filename,
                            };
                            metadataTrack.dataRef = dataRef;
                            assetPayloads.set(`${assetId}/${filename}`, {
                                bytes: toUint8Array(combined),
                                filename,
                                mimeType: 'application/octet-stream',
                            });
                        } else if ((metadataTrack.data as any)?.type) {
                            const typed = toTypedArray(metadataTrack.data as any);
                            const type = (metadataTrack.data as any).type as 'float32' | 'uint8' | 'int16';
                            const ext = type === 'float32' ? '.f32' : type === 'uint8' ? '.u8' : '.i16';
                            const filename = resolveUniqueFilename(baseName, ext, usedFilenames);
                            const dataRef: SerializedAudioFeatureTrackDataRef = {
                                kind: 'typed-array',
                                type,
                                valueCount: typed.length,
                                filename,
                            };
                            metadataTrack.dataRef = dataRef;
                            assetPayloads.set(`${assetId}/${filename}`, {
                                bytes: toUint8Array(typed),
                                filename,
                                mimeType: 'application/octet-stream',
                            });
                        }
                        metadataTrack.data = undefined;
                        delete (metadataTrack as { data?: unknown }).data;
                    }
                    metadata.featureTracks![trackKey] = metadataTrack;
                    index++;
                }
                const payloadJson = serializeStable(metadata);
                assetPayloads.set(`${assetId}/${AUDIO_FEATURE_ASSET_FILENAME}`, {
                    bytes: strToU8(payloadJson),
                    filename: AUDIO_FEATURE_ASSET_FILENAME,
                    mimeType: 'application/json',
                });
                timelineCaches[sourceId] = { assetId, assetRef };
            }
        } catch (error) {
            console.warn('[exportScene] failed to serialize audio feature cache', sourceId, error);
        }
    }

    return { timelineCaches, assetPayloads, omittedSourceIds, omittedBytes };
}

export async function exportScene(
    sceneNameOverride?: string,
    options: ExportSceneOptions = {}
): Promise<ExportSceneResult> {
    const reportProgress = (value: number, label: string) => {
        options.onProgress?.(Math.max(0, Math.min(1, value)), label);
    };
    reportProgress(0.02, 'Preparing scene…');
    const doc = DocumentGateway.build();
    const docWarnings: string[] = (doc as any)._warnings ?? [];
    const state = useTimelineStore.getState();
    const metadataStore = (() => {
        try {
            return useSceneMetadataStore.getState();
        } catch {
            return null;
        }
    })();
    const currentMetadata = metadataStore?.metadata;

    const now = new Date().toISOString();
    const overrideName = sceneNameOverride?.trim();
    const fallbackName = (currentMetadata?.name?.trim() || state.timeline.name || '').trim();
    const resolvedName = overrideName && overrideName.length ? overrideName : fallbackName || 'Untitled Scene';
    const resolvedId = (currentMetadata?.id?.trim() || state.timeline.id || '').trim() || 'scene_1';
    const metadata: SceneMetadata = {
        id: resolvedId,
        name: resolvedName,
        createdAt: currentMetadata?.createdAt || now,
        modifiedAt: now,
        format: 'scene',
    };
    const description = currentMetadata?.description?.trim();
    if (description) {
        metadata.description = description;
    }
    const author = currentMetadata?.author?.trim();
    if (author) {
        metadata.author = author;
    }

    if (metadataStore) {
        metadataStore.setMetadata({ name: resolvedName, id: resolvedId, modifiedAt: now });
    }

    const collectResult = await collectAudioAssets({
        onProgress: (progress, label) => reportProgress(0.05 + progress * 0.5, label ?? 'Preparing audio…'),
    });

    reportProgress(0.6, 'Preparing fonts…');
    const fontResult = await collectFontAssets();
    reportProgress(0.66, 'Preparing visual assets…');
    const visualResult = await collectVisualAssets();

    const warnings: string[] = [...docWarnings, ...collectResult.warnings];
    if (collectResult.missingIds.length) {
        warnings.push(`Audio cache entries missing for: ${collectResult.missingIds.join(', ')}`);
    }
    if (fontResult.missing.length) {
        warnings.push(`Font binaries missing for: ${fontResult.missing.join(', ')}`);
    }
    if (visualResult.missing.length) {
        warnings.push(`Visual asset bytes missing for: ${visualResult.missing.join(', ')}`);
    }

    reportProgress(0.72, 'Preparing plugins…');
    const pluginResult = await collectPluginDependencies(doc.scene?.elements, {
        embedPlugins: options.embedPlugins === true,
    });
    warnings.push(...pluginResult.warnings);

    const assetsSection: SceneExportEnvelopeV5['assets'] = {
        storage: 'zip-package',
        createdWith: `mvmnt/${pkg.version ?? 'dev'}`,
        minAppVersion: SCHEMA_TO_MIN_APP_VERSION[CURRENT_SCHEMA_VERSION],
        audio: { byId: collectResult.audioById },
    };
    if (collectResult.waveforms) {
        assetsSection.waveforms = collectResult.waveforms;
    }
    if (Object.keys(fontResult.byId).length) {
        assetsSection.fonts = { byId: fontResult.byId };
    }
    if (Object.keys(visualResult.byId).length) {
        assetsSection.visual = { byId: visualResult.byId };
    }

    // Patch element bindings in-place: replace File objects with stable asset IDs
    // so the envelope serialises correctly. This mutates the in-memory doc only.
    if (visualResult.fileKeyToId.size > 0) {
        const elements = doc.scene?.elements;
        if (elements && typeof elements === 'object') {
            for (const element of Object.values(elements) as any[]) {
                if (!element || typeof element !== 'object') continue;
                const props = element.properties;
                if (!props || typeof props !== 'object') continue;
                for (const [propKey, propData] of Object.entries(props) as [string, any][]) {
                    if (propData?.type !== 'constant') continue;
                    const value = propData.value;
                    if (!(value instanceof File)) continue;
                    const key = `${value.name}:${value.size}:${value.lastModified}`;
                    const assetId = visualResult.fileKeyToId.get(key);
                    if (assetId) {
                        props[propKey] = { type: 'constant', value: assetId };
                    }
                }
            }
        }
    }

    const midiAssets = prepareMidiAssets(doc.midiCache);
    const featureAssets = prepareAudioFeatureCaches(doc.audioFeatureCaches, {
        includeLargeAudioFeatureCaches: options.includeLargeAudioFeatureCaches === true,
        maxAudioFeatureCacheBytes: options.maxAudioFeatureCacheBytes ?? DEFAULT_MAX_AUDIO_FEATURE_CACHE_BYTES,
    });
    if (featureAssets.omittedSourceIds.length) {
        warnings.push(
            `Skipped ${featureAssets.omittedSourceIds.length} large audio analysis cache${
                featureAssets.omittedSourceIds.length === 1 ? '' : 's'
            } (${formatBytes(featureAssets.omittedBytes)}). Analysis can be regenerated after opening.`
        );
    }
    const exportedFeatureStatus =
        doc.audioFeatureCacheStatus && Object.keys(doc.audioFeatureCacheStatus).length
            ? { ...doc.audioFeatureCacheStatus }
            : undefined;
    if (exportedFeatureStatus) {
        for (const sourceId of featureAssets.omittedSourceIds) {
            exportedFeatureStatus[sourceId] = {
                ...(exportedFeatureStatus[sourceId] ?? { state: 'stale', updatedAt: Date.now() }),
                state: 'stale',
                updatedAt: Date.now(),
                message: 'analysis cache omitted during export',
            };
        }
    }

    const envelope: SceneExportEnvelopeV10 = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        format: 'mvmnt.scene',
        metadata,
        plugins: pluginResult.dependencies.length ? pluginResult.dependencies : undefined,
        scene: {
            elements: doc.scene?.elements ?? {},
            elementsOrder: doc.scene?.elementsOrder ?? [],
            sceneSettings: doc.scene?.sceneSettings,
            macros: doc.scene?.macros,
            fontAssets: doc.scene?.fontAssets,
            fontLicensingAcknowledgedAt: doc.scene?.fontLicensingAcknowledgedAt,
            automation: doc.scene?.automation,
        },
        timeline: {
            timeline: doc.timeline,
            tracks: serializeTimelineTracksV8(doc.tracks),
            tracksOrder: doc.tracksOrder,
            playbackRange: doc.playbackRange,
            playbackRangeUserDefined: doc.playbackRangeUserDefined,
            rowHeight: doc.rowHeight,
            midiCache: midiAssets.timelineMidiCache,
            audioFeatureCaches: Object.keys(featureAssets.timelineCaches).length
                ? featureAssets.timelineCaches
                : undefined,
            audioFeatureCacheStatus:
                exportedFeatureStatus && Object.keys(exportedFeatureStatus).length
                    ? exportedFeatureStatus
                    : undefined,
        },
        assets: assetsSection,
        references: Object.keys(collectResult.audioIdMap).length ? { audioIdMap: collectResult.audioIdMap } : undefined,
        visualAssetRegistry: buildVisualAssetRegistry(),
        compatibility: buildCompatibilityWarnings(warnings),
    };

    let zip: Uint8Array<ArrayBuffer>;
    try {
        reportProgress(0.92, 'Packaging scene file…');
        zip = buildZip(
            envelope,
            collectResult.assetPayloads,
            midiAssets.assetPayloads,
            fontResult.assetPayloads,
            collectResult.waveformAssetPayloads,
            featureAssets.assetPayloads,
            pluginResult.pluginAssets,
            visualResult.assetPayloads
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[exportScene] Failed to build zip:', err);
        return {
            ok: false,
            errors: [{ message: `Export failed while packaging the file: ${message}` }],
            warnings,
        };
    }
    reportProgress(1, 'Scene ready.');
    return {
        ok: true,
        mode: 'zip-package',
        envelope,
        zip,
        blob: createBlob([zip], 'application/zip'),
        warnings,
    };
}
