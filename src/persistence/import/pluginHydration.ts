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

export async function assessPluginDependencies(
    dependencies: ScenePluginDependency[] | undefined,
    pluginPayloads: Map<string, Uint8Array>,
    options: ImportSceneOptions = {}
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
        throwIfAborted(options.signal);
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

export async function installEmbeddedPlugins(
    dependencies: ScenePluginDependency[],
    pluginPayloads: Map<string, Uint8Array>,
    options: ImportSceneOptions = {}
): Promise<string[]> {
    const warnings: string[] = [];
    for (const dep of dependencies) {
        throwIfAborted(options.signal);
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
        const result = await loadPlugin(pluginBuffer, {
            persist: dep.source !== 'development',
            source: dep.source === 'development' ? 'development' : 'installed',
        });
        if (!result.success) {
            warnings.push(`Failed to install plugin ${dep.pluginId}: ${result.error || 'Unknown error'}`);
        }
    }

    return warnings;
}
