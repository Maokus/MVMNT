import { serializeStable } from './stable-stringify';
import { useTimelineStore } from '@state/timelineStore';
import { DocumentGateway } from './document-gateway';
import {
    collectAudioAssets,
    type AssetStorageMode,
    type AudioAssetRecord,
    type WaveformExportRecord,
} from './audio-asset-export';
import { collectFontAssets } from './font-asset-export';
import pkg from '../../package.json';
import { zipSync, strToU8 } from 'fflate';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { isTestEnvironment } from '@utils/env';
import iconDataUrl from '@assets/Icon.icns?inline';
import {
    serializeAudioFeatureCache,
    type SerializedAudioFeatureCache,
    type SerializedAudioFeatureTrack,
    type SerializedAudioFeatureTrackDataRef,
} from '@audio/features/audioFeatureAnalysis';
import type { AudioFeatureCacheStatus } from '@audio/features/audioFeatureTypes';

export interface SceneMetadata {
    id: string;
    name: string;
    createdAt: string;
    modifiedAt: string;
    format: 'scene';
    description?: string;
    author?: string;
}

interface SceneExportEnvelopeBase {
    format: 'mvmnt.scene';
    metadata: SceneMetadata;
    scene: {
        elements: any[];
        sceneSettings?: any;
        macros?: any;
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
        audio: { byId: Record<string, AudioAssetRecord> };
        waveforms?: { byAudioId: Record<string, WaveformExportRecord> };
        fonts?: { byId: Record<string, import('./font-asset-export').FontAssetRecord> };
    };
    references?: {
        audioIdMap: Record<string, string>;
    };
    compatibility?: { warnings: { message: string }[] };
}

export interface SceneExportEnvelopeV2 extends SceneExportEnvelopeBase {
    schemaVersion: 2;
}

export interface SceneExportEnvelopeV4 extends SceneExportEnvelopeBase {
    schemaVersion: 4;
}

export type SceneExportEnvelope = SceneExportEnvelopeV2 | SceneExportEnvelopeV4;

interface AudioFeatureCacheAssetReference {
    assetId: string;
    assetRef: string;
}

const AUDIO_FEATURE_ASSET_FILENAME = 'feature_caches.json';

export interface ExportSceneOptions {
    storage?: AssetStorageMode;
    maxInlineBytes?: number;
    inlineWarnBytes?: number;
    maxInlineAssetBytes?: number;
    onProgress?: (value: number, label?: string) => void;
}

interface ExportResultBase {
    warnings: string[];
}

/** @deprecated Legacy inline JSON export result. */
export interface ExportSceneResultInline extends ExportResultBase {
    ok: true;
    mode: 'inline-json';
    envelope: SceneExportEnvelopeV4;
    json: string;
    blob?: Blob;
}

export interface ExportSceneResultZip extends ExportResultBase {
    ok: true;
    mode: 'zip-package';
    envelope: SceneExportEnvelopeV4;
    zip: Uint8Array<ArrayBuffer>;
    blob?: Blob;
}

export interface ExportSceneResultFailure extends ExportResultBase {
    ok: false;
    errors: { message: string }[];
}

export type ExportSceneResult = ExportSceneResultInline | ExportSceneResultZip | ExportSceneResultFailure;

const DEFAULT_MAX_INLINE_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_INLINE_WARN_BYTES = 25 * 1024 * 1024; // 25 MB
const DEFAULT_MAX_INLINE_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB

