import { describe, expect, it } from 'vitest';
import { migrateSceneAudioClipSourceTimeV10 } from '../migrations/audioClipSourceTimeV10';

describe('audio clip source-time V10 migration', () => {
    it('converts a crossing legacy trim using the saved tempo map and clip placement', () => {
        const migrated = migrateSceneAudioClipSourceTimeV10({
            schemaVersion: 8,
            timeline: {
                timeline: {
                    globalBpm: 120,
                    beatsPerBar: 4,
                    masterTempoMap: [{ time: 0, bpm: 120 }, { time: 2, bpm: 60 }],
                },
                audioCache: { source: { durationSeconds: 5, durationTicks: 0 } },
                tracks: {
                    track: {
                        id: 'track', type: 'audio', audioSourceId: 'source',
                        clips: [{ id: 'clip', type: 'audio', sourceId: 'source', offsetTicks: 3 * 960, regionStartTick: 0, regionEndTick: 3 * 960 }],
                    },
                },
            },
        });
        const clip: any = migrated.timeline.tracks.track.clips[0];
        expect(migrated.schemaVersion).toBe(10);
        expect(clip.sourceStartSeconds).toBe(0);
        // Starts at 1.5s; its three beats cross the 2s tempo step: 0.5s + 2s.
        expect(clip.sourceEndSeconds).toBeCloseTo(2.5, 6);
        expect(clip.regionStartTick).toBeUndefined();
        expect(clip.regionEndTick).toBeUndefined();
    });
});
