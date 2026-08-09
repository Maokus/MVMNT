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

export async function parseArtifact(
    input: ImportSceneInput,
    options: ImportSceneOptions = {}
): Promise<ParsedArtifact | { error: ImportError }> {
    throwIfImportAborted(options.signal);
    options.onProgress?.(0.1, 'Reading scene file…');
    let bytes: Uint8Array | null = null;
    if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
    } else if (input instanceof Uint8Array) {
        bytes = input;
    } else if (ArrayBuffer.isView(input)) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
        bytes = new Uint8Array(await input.arrayBuffer());
    }
    throwIfImportAborted(options.signal);

    if (!bytes) {
        return { error: { code: 'ERR_INPUT_TYPE', message: 'Unsupported import input' } };
    }

    try {
        options.onProgress?.(0.2, 'Parsing scene package…');
        return parseScenePackage(bytes);
    } catch (error) {
        if (error instanceof ScenePackageError || (error as { code?: unknown }).code) {
            const packageError = error as ScenePackageError;
            return { error: { code: packageError.code, message: packageError.message } };
        }
        return { error: { code: 'ERR_PACKAGE_FORMAT', message: (error as Error).message } };
    }
}
