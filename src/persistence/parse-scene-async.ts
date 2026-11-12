import { copyBytesInChunks } from '@utils/copyBytes';
import { parseScenePackage, ScenePackageError, type ScenePackageContents } from './scene-package';
import { throwIfImportAborted } from './import-abort';

/** Keeps the caller's bytes intact: desktop recovery still owns the original package. */
export async function parseScenePackageAsync(bytes: Uint8Array, signal?: AbortSignal): Promise<ScenePackageContents> {
    throwIfImportAborted(signal);
    if (typeof Worker === 'undefined') return parseScenePackage(bytes);
    const ownedBytes = await copyBytesInChunks(bytes, signal);
    throwIfImportAborted(signal);
    const worker = new Worker(new URL('./scene-import-worker.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            signal?.removeEventListener('abort', abort);
            worker.terminate();
        };
        const abort = () => {
            cleanup();
            reject(new DOMException('Import aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
            cleanup();
            if (data.error) reject(new ScenePackageError(data.error.code ?? 'ERR_PACKAGE_FORMAT', data.error.message));
            else resolve(data.contents);
        };
        worker.onerror = (event) => {
            cleanup();
            reject(new Error(event.message || 'Scene import worker failed'));
        };
        try {
            worker.postMessage(ownedBytes, [ownedBytes.buffer]);
        } catch (error) {
            cleanup();
            reject(error);
        }
    });
}
