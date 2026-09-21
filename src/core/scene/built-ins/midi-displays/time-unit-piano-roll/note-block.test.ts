import { describe, expect, it } from 'vitest';
import { TimingManager, resolveTemporalWindow } from '@core/timing';
import { NoteBlock } from './note-block';

describe('Time Unit Piano Roll note segmentation', () => {
    it('preserves previous/current/next segments and attack/release window metadata', () => {
        const timing = new TimingManager('time-unit-segments');
        timing.setBPM(120);
        const frame = resolveTemporalWindow(timing, 2.01, {
            cadence: 'transport-relative',
            bars: 1,
            lookAheadSeconds: 0.3,
        });

        const segments = NoteBlock.buildWindowedSegments(
            [{ note: 60, channel: 0, velocity: 100, startTime: 1.5, endTime: 4.5 }],
            timing,
            frame
        );

        expect(
            segments.map(({ startTime, endTime, windowStart, windowEnd }) => ({
                startTime,
                endTime,
                windowStart,
                windowEnd,
            }))
        ).toEqual([
            { startTime: 1.5, endTime: 2, windowStart: 0, windowEnd: 2 },
            { startTime: 2, endTime: 4, windowStart: 2, windowEnd: 4 },
            { startTime: 4, endTime: 4.5, windowStart: 4, windowEnd: 6 },
        ]);
        expect(new Set(segments.map((segment) => segment.baseNoteId)).size).toBe(1);
        expect(segments.every((segment) => segment.isSegment)).toBe(true);
    });

    it('does not duplicate notes that start or end exactly on a window boundary', () => {
        const timing = new TimingManager('time-unit-boundaries');
        timing.setBPM(120);
        const frame = resolveTemporalWindow(timing, 2.01, { cadence: 'transport-relative', bars: 1 });

        const segments = NoteBlock.buildWindowedSegments(
            [{ note: 64, velocity: 90, startTime: 2, endTime: 4 }],
            timing,
            frame
        );

        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({
            startTime: 2,
            endTime: 4,
            windowStart: 2,
            windowEnd: 4,
            isSegment: false,
        });
    });
});
