import { serializeStable } from './stable-stringify';
import { useTimelineStore } from '../state/timelineStore';
import { DocumentGateway } from './document-gateway';
import {
    collectAudioAssets,
    type AssetStorageMode,
    type AudioAssetRecord,
    type WaveformAssetRecord,
} from './audio-asset-export';
import pkg from '../../package.json';
import { zipSync, strToU8 } from 'fflate';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';

export interface SceneMetadata {
    id: string;
    name: string;
    createdAt: string;
    modifiedAt: string;
    format: 'scene';
    description?: string;
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
    timeline: any;
    assets: {
        storage: AssetStorageMode;
        createdWith: string;
        audio: { byId: Record<string, AudioAssetRecord> };
        waveforms?: { byAudioId: Record<string, WaveformAssetRecord> };
    };
    references?: {
        audioIdMap: Record<string, string>;
    };
    compatibility?: { warnings: { message: string }[] };
}

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

function buildZip(
    envelope: SceneExportEnvelopeV2,
    assets: Map<string, { bytes: Uint8Array; filename: string; mimeType: string }>
): Uint8Array<ArrayBuffer> {
    const files: Record<string, Uint8Array> = {};
    const docJson = serializeStable(envelope);
    files['document.json'] = strToU8(docJson, true);
    for (const [assetId, payload] of assets.entries()) {
        const safeName = payload.filename || `${assetId}.bin`;
        const path = `assets/audio/${assetId}/${safeName}`;
        files[path] = payload.bytes;
    }
    return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
}

export async function exportScene(
    sceneNameOverride?: string,
    options: ExportSceneOptions = {}
): Promise<ExportSceneResult> {
    const storage: AssetStorageMode = options.storage || 'inline-json';
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

    const warnings: string[] = [...collectResult.warnings];
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
            midiCache: doc.midiCache,
        },
        assets: assetsSection,
        references: Object.keys(collectResult.audioIdMap).length
            ? { audioIdMap: collectResult.audioIdMap }
            : undefined,
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

    const zip = buildZip(envelope, collectResult.assetPayloads);
    return {
        ok: true,
        mode: 'zip-package',
        envelope,
        zip,
        blob: createBlob([zip], 'application/zip'),
        warnings,
    };
}
