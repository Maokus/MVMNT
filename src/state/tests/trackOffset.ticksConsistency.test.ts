import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import { useTimelineStore, getSharedTimingManager } from '../timelineStore';

function s() {
    return useTimelineStore.getState();
}

// This test guards against a regression where a 1-bar offset could be applied as ~5 bars
// Guard against accidental double offset application or PPQ mismatch. Uses CANONICAL_PPQ consistently.
describe('track offset consistency (ticks only)', () => {
    it('1 bar offsetTicks = beatsPerBar * PPQ', async () => {
        const tm = getSharedTimingManager();
        let createdId: string | undefined;
        await act(async () => {
            createdId = await s().addMidiTrack({ name: 'Offset Test' });
        });
        const id = createdId as string;
        const beatsPerBar = s().timeline.beatsPerBar;
        const oneBarTicks = beatsPerBar * tm.ticksPerQuarter;
        await act(async () => {
            await s().setTrackOffsetTicks(id, oneBarTicks);
        });
        const tr = s().tracks[id];
        expect(tr.offsetTicks).toBe(oneBarTicks);
    });

    it('N bar offsets produce expected tick counts', async () => {
        const tm = getSharedTimingManager();
        const id = Object.keys(s().tracks)[0];
        const beatsPerBar = s().timeline.beatsPerBar;
        const barsToTest = [0, 1, 2, 3, 8];
        for (const bars of barsToTest) {
            const ticks = bars * beatsPerBar * tm.ticksPerQuarter;
            await act(async () => {
                await s().setTrackOffsetTicks(id, ticks);
            });
            const tr = s().tracks[id];
            expect(tr.offsetTicks).toBe(ticks);
        }
    });
});
