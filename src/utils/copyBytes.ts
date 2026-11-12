const COPY_CHUNK_BYTES = 1024 * 1024;

/** Copy owned transfer/storage bytes without one long renderer-thread memcpy. */
export async function copyBytesInChunks(source: Uint8Array, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    if (signal?.aborted) throw new DOMException('Copy aborted', 'AbortError');
    const copy = new Uint8Array(source.byteLength);
    for (let offset = 0; offset < source.byteLength; offset += COPY_CHUNK_BYTES) {
        copy.set(source.subarray(offset, offset + COPY_CHUNK_BYTES), offset);
        if (offset + COPY_CHUNK_BYTES < source.byteLength) {
            const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
            if (scheduler?.yield) await scheduler.yield();
            else await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (signal?.aborted) throw new DOMException('Copy aborted', 'AbortError');
        }
    }
    return copy;
}
