import { describe, expect, it } from 'vitest';
import { buildDragPreviews, planDragMove, resolveDragGroup } from '../clipDragGroup';

const state = {
    tracks: {
        midi1: {
            id: 'midi1',
            type: 'midi',
            clips: [{ id: 'clip-a', type: 'midi', sourceId: 'src-a', offsetTicks: 100 }],
        },
        midi2: { id: 'midi2', type: 'midi', clips: [] },
        audio1: {
            id: 'audio1',
            type: 'audio',
            clips: [{ id: 'clip-b', type: 'audio', sourceId: 'src-b', offsetTicks: 200 }],
        },
    },
    tracksOrder: ['midi1', 'midi2', 'audio1'],
    midiCache: {},
    audioCache: {},
    timeline: { globalBpm: 120, beatsPerBar: 4 },
} as any;

const mixedRefs = [
    { trackId: 'midi1', clipId: 'clip-a' },
    { trackId: 'audio1', clipId: 'clip-b', kind: 'audio' as const },
];

describe('clipDragGroup', () => {
    it('resolves mixed MIDI+audio refs with per-clip offsets', () => {
        expect(resolveDragGroup(state, mixedRefs)).toEqual([
            { trackId: 'midi1', clipId: 'clip-a', kind: 'midi', offsetTicks: 100, trackIndex: 0 },
            { trackId: 'audio1', clipId: 'clip-b', kind: 'audio', offsetTicks: 200, trackIndex: 2 },
        ]);
    });

    it('drops refs for missing tracks or clips', () => {
        expect(
            resolveDragGroup(state, [
                { trackId: 'nope', clipId: 'clip-a' },
                { trackId: 'midi1', clipId: 'ghost' },
            ])
        ).toEqual([]);
    });

    it('builds same-track previews carrying each kind', () => {
        const entries = resolveDragGroup(state, mixedRefs);
        const previews = buildDragPreviews(state, entries, 0, 40);
        expect(previews).toHaveLength(2);
        expect(previews.map((p) => [p.clipId, p.targetTrackId, p.previewOffsetTicks])).toEqual([
            ['clip-a', 'midi1', 140],
            ['clip-b', 'audio1', 240],
        ]);
    });

    it('snaps each kind to its nearest same-kind track on vertical moves', () => {
        const entries = resolveDragGroup(state, mixedRefs);
        const previews = buildDragPreviews(state, entries, 1, 0);
        const byId = Object.fromEntries(previews.map((p) => [p.clipId, p.targetTrackId]));
        // midi1 + 1 lands on midi2; audio1 + 1 clamps past the end back to audio1.
        expect(byId).toEqual({ 'clip-a': 'midi2', 'clip-b': 'audio1' });
    });
});

describe('planDragMove overlap clamp', () => {
    const overlapState = {
        tracks: {
            midi1: {
                id: 'midi1',
                type: 'midi',
                clips: [
                    { id: 'a', type: 'midi', sourceId: 's', offsetTicks: 0, regionStartTick: 0, regionEndTick: 240 },
                    {
                        id: 'b',
                        type: 'midi',
                        sourceId: 's',
                        offsetTicks: 480,
                        regionStartTick: 0,
                        regionEndTick: 240,
                    },
                ],
            },
            midi2: { id: 'midi2', type: 'midi', clips: [] },
        },
        tracksOrder: ['midi1', 'midi2'],
        midiCache: {},
        audioCache: {},
        timeline: { globalBpm: 120, beatsPerBar: 4 },
    } as any;

    it('stops a rightward drag at the next clip edge', () => {
        const entries = resolveDragGroup(overlapState, [{ trackId: 'midi1', clipId: 'a' }]);
        const planned = planDragMove(overlapState, entries, 0, 400);
        expect(planned.delta).toBe(240);
        expect(planned.previews.map((p) => p.previewOffsetTicks)).toEqual([240]);
    });

    it('leaves free movement alone', () => {
        const entries = resolveDragGroup(overlapState, [{ trackId: 'midi1', clipId: 'a' }]);
        expect(planDragMove(overlapState, entries, 0, 100).delta).toBe(100);
    });

    it('stops a leftward drag at the previous clip edge', () => {
        const entries = resolveDragGroup(overlapState, [{ trackId: 'midi1', clipId: 'b' }]);
        expect(planDragMove(overlapState, entries, 0, -400).delta).toBe(-240);
    });

    it('clamps by the most restrictive group member', () => {
        const occupied = {
            ...overlapState,
            tracks: {
                ...overlapState.tracks,
                midi1: {
                    ...(overlapState.tracks as any).midi1,
                    clips: [
                        ...(overlapState.tracks as any).midi1.clips,
                        {
                            id: 'c',
                            type: 'midi',
                            sourceId: 's',
                            offsetTicks: 1200,
                            regionStartTick: 0,
                            regionEndTick: 240,
                        },
                    ],
                },
            },
        } as any;
        const entries = resolveDragGroup(occupied, [
            { trackId: 'midi1', clipId: 'a' },
            { trackId: 'midi1', clipId: 'b' },
        ]);
        // a is free until +960, but b would hit c at +480.
        expect(planDragMove(occupied, entries, 0, 400).delta).toBe(400);
        expect(planDragMove(occupied, entries, 0, 800).delta).toBe(480);
    });
});
