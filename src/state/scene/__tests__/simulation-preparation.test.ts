import { describe, expect, it, vi } from 'vitest';
import { createSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { SceneRuntimeAdapter } from '../runtimeAdapter';
import { SimulationPending } from '@core/scene/runtime/simulation-runner';

describe('simulation frame preparation', () => {
    it('aggregates element reasons by severity and coalesces readiness notifications', async () => {
        const adapter = new SceneRuntimeAdapter({ store: createSceneStore() });
        const listener = vi.fn();
        const readiness = { status: 'preparing', reason: 'Replaying simulation' } as const;
        const request = vi.fn((_seconds, _generation, changed: () => void) => {
            changed();
            changed();
            return readiness.status;
        });
        vi.spyOn(adapter, 'getElements').mockReturnValue([
            {
                id: 'particles',
                type: 'test:particles',
                hasSimulation: true,
                getSimulationReadiness: () => readiness,
                requestSimulationFrame: request,
            },
        ] as any);
        const unsubscribe = adapter.subscribeSimulationStatus(listener);

        adapter.requestSimulationFrame(2);
        await Promise.resolve();

        expect(adapter.getSimulationReadiness()).toMatchObject({
            status: 'preparing',
            reason: 'Replaying simulation',
            affected: [expect.objectContaining({ elementId: 'particles' })],
        });
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        adapter.dispose();
    });

    it('wakes pending preparation when its adapter is disposed', async () => {
        const adapter = new SceneRuntimeAdapter({ store: createSceneStore() });
        const prepare = vi.fn().mockRejectedValue(new SimulationPending('audio'));
        vi.spyOn(adapter, 'getElements').mockReturnValue([
            { hasSimulation: true, prepareSimulationFrame: prepare },
        ] as any);
        const work = adapter.prepareFrame(2);
        const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
        await Promise.resolve();
        await Promise.resolve();
        adapter.dispose();
        await rejected;
    });

    it('retries pending export preparation on readiness changes and releases its session', async () => {
        const adapter = new SceneRuntimeAdapter({ store: createSceneStore() });
        const prepare = vi.fn().mockRejectedValueOnce(new SimulationPending('audio')).mockResolvedValue(undefined);
        const release = vi.fn();
        vi.spyOn(adapter, 'getElements').mockReturnValue([
            { hasSimulation: true, prepareSimulationFrame: prepare, releaseSimulationSession: release },
        ] as any);
        const end = adapter.beginSimulationExport();
        const work = adapter.prepareFrame(2);
        await Promise.resolve();
        await Promise.resolve();
        useTimelineStore.getState().setAudioFeatureCacheStatus('simulation-test', 'ready');
        await work;
        expect(prepare).toHaveBeenCalledTimes(2);
        expect(prepare.mock.calls[0][1]).not.toBe(prepare.mock.calls[1][1]);
        end();
        expect(release).toHaveBeenCalledTimes(1);
        adapter.dispose();
        useTimelineStore.getState().clearAudioFeatureCache('simulation-test');
    });
});
