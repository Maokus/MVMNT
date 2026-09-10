import { describe, expect, it } from 'vitest';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { SimulationGeneration, sameSimulationInputs, simulationInputIdentity } from '../simulation-inputs';
import { SimulationPending } from '../simulation-runner';
import { ok } from '../../../../../packages/plugin-sdk/src/api';

describe('simulation input generations', () => {
    it('ignores transport and selection but detects content and timing changes', () => {
        const scene = useSceneStore.getState();
        const timeline = useTimelineStore.getState();
        const before = simulationInputIdentity(scene, timeline);
        expect(
            sameSimulationInputs(
                before,
                simulationInputIdentity(scene, {
                    ...timeline,
                    transport: { ...timeline.transport },
                    timelineView: { ...timeline.timelineView },
                })
            )
        ).toBe(true);
        expect(
            sameSimulationInputs(
                before,
                simulationInputIdentity(scene, { ...timeline, midiCache: { ...timeline.midiCache } })
            )
        ).toBe(false);
        expect(
            sameSimulationInputs(
                before,
                simulationInputIdentity(scene, {
                    ...timeline,
                    timeline: { ...timeline.timeline, globalBpm: timeline.timeline.globalBpm + 1 },
                })
            )
        ).toBe(false);
    });

    it('copies PCM and property bindings rather than following mutable backing arrays', () => {
        const data = new Float32Array([1, 2]);
        const buffer = { numberOfChannels: 1, sampleRate: 2, length: 2, duration: 1, getChannelData: () => data };
        const timeline = {
            ...useTimelineStore.getState(),
            audioCache: { source: { audioBuffer: buffer, decodedState: 'ready' } },
        } as any;
        const generation = new SimulationGeneration(useSceneStore.getState(), timeline);
        const config = { seed: { type: 'constant', value: 2 } };
        const properties = generation.properties(config, ['seed']);
        config.seed.value = 10;
        data[0] = 99;
        expect(properties.propsAt(1).seed).toBe(2);
        expect(generation.timeline.audioCache.source.audioBuffer!.getChannelData(0)[0]).toBe(1);
        const refreshed = generation.withReadyInputs(useSceneStore.getState(), timeline);
        expect(refreshed.timeline.audioCache.source.audioBuffer!.getChannelData(0)[0]).toBe(1);
    });

    it('uses half-open note-on intervals without repeated sustained-note impulses', () => {
        const generation = new SimulationGeneration(useSceneStore.getState(), useTimelineStore.getState());
        const events = [-1, 0, 0.1, 0.2].map((startSeconds) => ({ startSeconds }));
        const inputs = generation.inputs(
            { timeline: { selectNotes: () => ok(events) } } as any,
            () => ({ seed: 1 }),
            () => []
        );
        const first = inputs.contextAt(0, 0.1).noteOns();
        const second = inputs.contextAt(1, 0.1).noteOns();
        expect(first.ok && first.value).toEqual([{ startSeconds: 0 }]);
        expect(second.ok && second.value).toEqual([{ startSeconds: 0.1 }]);
    });

    it('does not allow ignored pending reads to commit and reports missing assets', () => {
        const timeline = {
            ...useTimelineStore.getState(),
            tracks: { audio: { type: 'audio', clips: [{ sourceId: 'source' }] } },
            audioCache: { source: { decodedState: 'decoding' } },
        } as any;
        const generation = new SimulationGeneration(useSceneStore.getState(), timeline);
        const inputs = generation.inputs(
            { audio: { sampleRaw: () => ok([0]) } } as any,
            () => ({ seed: 1 }),
            () => []
        );
        (inputs.contextAt(0, 0.1).audio as any).sampleRaw({ trackId: 'audio' });
        expect(() => inputs.checkReads()).toThrow(SimulationPending);
        (inputs.contextAt(0, 0.1).audio as any).sampleRaw({ trackId: 'missing' });
        expect(() => inputs.checkReads()).toThrow('missing');
    });
});
