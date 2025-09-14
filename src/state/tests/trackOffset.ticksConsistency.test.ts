import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import { useTimelineStore, getSharedTimingManager } from '../timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';

function s() {
    return useTimelineStore.getState();
}

// This test guards against a regression where a 1-bar offset could be applied as ~5 bars
// due to mismatched PPQ (mixing 480 vs 960) or accidental multi-application.
describe('track offset consistency (ticks only)', () => {
    it('1 bar offsetTicks = beatsPerBar * PPQ', async () => {
        const tm = getSharedTimingManager();
        const id = await act(async () => await s().addMidiTrack({ name: 'Offset Test' }));
        const beatsPerBar = s().timeline.beatsPerBar;
        const oneBarTicks = beatsPerBar * tm.ticksPerQuarter;
        act(() => {
            s().setTrackOffsetTicks(id as string, oneBarTicks);
        });
        const tr = s().tracks[id as string];
        expect(tr.offsetTicks).toBe(oneBarTicks);
    });

    it('N bar offsets produce expected tick counts', async () => {
        const tm = getSharedTimingManager();
        const id = Object.keys(s().tracks)[0];
        const beatsPerBar = s().timeline.beatsPerBar;
        const barsToTest = [0, 1, 2, 3, 8];
        for (const bars of barsToTest) {
            const ticks = bars * beatsPerBar * tm.ticksPerQuarter;
            act(() => s().setTrackOffsetTicks(id, ticks));
            const tr = s().tracks[id];
            expect(tr.offsetTicks).toBe(ticks);
        }
    });
});
