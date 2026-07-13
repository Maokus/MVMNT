import { describe, expect, it } from 'vitest';
import type { AudioClip } from '@audio/audioTypes';
import { getAudioClipSourceBounds, getAudioClipTimelineBounds } from '../audioClips';
import { createTimingContext, ticksToSeconds } from '@state/timelineTime';

describe('audio clip source-time timing', () => {
    const cache = {
        source: {
            durationSeconds: 3,
            durationSamples: 144000,
            durationTicks: 5760,
            sampleRate: 48000,
            channels: 1,
        },
    } as any;
    const timing = createTimingContext({
        globalBpm: 120,
        beatsPerBar: 4,
        masterTempoMap: [{ time: 0, bpm: 120 }, { time: 2, bpm: 60 }],
    });

    it('derives a fixed source duration across a tempo boundary', () => {
        const clip: AudioClip = {
            id: 'crossing', type: 'audio', sourceId: 'source', offsetTicks: 3 * 960,
            sourceStartSeconds: 0, sourceEndSeconds: 3,
        };
        const bounds = getAudioClipTimelineBounds(cache, clip, timing);
        expect(bounds?.startTick).toBe(3 * 960);
        expect(ticksToSeconds(timing, bounds?.endTick ?? 0) - ticksToSeconds(timing, bounds?.startTick ?? 0)).toBeCloseTo(3, 3);
        expect(bounds?.endTick).toBe(6240);
    });

    it('keeps one source independent for clips at different musical placements', () => {
        const first: AudioClip = { id: 'first', type: 'audio', sourceId: 'source', offsetTicks: 0 };
        const second: AudioClip = { id: 'second', type: 'audio', sourceId: 'source', offsetTicks: 5 * 960 };
        expect(getAudioClipSourceBounds(cache, first)).toEqual({ startSeconds: 0, endSeconds: 3 });
        expect(getAudioClipSourceBounds(cache, second)).toEqual({ startSeconds: 0, endSeconds: 3 });
        const firstBounds = getAudioClipTimelineBounds(cache, first, timing);
        const secondBounds = getAudioClipTimelineBounds(cache, second, timing);
        expect(ticksToSeconds(timing, firstBounds!.endTick) - ticksToSeconds(timing, firstBounds!.startTick)).toBeCloseTo(3, 3);
        expect(ticksToSeconds(timing, secondBounds!.endTick) - ticksToSeconds(timing, secondBounds!.startTick)).toBeCloseTo(3, 3);
    });
});
