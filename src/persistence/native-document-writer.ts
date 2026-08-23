import type { DesktopSaveResult, MvmntDesktopApi } from '../../electron/shared/desktop-api';

export const DOCUMENT_SAVE_CHUNK_BYTES = 4 * 1024 * 1024;

export async function writeNativeDocument(
    documents: MvmntDesktopApi['documents'],
    bytes: Uint8Array,
    options: { selectionId?: string; onProgress?: (progress: number) => void } = {}
): Promise<DesktopSaveResult> {
    const begin = await documents.beginSave({
        expectedBytes: bytes.byteLength,
        selectionId: options.selectionId,
    });
    if (begin.status !== 'ready' || !begin.sessionId) {
        return { status: begin.status === 'canceled' ? 'canceled' : 'error', error: begin.error };
    }

    const sessionId = begin.sessionId;
    try {
        for (let position = 0; position < bytes.byteLength; position += DOCUMENT_SAVE_CHUNK_BYTES) {
            const end = Math.min(bytes.byteLength, position + DOCUMENT_SAVE_CHUNK_BYTES);
            // A bounded copy prevents Electron from serializing the full backing
            // buffer for every subarray and yields between chunks.
            const chunk = bytes.slice(position, end);
            await documents.writeSaveChunk({ sessionId, position, bytes: chunk });
            options.onProgress?.(end / bytes.byteLength);
        }
        return await documents.completeSave(sessionId);
    } catch (error) {
        await documents.abortSave(sessionId).catch(() => undefined);
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}
