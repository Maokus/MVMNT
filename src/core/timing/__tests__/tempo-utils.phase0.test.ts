import { describe, it, expect } from 'vitest';
import { beatsToSeconds, secondsToBeats } from '../tempo-utils';
import type { TempoMapEntry } from '../types';

describe('tempo-utils Phase 0', () => {
    it('fallback only (no map): round-trip seconds<->beats', () => {
        const spb = 0.5; // 120 bpm
        const s = 12.34;
        const b = secondsToBeats(undefined, s, spb);
        const s2 = beatsToSeconds(undefined, b, spb);
        expect(s2).toBeCloseTo(s, 9);
    });

    it('with tempo map segments', () => {
        const map: TempoMapEntry[] = [
            { time: 0, bpm: 120 }, // 0.5 s/beat
            { time: 10, bpm: 60 }, // 1.0 s/beat, at 10s boundary
        ];
        const spb = 0.5;
        // 10 seconds corresponds to 20 beats at 120 bpm
        const beatsAt10 = secondsToBeats(map, 10, spb);
        expect(beatsAt10).toBeCloseTo(20, 6);
        // 25 beats => first 20 beats at 0.5s (10s) + next 5 beats at 1.0s = 15s total
        const secAt25 = beatsToSeconds(map, 25, spb);
        expect(secAt25).toBeCloseTo(15, 6);
    });
});
