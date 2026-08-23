import { describe, expect, it, vi } from 'vitest';
import type { MvmntDesktopApi } from '../../../electron/shared/desktop-api';
import { DOCUMENT_SAVE_CHUNK_BYTES, writeNativeDocument } from '../native-document-writer';

function documentApiMock() {
    return {
        beginSave: vi.fn().mockResolvedValue({ status: 'ready', sessionId: 'save-1' }),
        writeSaveChunk: vi.fn().mockResolvedValue(undefined),
        completeSave: vi.fn().mockResolvedValue({ status: 'saved', displayName: 'Scene.mvt' }),
        abortSave: vi.fn().mockResolvedValue(undefined),
    } as unknown as MvmntDesktopApi['documents'];
}

describe('native document writer', () => {
    it('writes large projects in ordered bounded chunks and reports progress', async () => {
        const documents = documentApiMock();
        const bytes = new Uint8Array(DOCUMENT_SAVE_CHUNK_BYTES + 17);
        const progress: number[] = [];

        await expect(
            writeNativeDocument(documents, bytes, { onProgress: (value) => progress.push(value) })
        ).resolves.toMatchObject({ status: 'saved' });

        expect(documents.writeSaveChunk).toHaveBeenCalledTimes(2);
        expect(documents.writeSaveChunk).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ sessionId: 'save-1', position: 0 })
        );
        expect(documents.writeSaveChunk).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ sessionId: 'save-1', position: DOCUMENT_SAVE_CHUNK_BYTES })
        );
        expect(progress.at(-1)).toBe(1);
    });

    it('aborts and surfaces a failed chunk write', async () => {
        const documents = documentApiMock();
        vi.mocked(documents.writeSaveChunk).mockRejectedValueOnce(new Error('write failed'));

        await expect(writeNativeDocument(documents, new Uint8Array(8))).resolves.toEqual({
            status: 'error',
            error: 'write failed',
        });
        expect(documents.abortSave).toHaveBeenCalledWith('save-1');
        expect(documents.completeSave).not.toHaveBeenCalled();
    });
});
