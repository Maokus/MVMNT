import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginDesktopExport, createDesktopStreamSink, writeDesktopFrame } from '../desktop-export-sink';

describe('desktop export sink', () => {
    afterEach(() => {
        delete (window as any).mvmntDesktop;
    });

    it('propagates random-access writes with backpressure and finalizes once', async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        const complete = vi.fn().mockResolvedValue({ status: 'completed', outputId: 'output-1' });
        const abort = vi.fn().mockResolvedValue(undefined);
        (window as any).mvmntDesktop = {
            exports: { write, complete, abort },
        };
        const sink = createDesktopStreamSink('session-1', 'movie.mp4');
        const target = sink.target as any;
        target._start();
        target._write(new Uint8Array([1, 2, 3]), 8);
        await target._flush();
        await target._finalize();
        await sink.complete({ frameCount: 1 });

        expect(write).toHaveBeenCalled();
        expect(write.mock.calls.some(([request]) => request.sessionId === 'session-1')).toBe(true);
        expect(complete).toHaveBeenCalledWith({ sessionId: 'session-1', manifest: { frameCount: 1 } });
        await sink.abort();
        expect(abort).not.toHaveBeenCalled();
    });

    it('delegates destination selection and individual frame writes', async () => {
        const begin = vi.fn().mockResolvedValue({ status: 'ready', sessionId: 'sequence-1' });
        const writeFrame = vi.fn().mockResolvedValue(undefined);
        (window as any).mvmntDesktop = { exports: { begin, writeFrame } };

        await expect(beginDesktopExport({ kind: 'image-sequence', suggestedName: 'frames' }))
            .resolves.toMatchObject({ status: 'ready' });
        await writeDesktopFrame('sequence-1', 'frame_000001.png', new Blob([new Uint8Array([1, 2])]));

        expect(writeFrame).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: 'sequence-1',
            filename: 'frame_000001.png',
        }));
    });

    it('keeps a failed completion abortable so temporary output can be removed', async () => {
        const complete = vi.fn().mockResolvedValue({ status: 'error', error: 'disk failed' });
        const abort = vi.fn().mockResolvedValue(undefined);
        (window as any).mvmntDesktop = { exports: { write: vi.fn(), complete, abort } };
        const sink = createDesktopStreamSink('session-2', 'movie.mp4');
        await expect(sink.complete()).resolves.toMatchObject({ status: 'error' });
        await sink.abort();
        expect(abort).toHaveBeenCalledWith('session-2');
    });
});
