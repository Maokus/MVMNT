import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportCoordinator, useExportJobStore } from '../jobs';
import type { ExportOutputSession } from '../contracts';

describe('ExportCoordinator', () => {
    beforeEach(() => useExportJobStore.setState({ jobs: [] }));

    it('runs a PNG request through one terminal lifecycle and output session', async () => {
        const writeFrame = vi.fn().mockResolvedValue(undefined);
        const complete = vi.fn().mockResolvedValue({ outputId: 'out-1', bytesWritten: 12 });
        const abort = vi.fn().mockResolvedValue(undefined);
        const output = {
            sessionId: 'session-1',
            displayName: 'frames',
            writeFrame,
            writeArtifact: vi.fn(),
            complete,
            abort,
        } satisfies ExportOutputSession;
        const canvas = {
            width: 320,
            height: 180,
            toBlob(callback: BlobCallback) {
                callback(new Blob([new Uint8Array([1])]));
            },
        } as unknown as HTMLCanvasElement;
        const renderer = {
            resize: vi.fn(),
            prepareFrame: vi.fn().mockResolvedValue(undefined),
            renderAtTime: vi.fn(),
            setTransparentMode: vi.fn(),
        };
        const coordinator = new ExportCoordinator({
            sceneDuration: () => 1,
            createEnvironment: () => ({
                canvas,
                renderer,
                prepare: vi.fn().mockResolvedValue(undefined),
                secondsToTicks: (seconds) => seconds * 960,
            }),
            beginOutput: vi.fn().mockResolvedValue(output),
        });

        const job = coordinator.submit(
            {
                kind: 'png',
                sceneName: 'Coordinator',
                settings: {
                    fps: 2,
                    width: 100,
                    height: 100,
                    fullDuration: true,
                    startTime: 0,
                    endTime: 0,
                },
            },
            1,
            1
        );

        await vi.waitFor(() => {
            expect(useExportJobStore.getState().jobs.find((item) => item.id === job.id)?.status).toBe('completed');
        });
        expect(writeFrame).toHaveBeenCalledTimes(2);
        expect(complete).toHaveBeenCalledWith(undefined, 2);
        expect(abort).not.toHaveBeenCalled();
    });

    it('aborts the output and reaches cancelled when cancellation arrives during preparation', async () => {
        let releaseOutput!: (output: ExportOutputSession) => void;
        const outputReady = new Promise<ExportOutputSession>((resolve) => {
            releaseOutput = resolve;
        });
        const abort = vi.fn().mockResolvedValue(undefined);
        const output: ExportOutputSession = {
            sessionId: 'session-cancel',
            displayName: 'cancelled',
            writeFrame: vi.fn(),
            writeArtifact: vi.fn(),
            complete: vi.fn(),
            abort,
        };
        const canvas = { width: 1, height: 1 } as HTMLCanvasElement;
        const coordinator = new ExportCoordinator({
            sceneDuration: () => 1,
            createEnvironment: () => ({
                canvas,
                renderer: {
                    resize: vi.fn(),
                    prepareFrame: vi.fn().mockResolvedValue(undefined),
                    renderAtTime: vi.fn(),
                },
                prepare: vi.fn(),
                secondsToTicks: (seconds) => seconds,
            }),
            beginOutput: () => outputReady,
        });
        const job = coordinator.submit(
            {
                kind: 'png',
                sceneName: 'Cancel',
                settings: { fps: 1, width: 1, height: 1, fullDuration: true, startTime: 0, endTime: 0 },
            },
            0,
            0
        );
        coordinator.cancel(job.id);
        releaseOutput(output);

        await vi.waitFor(() => {
            expect(useExportJobStore.getState().jobs.find((item) => item.id === job.id)?.status).toBe('cancelled');
        });
        expect(abort).toHaveBeenCalledOnce();
    });
});
