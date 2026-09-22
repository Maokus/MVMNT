import { describe, expect, it } from 'vitest';
import { TimingManager } from '@core/timing';
import { NoteBlock } from './note-block';

describe('Time Unit Piano Roll note segmentation', () => {
    it('preserves previous/current/next segments and attack/release window metadata', () => {
        const timing = new TimingManager('time-unit-segments');
        timing.setBPM(120);
        const windows = [
            { domain: 'seconds' as const, start: 0, end: 2 },
            { domain: 'seconds' as const, start: 2, end: 4 },
            { domain: 'seconds' as const, start: 4, end: 6 },
        ];

        const segments = NoteBlock.buildWindowedSegments(
            [{ note: 60, channel: 0, velocity: 100, startTime: 1.5, endTime: 4.5 }],
            timing,
            windows
        );

        expect(
            segments.map(({ startTime, endTime, window }) => ({
                startTime,
                endTime,
                window,
            }))
        ).toEqual([
            { startTime: 1.5, endTime: 2, window: windows[0] },
            { startTime: 2, endTime: 4, window: windows[1] },
            { startTime: 4, endTime: 4.5, window: windows[2] },
        ]);
        expect(new Set(segments.map((segment) => segment.baseNoteId)).size).toBe(1);
        expect(segments.every((segment) => segment.isSegment)).toBe(true);
    });

    it('does not duplicate notes that start or end exactly on a window boundary', () => {
        const timing = new TimingManager('time-unit-boundaries');
        timing.setBPM(120);
        const windows = [
            { domain: 'seconds' as const, start: 0, end: 2 },
            { domain: 'seconds' as const, start: 2, end: 4 },
            { domain: 'seconds' as const, start: 4, end: 6 },
        ];

        const segments = NoteBlock.buildWindowedSegments(
            [{ note: 64, velocity: 90, startTime: 2, endTime: 4 }],
            timing,
            windows
        );

        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({
            startTime: 2,
            endTime: 4,
            window: windows[1],
            isSegment: false,
        });
    });
});
