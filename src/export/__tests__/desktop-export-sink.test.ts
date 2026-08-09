import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginDesktopOutput } from '../outputs';

describe('desktop export sink', () => {
    afterEach(() => {
        delete (window as any).mvmntDesktop;
    });

    it('propagates random-access writes with backpressure and finalizes once', async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        const complete = vi.fn().mockResolvedValue({ status: 'completed', outputId: 'output-1' });
        const abort = vi.fn().mockResolvedValue(undefined);
        const begin = vi.fn().mockResolvedValue({ status: 'ready', sessionId: 'session-1', displayName: 'movie.mp4' });
        (window as any).mvmntDesktop = { exports: { begin, write, complete, abort } };
        const sink = await beginDesktopOutput({ kind: 'video', suggestedName: 'movie', extension: '.mp4' });
        const target = sink!.videoTarget as any;
        target._start();
        target._write(new Uint8Array([1, 2, 3]), 8);
        await target._flush();
        await target._finalize();
        await sink!.complete({ frameCount: 1 });

        expect(write).toHaveBeenCalled();
        expect(write.mock.calls.some(([request]) => request.sessionId === 'session-1')).toBe(true);
        expect(complete).toHaveBeenCalledWith({ sessionId: 'session-1', manifest: { frameCount: 1 } });
        await sink!.abort();
        expect(abort).not.toHaveBeenCalled();
    });

    it('delegates destination selection and individual frame writes', async () => {
        const begin = vi.fn().mockResolvedValue({ status: 'ready', sessionId: 'sequence-1' });
        const writeFrame = vi.fn().mockResolvedValue(undefined);
        (window as any).mvmntDesktop = { exports: { begin, writeFrame, write: vi.fn() } };
        const sink = await beginDesktopOutput({ kind: 'image-sequence', suggestedName: 'frames' });
        await sink!.writeFrame('frame_000001.png', new Blob([new Uint8Array([1, 2])]));

        expect(writeFrame).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: 'sequence-1',
                filename: 'frame_000001.png',
            })
        );
    });

    it('keeps a failed completion abortable so temporary output can be removed', async () => {
        const complete = vi.fn().mockResolvedValue({ status: 'error', error: 'disk failed' });
        const abort = vi.fn().mockResolvedValue(undefined);
        const begin = vi.fn().mockResolvedValue({ status: 'ready', sessionId: 'session-2' });
        (window as any).mvmntDesktop = { exports: { begin, write: vi.fn(), complete, abort } };
        const sink = await beginDesktopOutput({ kind: 'video', suggestedName: 'movie' });
        await expect(sink!.complete()).rejects.toThrow('disk failed');
        await sink!.abort();
        expect(abort).toHaveBeenCalledWith('session-2');
    });
});
