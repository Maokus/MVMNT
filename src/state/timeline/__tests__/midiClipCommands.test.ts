import { beforeEach, describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import { applyTimelinePatchActions } from '../patches';

function midiCacheEntry() {
    return {
        midiData: undefined as any,
        notesRaw: [{ note: 60, channel: 0, startTick: 0, endTick: CANONICAL_PPQ, durationTicks: CANONICAL_PPQ }],
        ccRaw: [],
        ticksPerQuarter: CANONICAL_PPQ,
        bounds: { minTick: 0, maxTick: CANONICAL_PPQ, minNote: 60, maxNote: 60, maxDurationTicks: CANONICAL_PPQ },
    };
}

function seedTrack() {
    useTimelineStore.setState((state) => ({
        ...state,
        tracks: {
            track1: {
                id: 'track1',
                name: 'MIDI',
                type: 'midi',
                enabled: true,
                mute: false,
                solo: false,
                clips: [{ id: 'clip1', type: 'midi', sourceId: 'source1', offsetTicks: 0, enabled: true }],
            },
        },
        tracksOrder: ['track1'],
        midiCache: { source1: midiCacheEntry() },
    }));
}

function applyUndo(patches: any) {
    applyTimelinePatchActions(
        { getState: useTimelineStore.getState, setState: useTimelineStore.setState },
        patches.undo
    );
}

function applyRedo(patches: any) {
    applyTimelinePatchActions(
        { getState: useTimelineStore.getState, setState: useTimelineStore.setState },
        patches.redo
    );
}

describe('MIDI clip timeline commands', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.getState().clearAllTracks();
    });

    it('adds a MIDI clip with non-overlap resolution and supports undo/redo', async () => {
        seedTrack();

        const result = await timelineCommandGateway.dispatchById<{ clipId: string }>('timeline.addMidiClip', {
            trackId: 'track1',
            clip: { id: 'clip2', sourceId: 'source1', offsetTicks: CANONICAL_PPQ / 2 },
        });

        let clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(result.result?.clipId).toBe('clip2');
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1', 'clip2']);
        expect(clips[0].regionEndTick).toBe(CANONICAL_PPQ / 2);

        applyUndo(result.patches);
        clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1']);

        applyRedo(result.patches);
        clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1', 'clip2']);
    });

    it('updates and moves MIDI clips without producing overlaps', async () => {
        seedTrack();
        await timelineCommandGateway.dispatchById('timeline.addMidiClip', {
            trackId: 'track1',
            clip: { id: 'clip2', sourceId: 'source1', offsetTicks: CANONICAL_PPQ * 2 },
        });

        await timelineCommandGateway.dispatchById('timeline.setMultipleMidiClipOffsets', {
            offsets: [{ trackId: 'track1', clipId: 'clip2', offsetTicks: CANONICAL_PPQ / 2 }],
        });

        const clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1', 'clip2']);
        expect(clips[0].regionEndTick).toBe(CANONICAL_PPQ / 2);
    });

    it('removes MIDI clips without deleting shared source data until the final reference is gone', async () => {
        seedTrack();
        await timelineCommandGateway.dispatchById('timeline.addMidiClip', {
            trackId: 'track1',
            clip: { id: 'clip2', sourceId: 'source1', offsetTicks: CANONICAL_PPQ * 2 },
        });

        const firstRemove = await timelineCommandGateway.dispatchById('timeline.removeMidiClips', {
            clips: [{ trackId: 'track1', clipId: 'clip1' }],
        });

        expect(useTimelineStore.getState().midiCache.source1).toBeDefined();
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual(['clip2']);

        const secondRemove = await timelineCommandGateway.dispatchById('timeline.removeMidiClips', {
            clips: [{ trackId: 'track1', clipId: 'clip2' }],
        });

        expect(useTimelineStore.getState().tracks.track1).toBeDefined();
        expect((useTimelineStore.getState().tracks.track1 as any).clips).toEqual([]);
        expect(useTimelineStore.getState().midiCache.source1).toBeUndefined();

        applyUndo(secondRemove.patches);
        expect(useTimelineStore.getState().midiCache.source1).toBeDefined();
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual(['clip2']);

        applyUndo(firstRemove.patches);
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual([
            'clip1',
            'clip2',
        ]);
    });
});
