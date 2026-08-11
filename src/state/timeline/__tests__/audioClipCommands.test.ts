import { beforeEach, describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import { applyTimelinePatchActions } from '../patches';

function audioCacheEntry() {
    return {
        sampleRate: 48000,
        channels: 2,
        durationSeconds: 1,
        durationSamples: 48000,
    };
}

function seedTrack() {
    useTimelineStore.setState((state) => ({
        ...state,
        tracks: {
            track1: {
                id: 'track1',
                name: 'Audio',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                gain: 1,
                clips: [{ id: 'clip1', type: 'audio', sourceId: 'source1', offsetTicks: 0, enabled: true }],
            },
        },
        tracksOrder: ['track1'],
        audioCache: { source1: audioCacheEntry() },
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

describe('audio clip timeline commands', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.getState().clearAllTracks();
    });

    it('adds an audio clip with non-overlap resolution and supports undo/redo', async () => {
        seedTrack();

        const result = await timelineCommandGateway.dispatchById<{ clipId: string }>('timeline.addAudioClip', {
            trackId: 'track1',
            clip: { id: 'clip2', sourceId: 'source1', offsetTicks: CANONICAL_PPQ / 2 },
        });

        let clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(result.result?.clipId).toBe('clip2');
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1', 'clip2']);
        expect(clips[0].sourceEndSeconds).toBeCloseTo(0.25);

        applyUndo(result.patches);
        clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1']);

        applyRedo(result.patches);
        clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1', 'clip2']);
    });

    it('updates and moves audio clips without producing overlaps', async () => {
        seedTrack();
        await timelineCommandGateway.dispatchById('timeline.addAudioClip', {
            trackId: 'track1',
            clip: { id: 'clip2', sourceId: 'source1', offsetTicks: CANONICAL_PPQ * 2 },
        });

        await timelineCommandGateway.dispatchById('timeline.setMultipleAudioClipOffsets', {
            offsets: [{ trackId: 'track1', clipId: 'clip2', offsetTicks: CANONICAL_PPQ / 2 }],
        });

        const clips = (useTimelineStore.getState().tracks.track1 as any).clips;
        expect(clips.map((clip: any) => clip.id)).toEqual(['clip1', 'clip2']);
        expect(clips[0].sourceEndSeconds).toBeCloseTo(0.25);
    });

    it('keeps a negative audio clip offset when moving before scene start', async () => {
        seedTrack();

        await timelineCommandGateway.dispatchById('timeline.setMultipleAudioClipOffsets', {
            offsets: [{ trackId: 'track1', clipId: 'clip1', offsetTicks: -CANONICAL_PPQ }],
        });

        expect((useTimelineStore.getState().tracks.track1 as any).clips[0].offsetTicks).toBe(-CANONICAL_PPQ);
    });

    it('removes audio clips without deleting shared source data until the final reference is gone', async () => {
        seedTrack();
        await timelineCommandGateway.dispatchById('timeline.addAudioClip', {
            trackId: 'track1',
            clip: { id: 'clip2', sourceId: 'source1', offsetTicks: CANONICAL_PPQ * 2 },
        });

        const firstRemove = await timelineCommandGateway.dispatchById('timeline.removeAudioClips', {
            clips: [{ trackId: 'track1', clipId: 'clip1' }],
        });

        expect(useTimelineStore.getState().audioCache.source1).toBeDefined();
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual(['clip2']);

        const secondRemove = await timelineCommandGateway.dispatchById('timeline.removeAudioClips', {
            clips: [{ trackId: 'track1', clipId: 'clip2' }],
        });

        expect(useTimelineStore.getState().tracks.track1).toBeDefined();
        expect((useTimelineStore.getState().tracks.track1 as any).clips).toEqual([]);
        expect(useTimelineStore.getState().audioCache.source1).toBeUndefined();

        applyUndo(secondRemove.patches);
        expect(useTimelineStore.getState().audioCache.source1).toBeDefined();
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual(['clip2']);

        applyUndo(firstRemove.patches);
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual([
            'clip1',
            'clip2',
        ]);
    });

    it('pastes audio clips in one undoable command', async () => {
        seedTrack();

        const result = await timelineCommandGateway.dispatchById('timeline.pasteAudioClips', {
            clips: [
                {
                    trackId: 'track1',
                    clip: { id: 'clip-paste', sourceId: 'source1', offsetTicks: CANONICAL_PPQ * 2 },
                },
            ],
        });

        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual([
            'clip1',
            'clip-paste',
        ]);

        applyUndo(result.patches);
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual(['clip1']);
    });

    it('moves audio clips between audio tracks', async () => {
        seedTrack();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                ...state.tracks,
                track2: {
                    id: 'track2',
                    name: 'Audio 2',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [],
                },
            },
            tracksOrder: ['track1', 'track2'],
        }));

        const result = await timelineCommandGateway.dispatchById('timeline.moveAudioClipsBetweenTracks', {
            moves: [
                {
                    sourceTrackId: 'track1',
                    clipId: 'clip1',
                    destinationTrackId: 'track2',
                    newOffsetTicks: CANONICAL_PPQ,
                },
            ],
        });

        expect((useTimelineStore.getState().tracks.track1 as any).clips).toEqual([]);
        expect((useTimelineStore.getState().tracks.track2 as any).clips.map((clip: any) => clip.id)).toEqual(['clip1']);

        applyUndo(result.patches);
        expect((useTimelineStore.getState().tracks.track1 as any).clips.map((clip: any) => clip.id)).toEqual(['clip1']);
        expect((useTimelineStore.getState().tracks.track2 as any).clips).toEqual([]);
    });
});
