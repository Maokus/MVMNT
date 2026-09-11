import { describe, expect, it } from 'vitest';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { SimulationGeneration, sameSimulationInputs, simulationInputIdentity } from '../simulation-inputs';
import { SimulationPending } from '../simulation-runner';
import { ok } from '../../../../../packages/plugin-sdk/src/api';

describe('simulation input generations', () => {
    it('preserves generation identity and captured PCM when missing inputs arrive', () => {
        const scene = useSceneStore.getState();
        const buffer = {
            numberOfChannels: 1,
            sampleRate: 2,
            length: 2,
            duration: 1,
            getChannelData: () => new Float32Array([1, 2]),
        };
        const timeline = {
            ...useTimelineStore.getState(),
            audioCache: {
                ready: { audioBuffer: buffer, decodedState: 'ready' },
                waiting: { decodedState: 'decoding' },
            },
            audioFeatureCaches: {},
            audioFeatureCacheStatus: {},
        } as any;
        const initial = new SimulationGeneration(scene, timeline);
        const next = {
            ...timeline,
            audioCache: { ...timeline.audioCache, waiting: { audioBuffer: buffer, decodedState: 'ready' } },
        };
        const refreshed = new SimulationGeneration(scene, next, initial);
        expect(refreshed.identity).toBe(initial.identity);
        expect(initial.withReadyInputs(scene, next).identity).toBe(initial.identity);
        expect(refreshed.timeline.audioCache.ready.audioBuffer).toBe(initial.timeline.audioCache.ready.audioBuffer);
        expect(refreshed.timeline.audioCache.waiting.audioBuffer!.getChannelData(0)).toEqual(new Float32Array([1, 2]));

        for (const changed of [
            {
                ...next,
                audioCache: { ...next.audioCache, ready: { ...next.audioCache.ready, audioBuffer: { ...buffer } } },
            },
            { ...next, audioCache: { ...next.audioCache, ready: { decodedState: 'decoding' } } },
            { ...next, timeline: { ...next.timeline, globalBpm: next.timeline.globalBpm + 1 } },
        ])
            expect(new SimulationGeneration(scene, changed, refreshed).identity).not.toBe(refreshed.identity);
    });

    it('accepts additive analysis but resets for replaced artifacts, stale analysis, and source replacement', () => {
        const scene = useSceneStore.getState();
        const track = { values: new Float32Array([0.5]) };
        const originalFile = { storage: 'memory' };
        const timeline = {
            ...useTimelineStore.getState(),
            audioCache: { source: { decodedState: 'decoding', originalFile } },
            audioFeatureCaches: { source: { featureTracks: { rms: track }, analysisProfiles: {} } },
            audioFeatureCacheStatus: { source: { state: 'pending' } },
        } as any;
        const first = new SimulationGeneration(scene, timeline);
        const next = {
            ...timeline,
            audioFeatureCaches: {
                source: {
                    ...timeline.audioFeatureCaches.source,
                    featureTracks: { rms: track, peak: { values: new Float32Array([1]) } },
                },
            },
            audioFeatureCacheStatus: { source: { state: 'ready' } },
        };
        const refreshed = new SimulationGeneration(scene, next, first);
        expect(refreshed.identity).toBe(first.identity);
        expect(refreshed.timeline.audioFeatureCaches.source.featureTracks.rms).toBe(
            first.timeline.audioFeatureCaches.source.featureTracks.rms
        );
        for (const changed of [
            {
                ...next,
                audioFeatureCaches: {
                    source: {
                        ...next.audioFeatureCaches.source,
                        featureTracks: { rms: { values: new Float32Array([0.75]) } },
                    },
                },
            },
            { ...next, audioFeatureCaches: {} },
            { ...next, audioFeatureCacheStatus: { source: { state: 'stale' } } },
            { ...next, audioCache: { source: { ...next.audioCache.source, originalFile: { ...originalFile } } } },
        ]) {
            expect(new SimulationGeneration(scene, changed, refreshed).identity).not.toBe(refreshed.identity);
            expect(
                sameSimulationInputs(simulationInputIdentity(scene, next), simulationInputIdentity(scene, changed))
            ).toBe(false);
        }
    });

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

    it('keeps captured authored data isolated when refreshing export readiness', () => {
        const scene = useSceneStore.getState();
        const timeline = { ...useTimelineStore.getState(), tracks: { midi: { name: 'Captured' } } } as any;
        const generation = new SimulationGeneration(scene, timeline);
        timeline.tracks.midi.name = 'Changed backing object';
        const refreshed = generation.withReadyInputs(scene, timeline);
        expect(refreshed.timeline.tracks.midi.name).toBe('Captured');
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

    it('rejects demanded features that have no registered calculator instead of waiting forever', () => {
        const samples = new Float32Array([0, 0]);
        const timeline = {
            ...useTimelineStore.getState(),
            tracks: { audio: { type: 'audio', clips: [{ sourceId: 'source' }] } },
            audioCache: {
                source: {
                    decodedState: 'ready',
                    audioBuffer: {
                        numberOfChannels: 1,
                        sampleRate: 2,
                        length: 2,
                        duration: 1,
                        getChannelData: () => samples,
                    },
                },
            },
            audioFeatureCaches: {},
            audioFeatureCacheStatus: { source: { state: 'idle', updatedAt: 0 } },
        } as any;
        const generation = new SimulationGeneration(useSceneStore.getState(), timeline);
        const inputs = generation.inputs(
            { audio: { sampleFeature: () => ok({ value: 0 }) } } as any,
            () => ({ seed: 1 }),
            () => [{ id: 'invalid', trackId: 'audio', feature: 'not-a-real-feature' }]
        );

        (inputs.contextAt(0, 0.1).audio as any).sampleFeature({
            trackId: 'audio',
            feature: 'not-a-real-feature',
            timeSeconds: 0,
        });
        expect(() => inputs.checkReads()).toThrow("Audio feature 'not-a-real-feature' has no registered calculator");
    });
});
