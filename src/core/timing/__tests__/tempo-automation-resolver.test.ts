import { describe, it, expect } from 'vitest';
import { resolveTempoKeyframes } from '../tempo-automation-resolver';

const PPQ = 960;

describe('resolveTempoKeyframes', () => {
    it('returns single globalBpm entry for empty keyframes', () => {
        const result = resolveTempoKeyframes([], 120, PPQ);
        expect(result).toEqual([{ time: 0, bpm: 120, curve: 'step' }]);
    });

    it('replaces globalBpm when keyframe is at tick 0', () => {
        const result = resolveTempoKeyframes([{ tick: 0, bpm: 140 }], 120, PPQ);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ time: 0, bpm: 140, curve: 'step' });
    });

    it('computes correct seconds for single keyframe at non-zero tick', () => {
        // 1920 ticks at 120bpm, PPQ=960 => 1.0 sec
        const result = resolveTempoKeyframes([{ tick: 1920, bpm: 100 }], 120, PPQ);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ time: 0, bpm: 120, curve: 'step' });
        expect(result[1].time).toBeCloseTo(1.0);
        expect(result[1].bpm).toBe(100);
        expect(result[1].curve).toBe('step');
    });

    it('handles multiple keyframes with BPM changes', () => {
        // At 120bpm: 1920 ticks = 1.0 sec
        // At 60bpm: 960 ticks = 1.0 sec
        const result = resolveTempoKeyframes(
            [
                { tick: 1920, bpm: 60 },  // at 1.0 sec
                { tick: 2880, bpm: 90 },  // 960 ticks at 60bpm = 1.0sec → at 2.0 sec
            ],
            120,
            PPQ,
        );
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ time: 0, bpm: 120, curve: 'step' });
        expect(result[1].time).toBeCloseTo(1.0);
        expect(result[1].bpm).toBe(60);
        expect(result[2].time).toBeCloseTo(2.0);
        expect(result[2].bpm).toBe(90);
    });

    it('clamps BPM of 0 to 1', () => {
        const result = resolveTempoKeyframes([{ tick: 960, bpm: 0 }], 120, PPQ);
        expect(result[1].bpm).toBe(1);
    });

    it('clamps negative BPM to 1', () => {
        const result = resolveTempoKeyframes([{ tick: 960, bpm: -50 }], 120, PPQ);
        expect(result[1].bpm).toBe(1);
    });

    it('clamps NaN BPM to 1', () => {
        const result = resolveTempoKeyframes([{ tick: 960, bpm: NaN }], 120, PPQ);
        expect(result[1].bpm).toBe(1);
    });

    it('clamps BPM > 999 to 999', () => {
        const result = resolveTempoKeyframes([{ tick: 960, bpm: 1500 }], 120, PPQ);
        expect(result[1].bpm).toBe(999);
    });

    it('clamps globalBpm of 0 to 1', () => {
        const result = resolveTempoKeyframes([], 0, PPQ);
        expect(result[0].bpm).toBe(1);
    });

    it('uses PPQ=480 correctly', () => {
        // 960 ticks at 120bpm, PPQ=480 = 2 quarter notes = 1.0 sec
        const result = resolveTempoKeyframes([{ tick: 960, bpm: 100 }], 120, 480);
        expect(result[1].time).toBeCloseTo(1.0);
    });

    it('defaults to PPQ=960 when ppq is 0', () => {
        const result = resolveTempoKeyframes([{ tick: 1920, bpm: 100 }], 120, 0);
        expect(result[1].time).toBeCloseTo(1.0);
    });

    it('handles tick-0 keyframe plus subsequent keyframe', () => {
        // Tick 0 at 60bpm, then 960 ticks later (at 60bpm = 1.0 sec)
        const result = resolveTempoKeyframes(
            [
                { tick: 0, bpm: 60 },
                { tick: 960, bpm: 120 },
            ],
            120,
            PPQ,
        );
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ time: 0, bpm: 60, curve: 'step' });
        expect(result[1].time).toBeCloseTo(1.0);
        expect(result[1].bpm).toBe(120);
    });

    it('all entries have curve: "step"', () => {
        const result = resolveTempoKeyframes(
            [{ tick: 960, bpm: 80 }, { tick: 1920, bpm: 140 }],
            120,
            PPQ,
        );
        for (const entry of result) {
            expect(entry.curve).toBe('step');
        }
    });

    it('handles negative tick deltas defensively (clamped to 0)', () => {
        // Unsorted input: second keyframe is before the first
        const result = resolveTempoKeyframes(
            [{ tick: 1920, bpm: 100 }, { tick: 960, bpm: 80 }],
            120,
            PPQ,
        );
        // The second keyframe has a negative delta; the resolver clamps to 0 duration
        expect(result).toHaveLength(3);
        // The second entry should have a time >= the first non-initial entry
        expect(result[2].time).toBe(result[1].time);
    });
});
