import { serializeStable } from './stable-stringify';
import { useTimelineStore } from '../state/timelineStore';
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
import iconDataUrl from '@assets/Icon.icns?inline';
import { serializeAudioFeatureCache, type SerializedAudioFeatureCache } from '@audio/features/audioFeatureAnalysis';
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

export interface SceneExportEnvelopeV2 {
    schemaVersion: 2;
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

interface AudioFeatureCacheAssetReference {
    assetId: string;
    assetRef: string;
}

const AUDIO_FEATURE_ASSET_FILENAME = 'feature-cache.json';

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
    envelope: SceneExportEnvelopeV2;
    json: string;
    blob?: Blob;
}

export interface ExportSceneResultZip extends ExportResultBase {
    ok: true;
    mode: 'zip-package';
    envelope: SceneExportEnvelopeV2;
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
        const payloadJson = serializeStable(entry);
        assetPayloads.set(assetId, {
            bytes: strToU8(payloadJson, true),
            filename: MIDI_ASSET_FILENAME,
            mimeType: 'application/json',
        });
        timelineMidiCache[cacheId] = {
            assetId,
            assetRef,
            ticksPerQuarter: entry.ticksPerQuarter,
            notes: Array.isArray(entry.notesRaw) ? { count: entry.notesRaw.length } : undefined,
        };
    }
    return { timelineMidiCache, assetPayloads };
}

function buildZip(
    envelope: SceneExportEnvelopeV2,
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
    for (const [assetId, payload] of waveformAssets.entries()) {
        const safeName = payload.filename || 'waveform.json';
        const path = `assets/waveforms/${assetId}/${safeName}`;
        files[path] = payload.bytes;
    }
    for (const [assetId, payload] of audioFeatureAssets.entries()) {
        const safeName = payload.filename || AUDIO_FEATURE_ASSET_FILENAME;
        const path = `assets/audio-features/${assetId}/${safeName}`;
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

    for (const [sourceId, cache] of Object.entries(caches)) {
        try {
            const serialized = serializeAudioFeatureCache(cache);
            if (mode === 'zip-package') {
                const assetId = encodeURIComponent(sourceId);
                const assetRef = `assets/audio-features/${assetId}/${AUDIO_FEATURE_ASSET_FILENAME}`;
                const payloadJson = serializeStable(serialized);
                assetPayloads.set(assetId, {
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
        console.warn(`[exportScene] ${message}`);
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

    const assetsSection: SceneExportEnvelopeV2['assets'] = {
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

    const envelope: SceneExportEnvelopeV2 = {
        schemaVersion: 2,
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
