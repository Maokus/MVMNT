import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyBytesInChunks } from '../copyBytes';

afterEach(() => vi.useRealTimers());

describe('bounded byte copying', () => {
    it('copies only the requested view and yields between large chunks', async () => {
        vi.useFakeTimers();
        const source = new Uint8Array(1024 * 1024 + 4).fill(7);
        const pending = copyBytesInChunks(source.subarray(1, -1));
        expect(vi.getTimerCount()).toBe(1);
        await vi.runAllTimersAsync();
        const copy = await pending;
        expect(copy.length).toBe(source.length - 2);
        expect(copy.buffer).not.toBe(source.buffer);
        expect(copy.every((sample) => sample === 7)).toBe(true);
    });
    it('stops copying when import is canceled', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const pending = copyBytesInChunks(new Uint8Array(2 * 1024 * 1024), controller.signal);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        controller.abort();
        await vi.runAllTimersAsync();
        await rejected;
    });
});
