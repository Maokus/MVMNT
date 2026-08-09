import { decodeSceneText, parseScenePackage, ScenePackageError } from '../scene-package';
import { throwIfImportAborted } from '../import-abort';
import type { ImportError, ImportSceneInput, ImportSceneOptions, ParsedArtifact } from './contracts';

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
