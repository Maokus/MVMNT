import { validateSceneEnvelope } from './validate';
import { DocumentGateway } from './document-gateway';
import type { SceneExportEnvelopeV2 } from './export';
import { deserializeAudioFeatureCache } from '@audio/features/audioFeatureAnalysis';
import { base64ToUint8Array } from '@utils/base64';
import { sha256Hex } from '@utils/hash/sha256';
import { FontBinaryStore } from './font-binary-store';
import { ensureFontVariantsRegistered } from '@fonts/font-loader';
import type { FontAsset } from '@state/scene/fonts';
import {
    decodeSceneText,
    parseLegacyInlineScene,
    parseScenePackage,
    ScenePackageError,
} from './scene-package';

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
    waveformPayloads: Map<string, Uint8Array>;
    audioFeaturePayloads: Map<string, Uint8Array>;
}

async function parseArtifact(input: ImportSceneInput): Promise<ParsedArtifact | { error: ImportError }> {
    if (typeof input === 'string') {
        try {
            console.warn(
                '[importScene] Inline JSON scene imports are deprecated. Please re-export scenes as packaged .mvt files.'
            );
            const legacy = parseLegacyInlineScene(input);
            return {
                envelope: legacy.envelope,
                warnings: legacy.warnings,
                audioPayloads: legacy.audioPayloads,
                midiPayloads: legacy.midiPayloads,
                fontPayloads: legacy.fontPayloads,
                waveformPayloads: legacy.waveformPayloads,
                audioFeaturePayloads: legacy.audioFeaturePayloads,
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
                    console.warn(
                        '[importScene] Inline JSON scene imports are deprecated. Please re-export scenes as packaged .mvt files.'
                    );
                    const legacy = parseLegacyInlineScene(text);
                    return {
                        envelope: legacy.envelope,
                        warnings: legacy.warnings,
                        audioPayloads: legacy.audioPayloads,
                        midiPayloads: legacy.midiPayloads,
                        fontPayloads: legacy.fontPayloads,
                        waveformPayloads: legacy.waveformPayloads,
                        audioFeaturePayloads: legacy.audioFeaturePayloads,
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

function buildDocumentShape(
    envelope: any,
    audioFeaturePayloads: Map<string, Uint8Array>
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
                const assetId = typeof (cache as any).assetId === 'string' ? (cache as any).assetId : encodeURIComponent(id);
                const payload = audioFeaturePayloads.get(assetId);
                if (!payload) {
                    featureWarnings.push(`Missing audio feature payload for cache ${id}`);
                    continue;
                }
                try {
                    const serialized = JSON.parse(decodeSceneText(payload));
                    featureCaches[id] = deserializeAudioFeatureCache(serialized as any);
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

function restoreMidiCache(
    midiSection: any,
    midiPayloads: Map<string, Uint8Array>
): { cache: Record<string, any>; warnings: string[] } {
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
        const assetId = typeof (value as any).assetId === 'string' ? (value as any).assetId : encodeURIComponent(cacheId);
        const payload = midiPayloads.get(assetId);
        if (!payload) {
            warnings.push(`Missing MIDI payload for cache ${cacheId}`);
            continue;
        }
        try {
            const parsed = JSON.parse(decodeSceneText(payload));
            restored[cacheId] = parsed;
        } catch (error) {
            warnings.push(`Failed to parse MIDI payload for cache ${cacheId}: ${(error as Error).message}`);
        }
    }
    return { cache: restored, warnings };
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
        getChannelData: (channel: number) =>
            channelData[Math.min(channel, channelData.length - 1)] ?? channelData[0],
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
    waveformPayloads: Map<string, Uint8Array>,
    warnings: string[]
): any | undefined {
    const entry = waveforms[assetId];
    if (!entry) return undefined;
    if (entry && typeof entry === 'object' && 'channelPeaks' in entry) {
        return entry;
    }
    if (entry && typeof entry === 'object' && 'assetRef' in entry) {
        const waveformAssetId = typeof (entry as any).assetId === 'string' ? (entry as any).assetId : assetId;
        const payload = waveformPayloads.get(waveformAssetId);
        if (!payload) {
            warnings.push(`Missing waveform payload for asset ${assetId}`);
            return undefined;
        }
        try {
            return JSON.parse(decodeSceneText(payload));
        } catch (error) {
            warnings.push(`Failed to parse waveform payload for asset ${assetId}: ${(error as Error).message}`);
            return undefined;
        }
    }
    return undefined;
}

async function hydrateAudioAssets(
    envelope: SceneExportEnvelopeV2,
    assetPayloads: Map<string, Uint8Array>,
    waveformPayloads: Map<string, Uint8Array>
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
    const { useTimelineStore } = (await import('../state/timelineStore')) as typeof import('../state/timelineStore');
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
            ingest(originalId, buffer, { originalFile, waveform });
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
        waveformPayloads,
        audioFeaturePayloads,
    } = parsed;
    const validation = validateSceneEnvelope(envelope);
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors.map((e) => ({ code: e.code, message: e.message, path: e.path })),
            warnings: [...artifactWarnings, ...validation.warnings.map((w) => ({ message: w.message }))],
        };
    }

    const { doc, featureWarnings } = buildDocumentShape(envelope, audioFeaturePayloads);
    const midiRestoration = restoreMidiCache(envelope?.timeline?.midiCache, midiPayloads);
    doc.midiCache = midiRestoration.cache;
    DocumentGateway.apply(doc as any);

    let hydrationWarnings: string[] = [];
    const fontWarnings: string[] = [];
    if (envelope.schemaVersion === 2 && envelope.assets) {
        hydrationWarnings = await hydrateAudioAssets(
            envelope as SceneExportEnvelopeV2,
            audioPayloads,
            waveformPayloads
        );
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
        ...hydrationWarnings.map((message) => ({ message })),
        ...fontWarnings.map((message) => ({ message })),
    ];
    return { ok: true, errors: [], warnings };
}
