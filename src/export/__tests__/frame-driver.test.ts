import { describe, expect, it, vi } from 'vitest';
import type { ExportEnvironment, ResolvedExportPlan } from '../contracts';
import { renderFrameSequence, withExportSurface } from '../pipeline';

function fixture() {
    const canvas = { width: 320, height: 180 } as HTMLCanvasElement;
    const renderer = {
        resize: vi.fn(),
        prepareFrame: vi.fn().mockResolvedValue(undefined),
        renderAtTime: vi.fn(),
        setTransparentMode: vi.fn(),
    };
    const environment: ExportEnvironment = {
        canvas,
        renderer,
        prepare: vi.fn(),
        secondsToTicks: (seconds) => seconds * 960,
    };
    const plan = {
        kind: 'png',
        sceneName: 'Test',
        settings: {
            fps: 2,
            width: 100,
            height: 100,
            fullDuration: false,
            startTime: 4,
            endTime: 5,
            container: 'mp4',
            videoCodec: 'h264',
            videoBitrate: 1_000_000,
            qualityPreset: 'high',
            includeAudio: false,
            transparentBackground: true,
        },
        startSeconds: 4,
        endSeconds: 5,
        durationSeconds: 1,
        startFrame: 8,
        frameCount: 2,
        outputName: 'test',
        estimatedBytes: 1,
    } satisfies ResolvedExportPlan;
    return { canvas, renderer, environment, plan };
}

describe('export frame driver', () => {
    it('does not render or encode a frame until simulation preparation completes', async () => {
        const { environment, plan, renderer } = fixture();
        let release!: () => void;
        renderer.prepareFrame.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                })
        );
        const consume = vi.fn();
        const work = renderFrameSequence(environment, plan, new AbortController().signal, consume);
        await Promise.resolve();
        expect(renderer.renderAtTime).not.toHaveBeenCalled();
        expect(consume).not.toHaveBeenCalled();
        release();
        await work;
        expect(consume).toHaveBeenCalledTimes(2);
    });
    it('uses absolute scene time and zero-based encode time', async () => {
        const { environment, plan, renderer } = fixture();
        const consumed = vi.fn().mockResolvedValue(undefined);
        await renderFrameSequence(environment, plan, new AbortController().signal, consumed);
        expect(renderer.renderAtTime.mock.calls).toEqual([[4], [4.5]]);
        expect(consumed.mock.calls.map((call) => call.slice(0, 4))).toEqual([
            [0, 4, 0, 0.5],
            [1, 4.5, 0.5, 0.5],
        ]);
    });

    it('restores canvas and transparency when a stage fails', async () => {
        const { environment, plan, canvas, renderer } = fixture();
        await expect(
            withExportSurface(environment, plan, async () => {
                throw new Error('encode failed');
            })
        ).rejects.toThrow('encode failed');
        expect(canvas).toMatchObject({ width: 320, height: 180 });
        expect(renderer.resize.mock.calls).toEqual([
            [100, 100],
            [320, 180],
        ]);
        expect(renderer.setTransparentMode.mock.calls).toEqual([[true], [false]]);
    });
});
