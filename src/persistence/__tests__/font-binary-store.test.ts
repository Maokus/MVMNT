import { describe, expect, it, beforeEach } from 'vitest';
import { FontBinaryStore } from '../font-binary-store';

function toArrayBuffer(text: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(text).slice().buffer;
}

describe('FontBinaryStore', () => {
    beforeEach(async () => {
        await FontBinaryStore.clear();
    });

    it('stores and retrieves font binaries', async () => {
        const id = 'font-1';
        const payload = toArrayBuffer('hello-font');
        await FontBinaryStore.put(id, payload);
        const result = await FontBinaryStore.get(id);
        expect(result).toBeInstanceOf(ArrayBuffer);
        expect(Buffer.from(new Uint8Array(result!))).toEqual(Buffer.from(payload));
    });

    it('deletes font binaries', async () => {
        const id = 'font-2';
        await FontBinaryStore.put(id, toArrayBuffer('bye'));
        await FontBinaryStore.delete(id);
        const result = await FontBinaryStore.get(id);
        expect(result).toBeUndefined();
    });

    it('persists array buffer inputs', async () => {
        const id = 'font-3';
        const payload = new TextEncoder().encode('buffer-font');
        await FontBinaryStore.put(id, payload.buffer.slice(0));
        const result = await FontBinaryStore.get(id);
        expect(result).toBeInstanceOf(ArrayBuffer);
        expect(Array.from(new Uint8Array(result!))).toEqual(Array.from(payload));
    });
});
