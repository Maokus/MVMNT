import type { PersistentDocumentV1 } from '../document-gateway';
import type { ScenePackageContents } from '../scene-package';

export interface ImportWarning {
    message: string;
}

export interface ImportError {
    code?: string;
    message: string;
    path?: string;
}

export interface ImportResultSuccess {
    ok: true;
    errors: [];
    warnings: ImportWarning[];
}

export interface ImportResultFailure {
    ok: false;
    errors: ImportError[];
    warnings: ImportWarning[];
}

export type ImportSceneResult = ImportResultSuccess | ImportResultFailure;
export type ImportSceneInput = ArrayBuffer | Uint8Array | Blob;

export interface ImportSceneOptions {
    signal?: AbortSignal;
    onProgress?: (progress: number, text?: string) => void;
    /** Install embedded dependencies without prompting (used by isolated background exports). */
    autoInstallEmbeddedPlugins?: boolean;
}

export type ParsedArtifact = ScenePackageContents;

/** Current, migrated document accepted by the final application boundary. */
export type ValidatedCurrentDocument = PersistentDocumentV1;
