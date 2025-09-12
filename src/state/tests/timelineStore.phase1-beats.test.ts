import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import { useTimelineStore } from '../timelineStore';

function s() {
    return useTimelineStore.getState();
}

describe('timelineStore Phase 1: beats-based offsets', () => {
    it('initializes offsetBeats from offsetSec on addMidiTrack', async () => {
        const id = await act(async () => await s().addMidiTrack({ name: 'Beat Test', offsetSec: 1 }));
        const st = s();
        const tr = st.tracks[id as any];
        // Default BPM 120 => 1 beat = 0.5 sec, so 1 sec => 2 beats
        expect(tr.offsetBeats).toBeCloseTo(2, 6);
        expect(tr.offsetSec).toBeCloseTo(1, 6);
    });

    it('setTrackOffsetBeats updates offsetSec accordingly', () => {
        const id = Object.keys(s().tracks)[0];
        act(() => {
            s().setTrackOffsetBeats(id, 4); // 4 beats at 120bpm => 2 sec
        });
        const tr = s().tracks[id];
        expect(tr.offsetBeats).toBeCloseTo(4, 6);
        expect(tr.offsetSec).toBeCloseTo(2, 6);
    });

    it('setTrackOffset delegates to beats-based storage', () => {
        const id = Object.keys(s().tracks)[0];
        act(() => {
            s().setTrackOffset(id, 0.5); // 0.5 sec => 1 beat at 120bpm
        });
        const tr = s().tracks[id];
        expect(tr.offsetSec).toBeCloseTo(0.5, 6);
        expect(tr.offsetBeats).toBeCloseTo(1, 6);
    });
});
