import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseScenePackageAsync } from '../parse-scene-async';

class ImportWorker {
    static instance: ImportWorker;
    onmessage: ((event: { data: any }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
        ImportWorker.instance = this;
    }
}
afterEach(() => vi.unstubAllGlobals());

describe('scene package import worker', () => {
    it('keeps the incoming package owned by the caller and returns worker contents', async () => {
        vi.stubGlobal('Worker', ImportWorker);
        const bytes = new Uint8Array([1, 2, 3]);
        const pending = parseScenePackageAsync(bytes);
        await Promise.resolve();
        const worker = ImportWorker.instance;
        expect(worker.postMessage).toHaveBeenCalledWith(expect.any(Uint8Array), [expect.any(ArrayBuffer)]);
        expect(worker.postMessage.mock.calls[0][0].buffer).not.toBe(bytes.buffer);
        const contents = { envelope: { schemaVersion: 10 }, audioPayloads: new Map() };
        worker.onmessage?.({ data: { contents } });
        await expect(pending).resolves.toBe(contents);
        expect(bytes.byteLength).toBe(3);
        expect(worker.terminate).toHaveBeenCalledOnce();
    });
    it('terminates extraction when import is canceled', async () => {
        vi.stubGlobal('Worker', ImportWorker);
        const controller = new AbortController();
        const pending = parseScenePackageAsync(new Uint8Array([1]), controller.signal);
        await Promise.resolve();
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(ImportWorker.instance.terminate).toHaveBeenCalledOnce();
    });
    it('preserves package validation error codes', async () => {
        vi.stubGlobal('Worker', ImportWorker);
        const pending = parseScenePackageAsync(new Uint8Array([1]));
        await Promise.resolve();
        ImportWorker.instance.onmessage?.({
            data: { error: { code: 'ERR_ZIP_DOCUMENT', message: 'Missing document' } },
        });
        await expect(pending).rejects.toMatchObject({ code: 'ERR_ZIP_DOCUMENT' });
    });
});