function buildCompatibilityWarnings(messages: string[]): { warnings: { message: string }[] } | undefined {
    if (!messages.length) return undefined;
    return { warnings: messages.map((message) => ({ message })) };
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

const MIDI_ASSET_FILENAME = 'midi.json';
const MIDI_CACHE_ASSET_VERSION = 1;

function sanitizeTypedArray(view: ArrayBufferView): number[] {
    const slice = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    const ctor = (view as any)?.constructor;
    if (typeof ctor === 'function' && typeof (ctor as any).BYTES_PER_ELEMENT === 'number') {
        try {
            const clone = new (ctor as any)(slice);
            return Array.from(clone as ArrayLike<number>);
        } catch {
            /* fall through to Uint8Array fallback */
        }
    }
    return Array.from(new Uint8Array(slice));
}

function sanitizePlainValue(value: any, stack: WeakSet<object>): any {
    if (value === null) {
        return null;
    }
    const valueType = typeof value;
    if (valueType === 'undefined') {
        return undefined;
    }
    if (valueType === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (valueType === 'string' || valueType === 'boolean') {
        return value;
    }
    if (valueType === 'bigint') {
        const numeric = Number(value);
        return Number.isSafeInteger(numeric) ? numeric : value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (ArrayBuffer.isView(value)) {
        return sanitizeTypedArray(value);
    }
    if (value instanceof ArrayBuffer) {
        return sanitizeTypedArray(new Uint8Array(value.slice(0)));
    }
    if (Array.isArray(value)) {
        if (stack.has(value)) {
            return undefined;
        }
        stack.add(value);
        try {
            const arr: any[] = [];
            for (const item of value) {
                const sanitizedItem = sanitizePlainValue(item, stack);
                if (sanitizedItem !== undefined) {
                    arr.push(sanitizedItem);
                }
            }
            return arr;
        } finally {
            stack.delete(value);
        }
    }
    if (valueType === 'object') {
        if (stack.has(value)) {
            return undefined;
        }
        stack.add(value);
        try {
            const result: Record<string, any> = {};
            for (const [key, val] of Object.entries(value)) {
                if (typeof val === 'function' || typeof val === 'symbol') {
                    continue;
                }
                const sanitizedVal = sanitizePlainValue(val, stack);
                if (sanitizedVal !== undefined) {
                    result[key] = sanitizedVal;
                }
            }
            return result;
        } finally {
            stack.delete(value);
        }
    }
    return undefined;
}

function pruneSelfReferences(node: any, stack: WeakSet<object> = new WeakSet<object>()): void {
    if (!node || typeof node !== 'object') {
        return;
    }
    if (stack.has(node)) {
        return;
    }
    stack.add(node);

    if (Array.isArray(node)) {
        for (const item of node) {
            pruneSelfReferences(item, stack);
        }
    } else {
        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === 'object') {
                if (value === node) {
                    delete (node as Record<string, any>)[key];
                    continue;
                }
                pruneSelfReferences(value, stack);
            }
        }
    }

    stack.delete(node);
}

function sanitizeMidiCacheEntry(entry: any): Record<string, any> {
    const sanitized = sanitizePlainValue(entry, new WeakSet<object>());
    const normalized: Record<string, any> =
        sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? { ...sanitized } : {};

    const sourceTicks =
        typeof entry?.ticksPerQuarter === 'number' && Number.isFinite(entry.ticksPerQuarter)
            ? entry.ticksPerQuarter
            : undefined;
    const sanitizedTicks =
        typeof normalized.ticksPerQuarter === 'number' && Number.isFinite(normalized.ticksPerQuarter)
            ? normalized.ticksPerQuarter
            : typeof normalized.midiData?.ticksPerQuarter === 'number' &&
              Number.isFinite(normalized.midiData.ticksPerQuarter)
            ? normalized.midiData.ticksPerQuarter
            : undefined;
    const ticksPerQuarter = sanitizedTicks ?? sourceTicks;
    if (ticksPerQuarter !== undefined) {
        normalized.ticksPerQuarter = ticksPerQuarter;
    } else {
        delete normalized.ticksPerQuarter;
    }

    if (!Array.isArray(normalized.notesRaw)) {
        normalized.notesRaw = [];
    }

    if (Array.isArray(normalized.tempoMap)) {
        normalized.tempoMap = normalized.tempoMap
            .map((item: any) => {
                if (!item || typeof item !== 'object') {
                    return undefined;
                }
                const time = typeof item.time === 'number' && Number.isFinite(item.time) ? item.time : undefined;
                const tempo = typeof item.tempo === 'number' && Number.isFinite(item.tempo) ? item.tempo : undefined;
                if (time === undefined || tempo === undefined) {
                    return undefined;
                }
                return { time, tempo };
            })
            .filter(Boolean);
        if (!normalized.tempoMap.length) {
            delete normalized.tempoMap;
        }
    }

    if (normalized.midiData && typeof normalized.midiData === 'object') {
        const midiData = normalized.midiData as Record<string, any>;
        if (Array.isArray(midiData.events)) {
            midiData.events = midiData.events.filter(
                (event: any) => event && typeof event === 'object' && typeof event.type === 'string'
            );
        }
        if (Array.isArray(midiData.trackSummaries)) {
            midiData.trackSummaries = midiData.trackSummaries.filter(
                (summary: any) => summary && typeof summary === 'object'
            );
        }
        if (Array.isArray(midiData.trackDetails)) {
            midiData.trackDetails = midiData.trackDetails
                .filter((detail: any) => detail && typeof detail === 'object')
                .map((detail: any) => {
                    if (Array.isArray(detail.events)) {
                        detail.events = detail.events.filter(
                            (event: any) => event && typeof event === 'object' && typeof event.type === 'string'
                        );
                    }
                    if (Array.isArray(detail.channels)) {
                        detail.channels = detail.channels.filter(
                            (channel: any) => typeof channel === 'number' && Number.isFinite(channel)
                        );
                    }
                    return detail;
                });
        }
    }

    pruneSelfReferences(normalized);

    return {
        ...normalized,
        __mvmntMidiAssetVersion: MIDI_CACHE_ASSET_VERSION,
    };
}

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

function prepareMidiAssets(
    midiCache: Record<string, any> | undefined,
    mode: AssetStorageMode
): {
    timelineMidiCache: Record<string, any>;
    assetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
} {
    const cache = midiCache || {};
    if (mode !== 'zip-package') {
        return { timelineMidiCache: cache, assetPayloads: new Map() };
    }
    const timelineMidiCache: Record<string, any> = {};
    const assetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    for (const [cacheId, entry] of Object.entries(cache)) {
        if (!entry) {
            continue;
        }
        const assetId = encodeURIComponent(cacheId);
        const assetRef = `assets/midi/${assetId}/${MIDI_ASSET_FILENAME}`;
        const sanitizedEntry = sanitizeMidiCacheEntry(entry);
        const payloadJson = serializeStable(sanitizedEntry);
        assetPayloads.set(assetId, {
            bytes: strToU8(payloadJson, true),
            filename: MIDI_ASSET_FILENAME,
            mimeType: 'application/json',
        });
        const ticksPerQuarter =
            typeof sanitizedEntry.ticksPerQuarter === 'number'
                ? sanitizedEntry.ticksPerQuarter
                : typeof entry.ticksPerQuarter === 'number'
                ? entry.ticksPerQuarter
                : undefined;
        const notesCount = Array.isArray(sanitizedEntry.notesRaw)
            ? sanitizedEntry.notesRaw.length
            : Array.isArray(entry.notesRaw)
            ? entry.notesRaw.length
            : undefined;
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
    audioFeatureAssets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>
): Uint8Array<ArrayBuffer> {
    const files: Record<string, Uint8Array> = {};
    const docJson = serializeStable(envelope);
    files['document.json'] = strToU8(docJson, true);
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
    return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
}

function prepareAudioFeatureCaches(
    caches: Record<string, any> | undefined,
    mode: AssetStorageMode
): {
    timelineCaches: Record<string, SerializedAudioFeatureCache | AudioFeatureCacheAssetReference>;
    assetPayloads: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>;
} {
    const timelineCaches: Record<string, SerializedAudioFeatureCache | AudioFeatureCacheAssetReference> = {};
    const assetPayloads = new Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>();
    if (!caches) {
        return { timelineCaches, assetPayloads };
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
            const serialized = serializeAudioFeatureCache(cache);
            if (mode === 'zip-package') {
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
                    bytes: strToU8(payloadJson, true),
                    filename: AUDIO_FEATURE_ASSET_FILENAME,
                    mimeType: 'application/json',
                });
                timelineCaches[sourceId] = { assetId, assetRef };
            } else {
                timelineCaches[sourceId] = serialized;
            }
        } catch (error) {
            console.warn('[exportScene] failed to serialize audio feature cache', sourceId, error);
        }
    }

    return { timelineCaches, assetPayloads };
}

