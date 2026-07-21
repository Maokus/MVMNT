import { beforeEach, describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { exportScene, importScene } from '../index';
import { migrateSceneMidiClipsV8 } from '../migrations/midiClipsV8';
import { useTimelineStore } from '@state/timelineStore';

function midiCacheEntry() {
    return {
        midiData: {
            events: [
                { type: 'noteOn', note: 60, velocity: 100, time: 0, tick: 0, channel: 0 },
                { type: 'noteOff', note: 60, velocity: 0, time: 1, tick: CANONICAL_PPQ, channel: 0 },
            ],
            duration: 1,
            tempo: 500000,
            ticksPerQuarter: CANONICAL_PPQ,
            timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trimmedTicks: 0,
        },
        notesRaw: [{ note: 60, channel: 0, startTick: 0, endTick: CANONICAL_PPQ, durationTicks: CANONICAL_PPQ }],
        ccRaw: [],
        ticksPerQuarter: CANONICAL_PPQ,
        bounds: { minTick: 0, maxTick: CANONICAL_PPQ, minNote: 60, maxNote: 60, maxDurationTicks: CANONICAL_PPQ },
    };
}

describe('MIDI clips schema V8 persistence', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.getState().clearAllTracks();
    });

    it('migrates a V7 single-clip MIDI track to V8 clips', () => {
        const migrated = migrateSceneMidiClipsV8({
            schemaVersion: 7,
            timeline: {
                tracks: {
                    track1: {
                        id: 'track1',
                        name: 'MIDI',
                        type: 'midi',
                        enabled: true,
                        mute: false,
                        solo: false,
                        midiSourceId: 'source1',
                        offsetTicks: 240,
                        regionStartTick: 120,
                        regionEndTick: 960,
                    },
                },
            },
        });

        expect(migrated.schemaVersion).toBe(8);
        expect((migrated as any).timeline.tracks.track1.clips).toEqual([
            {
                id: 'track1__clip',
                type: 'midi',
                sourceId: 'source1',
                offsetTicks: 240,
                regionStartTick: 120,
                regionEndTick: 960,
                name: 'MIDI',
                enabled: true,
            },
        ]);
    });

    it('round-trips a V8 multi-clip track and omits legacy MIDI placement fields on export', async () => {
        useTimelineStore.setState((state: any) => ({
            ...state,
            tracks: {
                track1: {
                    id: 'track1',
                    name: 'MIDI',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    midiSourceId: 'source1',
                    offsetTicks: 0,
                    clips: [
                        { id: 'clip1', type: 'midi', sourceId: 'source1', offsetTicks: 0 },
                        { id: 'clip2', type: 'midi', sourceId: 'source1', offsetTicks: CANONICAL_PPQ * 2 },
                    ],
                },
            },
            tracksOrder: ['track1'],
            midiCache: { source1: midiCacheEntry() },
        }));

        const exported = await exportScene();
        if (!exported.ok) throw new Error('Expected packaged export');
        const exportedTrack = exported.envelope.timeline.tracks.track1;

        expect(exported.envelope.schemaVersion).toBe(11);
        expect(exportedTrack.clips).toHaveLength(2);
        expect(exportedTrack.offsetTicks).toBeUndefined();
        expect(exportedTrack.midiSourceId).toBeUndefined();

        const imported = await importScene(exported.zip);
        expect(imported.ok).toBe(true);
        const restoredTrack = useTimelineStore.getState().tracks.track1 as any;
        expect(restoredTrack.clips.map((clip: any) => clip.id)).toEqual(['clip1', 'clip2']);
        expect(restoredTrack.midiSourceId).toBe('source1');
    });
});
