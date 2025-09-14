import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import { useTimelineStore } from '../timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';

function s() {
    return useTimelineStore.getState();
}

// This test guards against a regression where a 1-bar offset could be applied as ~5 bars
// due to mismatched PPQ (mixing 480 vs 960) or accidental multi-application.
describe('track offset consistency (beats -> ticks)', () => {
    it('1 bar offsetBeats yields ticks = beatsPerBar * PPQ', async () => {
        // Setup: create a new track
        const id = await act(async () => await s().addMidiTrack({ name: 'Offset Test' }));
        const beatsPerBar = s().timeline.beatsPerBar; // default 4
        // Apply 1 bar in beats
        act(() => {
            s().setTrackOffsetBeats(id as string, beatsPerBar);
        });
        const tr = s().tracks[id as string];
        expect(tr.offsetBeats).toBeCloseTo(beatsPerBar, 6);
        expect(tr.offsetTicks).toBe(beatsPerBar * CANONICAL_PPQ);
    });

    it('N bars round-trips consistently for several values', async () => {
        const id = Object.keys(s().tracks)[0];
        const beatsPerBar = s().timeline.beatsPerBar;
        const barsToTest = [0, 1, 2, 3, 8];
        for (const bars of barsToTest) {
            act(() => {
                s().setTrackOffsetBeats(id, bars * beatsPerBar);
            });
            const tr = s().tracks[id];
            expect(tr.offsetBeats).toBeCloseTo(bars * beatsPerBar, 6);
            expect(tr.offsetTicks).toBe(bars * beatsPerBar * CANONICAL_PPQ);
        }
    });
});
