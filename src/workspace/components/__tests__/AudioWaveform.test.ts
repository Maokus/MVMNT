import { describe, expect, it } from 'vitest';
import { getWaveformBinAtTimelineTick } from '../AudioWaveform';
import { createTimingContext } from '@state/timelineTime';

describe('getWaveformBinAtTimelineTick', () => {
    it('maps equally spaced timeline ticks through tempo automation before reading waveform peaks', () => {
        const timing = createTimingContext({
            globalBpm: 120,
            beatsPerBar: 4,
            masterTempoMap: [
                { time: 0, tempo: 500_000 },
                { time: 1, tempo: 1_000_000 },
            ],
        });

        // A two-second source spans 2,880 ticks here: 1,920 ticks in the
        // first second at 120 BPM, then 960 ticks in the second at 60 BPM.
        // The midpoint in ticks is only 0.75 seconds into the source, so it
        // must select bin 3 rather than the uniform-stretch bin 4.
        expect(
            getWaveformBinAtTimelineTick({
                tick: 1_440,
                clipStartTick: 0,
                sourceDurationSeconds: 2,
                binCount: 8,
                timing,
            })
        ).toBe(3);
    });
});
