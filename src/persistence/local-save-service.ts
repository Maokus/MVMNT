/**
 * Orchestrates saving the current in-memory state to IndexedDB and loading it
 * back on startup.
 *
 * Deliberately kept thin: serialisation is delegated to exportScene / importScene
 * (the same path used for file export / import) so there is a single source of
 * truth for the file format.
 */

import { exportScene } from './export';
import { importScene, type ImportSceneOptions } from './import';
import { LocalFileStore } from './local-file-store';

export type LocalSaveResult =
    | { ok: true }
    | { ok: false; error: string };

export type LocalLoadResult =
    /** File loaded and applied to app state. */
    | { ok: true; loaded: true }
    /** No saved file found – caller should fall back to the default template. */
    | { ok: true; loaded: false }
    /** File existed but could not be parsed / applied. */
    | { ok: false; error: string };

export interface LocalSaveOptions {
    onProgress?: (progress: number, message?: string) => void;
}

function createAbortError(): Error {
    if (typeof DOMException === 'function') {
        return new DOMException('Local file load aborted', 'AbortError');
    }
    const error = new Error('Local file load aborted');
    error.name = 'AbortError';
    return error;
}

export const LocalSaveService = {
    /**
     * Serialize the current app state and write it to IndexedDB.
     * Uses the same exportScene pipeline as file export so the stored bytes are
     * a valid .mvt package that can be opened on any device.
     */
    async saveCurrentFile(sceneName?: string, options: LocalSaveOptions = {}): Promise<LocalSaveResult> {
        options.onProgress?.(0, 'Preparing scene…');
        let res;
        try {
            res = await exportScene(sceneName, {
                onProgress: (progress, message) => options.onProgress?.(progress * 0.85, message),
            });
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }

        if (!res.ok) {
            return {
                ok: false,
                error: res.errors?.map((e) => e.message).join('\n') || 'Export failed.',
            };
        }

        if (res.mode !== 'zip-package') {
            return { ok: false, error: 'Unexpected export mode: ' + res.mode };
        }

        try {
            options.onProgress?.(0.9, 'Saving file…');
            await LocalFileStore.save(res.zip);
            options.onProgress?.(1, 'File saved.');
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }

        if (res.warnings?.length) {
            // Log non-fatal warnings but still treat the save as successful
            console.warn('[LocalSaveService] Save completed with warnings:', res.warnings);
        }

        return { ok: true };
    },

    /**
     * Read the saved file from IndexedDB and hydrate the app state.
     * Returns `{ loaded: false }` (not an error) when no file has been saved yet.
     */
    async loadSavedFile(options: ImportSceneOptions = {}): Promise<LocalLoadResult> {
        options.onProgress?.(0.05, 'Loading last open file…');
        let bytes: Uint8Array | null;
        try {
            bytes = await LocalFileStore.load();
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }

        if (!bytes) {
            return { ok: true, loaded: false };
        }
        if (options.signal?.aborted) {
            throw createAbortError();
        }

        let result;
        try {
            result = await importScene(bytes, options);
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') {
                throw e;
            }
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }

        if (!result.ok) {
            const errorMsg = result.errors.map((e) => e.message).join('\n');
            return { ok: false, error: errorMsg };
        }

        return { ok: true, loaded: true };
    },

    /** Non-loading check for whether a saved file exists. */
    async hasSavedFile(): Promise<boolean> {
        try {
            return await LocalFileStore.exists();
        } catch {
            return false;
        }
    },

    async savedAt(): Promise<number | null> {
        try {
            return await LocalFileStore.savedAt();
        } catch {
            return null;
        }
    },
};
