import { validateSceneEnvelope } from './validate';
import { migrateSceneV8 } from './migrations/sceneV8';
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
import { AudioAssetStore, createAudioAssetId } from './audio-asset-store';
import { sha256Hex } from '@utils/hash/sha256';
import { FontBinaryStore } from './font-binary-store';
import { PluginBinaryStore } from './plugin-binary-store';
import { loadPlugin, satisfiesVersion } from '@core/scene/plugins';
import { clearSpectrogramTileCache } from '@core/scene/elements/audio-displays/spectrogram-tiles';
import { usePluginStore } from '@state/pluginStore';
import { ensureFontVariantsRegistered, ensureSceneFontsLoaded } from '@fonts/font-loader';
import type { FontAsset } from '@state/scene/fonts';
import { decodeSceneText, parseScenePackage, ScenePackageError } from './scene-package';
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
import { migrateSceneRotationUnitsV7 } from './migrations/rotationUnitsV7';
import { prepareTextBoundsMigrationFonts } from './migrations/textBoundsV11';
import { throwIfImportAborted, throwIfImportAborted as throwIfAborted } from './import-abort';
import { parseArtifact } from './import/parseArtifact';
import { assessPluginDependencies, installEmbeddedPlugins } from './import/pluginHydration';
import { buildDocumentShape } from './import/documentShape';
import {
    hydrateVisualAssetRegistry,
    migrateStoreAssetRefBindings,
    restoreMidiCache,
    restoreVisualAssets,
} from './import/assetHydration';
import { hydrateAudioAssets } from './import/audioHydration';
import { migrateAndValidateScene } from './import/migrationOrchestration';
import { applyImportedDocument } from './import/documentApplication';

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

export async function importScene(
    input: ImportSceneInput,
    options: ImportSceneOptions = {}
): Promise<ImportSceneResult> {
    options.onProgress?.(0.05, 'Starting scene import…');
    const parsed = await parseArtifact(input, options);
    throwIfAborted(options.signal);
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
    options.onProgress?.(0.35, 'Validating scene…');
    const { envelope: migratedEnvelope, validation } = await migrateAndValidateScene(
        envelope,
        fontPayloads,
        options.signal
    );
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors.map((e) => ({ code: e.code, message: e.message, path: e.path })),
            warnings: [...artifactWarnings, ...validation.warnings.map((w) => ({ message: w.message }))],
        };
    }

    options.onProgress?.(0.43, 'Loading scene fonts…');

    const pluginWarnings: string[] = [];
    const dependencies = Array.isArray(migratedEnvelope?.plugins)
        ? (migratedEnvelope.plugins as ScenePluginDependency[])
        : [];
    const dependencyAssessment = await assessPluginDependencies(dependencies, pluginPayloads, options);
    pluginWarnings.push(...dependencyAssessment.warnings);

    if (dependencyAssessment.embeddedMissing.length) {
        const canPrompt = !isTestEnvironment() && typeof window !== 'undefined' && typeof window.confirm === 'function';
        const shouldInstall =
            options.autoInstallEmbeddedPlugins ||
            (canPrompt
                ? window.confirm('This scene includes embedded plugins needed for some elements. Install them now?')
                : false);
        if (shouldInstall) {
            pluginWarnings.push(
                ...(await installEmbeddedPlugins(dependencyAssessment.embeddedMissing, pluginPayloads, options))
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

    throwIfAborted(options.signal);
    options.onProgress?.(0.5, 'Restoring timeline data…');
    const { doc, featureWarnings } = buildDocumentShape(migratedEnvelope, audioFeaturePayloads);
    const midiRestoration = await restoreMidiCache(migratedEnvelope?.timeline?.midiCache, midiPayloads, options);
    doc.midiCache = midiRestoration.cache;

    options.onProgress?.(0.62, 'Restoring visual assets…');
    const { warnings: visualWarnings, fileById } = restoreVisualAssets(
        doc.scene,
        migratedEnvelope.assets?.visual,
        visualPayloads,
        options
    );

    throwIfAborted(options.signal);
    options.onProgress?.(0.72, 'Applying scene…');
    const importTimelineGeneration = applyImportedDocument(
        doc,
        fileById,
        migratedEnvelope.assets?.visual,
        (migratedEnvelope as any).visualAssetRegistry
    );

    let hydrationWarnings: string[] = [];
    const fontWarnings: string[] = [];
    if (
        (migratedEnvelope.schemaVersion === 2 ||
            migratedEnvelope.schemaVersion === 4 ||
            migratedEnvelope.schemaVersion === 5 ||
            migratedEnvelope.schemaVersion === 6 ||
            migratedEnvelope.schemaVersion === 7 ||
            migratedEnvelope.schemaVersion === 8) &&
        migratedEnvelope.assets
    ) {
        options.onProgress?.(0.82, 'Restoring audio assets…');
        hydrationWarnings = await hydrateAudioAssets(
            migratedEnvelope,
            audioPayloads,
            waveformPayloads,
            options,
            importTimelineGeneration
        );
    }

    if (migratedEnvelope.scene?.fontAssets && typeof migratedEnvelope.scene.fontAssets === 'object') {
        options.onProgress?.(0.9, 'Restoring fonts…');
        const fontAssets = migratedEnvelope.scene.fontAssets as Record<string, FontAsset>;
        for (const asset of Object.values(fontAssets)) {
            throwIfAborted(options.signal);
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

    // Audio cache is runtime-only. Retain only sources referenced by the newly
    // loaded timeline before removing old originals from IndexedDB. Doing this
    // after hydration preserves the import cancellation safeguards above.
    const timelineState = useTimelineStore.getState();
    const referencedSourceIds = findReferencedAudioSourceIds(timelineState);
    const activeAudioCache = Object.fromEntries(
        Object.entries(timelineState.audioCache).filter(([sourceId]) => referencedSourceIds.has(sourceId))
    );
    useTimelineStore.setState({ audioCache: activeAudioCache });

    // Large imported originals receive fresh audio-import IDs. Once this
    // document has replaced the previous scene, reclaim every old persisted
    // original so repeatedly opening large projects does not exhaust quota.
    const referencedAudioAssetIds = Object.values(activeAudioCache)
        .map((entry) => entry?.originalFile?.assetId)
        .filter((assetId): assetId is string => typeof assetId === 'string');
    await AudioAssetStore.removeUnreferenced(referencedAudioAssetIds);

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
    // Runtime elements are rebuilt before visual files are restored into the
    // project registry. Signal completion only after every imported asset is
    // available so the preview's next frame resolves image references against
    // the new registry rather than the scene that was just replaced.
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mvmnt-scene-import-complete'));
    }
    options.onProgress?.(1, 'Scene loaded.');
    return { ok: true, errors: [], warnings };
}