export async function exportScene(
    sceneNameOverride?: string,
    options: ExportSceneOptions = {}
): Promise<ExportSceneResult> {
    const storage: AssetStorageMode = options.storage ?? 'zip-package';
    const preflightWarnings: string[] = [];
    if (storage === 'inline-json') {
        const message =
            'Legacy inline JSON export mode is deprecated. Packaged .mvt exports are recommended for future compatibility.';
        if (!isTestEnvironment()) {
            console.warn(`[exportScene] ${message}`);
        }
        preflightWarnings.push(message);
    }
    const doc = DocumentGateway.build();
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
        mode: storage,
        maxInlineBytes: options.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
        inlineWarnBytes: options.inlineWarnBytes ?? DEFAULT_INLINE_WARN_BYTES,
        maxInlineAssetBytes: options.maxInlineAssetBytes ?? DEFAULT_MAX_INLINE_ASSET_BYTES,
        onProgress: options.onProgress,
    });

    const fontResult = await collectFontAssets();

    const warnings: string[] = [...preflightWarnings, ...collectResult.warnings];
    if (collectResult.missingIds.length) {
        warnings.push(`Audio cache entries missing for: ${collectResult.missingIds.join(', ')}`);
    }
    if (collectResult.inlineOversizedAssets?.length) {
        warnings.push(
            `Assets ${collectResult.inlineOversizedAssets.join(', ')} exceed the inline size cap of ${Math.round(
                (options.maxInlineAssetBytes ?? DEFAULT_MAX_INLINE_ASSET_BYTES) / (1024 * 1024)
            )} MB.`
        );
    }
    if (fontResult.missing.length) {
        warnings.push(`Font binaries missing for: ${fontResult.missing.join(', ')}`);
    }

    if (storage === 'inline-json' && collectResult.inlineRejected) {
        const limitMb = ((options.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES) / (1024 * 1024)).toFixed(1);
        return {
            ok: false,
            errors: [
                {
                    message: `Inline export exceeds the ${limitMb} MB limit. Use ZIP export instead.`,
                },
            ],
            warnings,
        };
    }

    const assetsSection: SceneExportEnvelopeV4['assets'] = {
        storage,
        createdWith: `mvmnt/${pkg.version ?? 'dev'}`,
        audio: { byId: collectResult.audioById },
    };
    if (collectResult.waveforms) {
        assetsSection.waveforms = collectResult.waveforms;
    }
    if (Object.keys(fontResult.byId).length) {
        assetsSection.fonts = { byId: fontResult.byId };
    }

    const midiAssets = prepareMidiAssets(doc.midiCache, storage);
    const featureAssets = prepareAudioFeatureCaches(doc.audioFeatureCaches, storage);

    const envelope: SceneExportEnvelopeV4 = {
        schemaVersion: 4,
        format: 'mvmnt.scene',
        metadata,
        scene: { ...doc.scene },
        timeline: {
            timeline: doc.timeline,
            tracks: doc.tracks,
            tracksOrder: doc.tracksOrder,
            playbackRange: doc.playbackRange,
            playbackRangeUserDefined: doc.playbackRangeUserDefined,
            rowHeight: doc.rowHeight,
            midiCache: midiAssets.timelineMidiCache,
            audioFeatureCaches: Object.keys(featureAssets.timelineCaches).length
                ? featureAssets.timelineCaches
                : undefined,
            audioFeatureCacheStatus:
                doc.audioFeatureCacheStatus && Object.keys(doc.audioFeatureCacheStatus).length
                    ? doc.audioFeatureCacheStatus
                    : undefined,
        },
        assets: assetsSection,
        references: Object.keys(collectResult.audioIdMap).length ? { audioIdMap: collectResult.audioIdMap } : undefined,
        compatibility: buildCompatibilityWarnings(warnings),
    };

    if (storage === 'inline-json') {
        const json = serializeStable(envelope);
        return {
            ok: true,
            mode: 'inline-json',
            envelope,
            json,
            blob: createBlob([json], 'application/json'),
            warnings,
        };
    }

    const zip = buildZip(
        envelope,
        collectResult.assetPayloads,
        midiAssets.assetPayloads,
        fontResult.assetPayloads,
        collectResult.waveformAssetPayloads,
        featureAssets.assetPayloads
    );
    return {
        ok: true,
        mode: 'zip-package',
        envelope,
        zip,
        blob: createBlob([zip], 'application/zip'),
        warnings,
    };
}
