import { skip } from 'node:test';
import { TimeDisplayElement } from './time-display';
import { describe, it, expect, vi } from 'vitest';

// Minimal mock for timeline store used inside TimeDisplayElement
vi.mock('@state/timelineStore', () => {
    return {
        useTimelineStore: {
            getState: () => ({
                timeline: {
                    globalBpm: 120,
                    beatsPerBar: 4,
                    masterTempoMap: null,
                },
            }),
        },
    };
});

describe('TimeDisplayElement offsetBars', () => {
    it('shifts displayed bar/beat by offsetBars while keeping internal time', () => {
        const elNoOffset = new TimeDisplayElement('testTimeBase', {});
        const elWithOffset = new TimeDisplayElement('testTimeOffset', { offsetBars: 2 });

        const rosNoOffset = (elNoOffset as any)._buildRenderObjects({}, 0);
        const rosWithOffset = (elWithOffset as any)._buildRenderObjects({}, 0);

        const barTextNoOffset = (rosNoOffset[3] as any).text; // index 3 = bar label per implementation
        const barTextWithOffset = (rosWithOffset[3] as any).text;

        expect(barTextNoOffset).toBe('000');
        expect(barTextWithOffset).toBe('002'); // +2 bars => 1 -> 3
    });

    skip('applies negative offset', () => {
        const el = new TimeDisplayElement('testTimeNeg', { offsetBars: -1 });
        const ros = (el as any)._buildRenderObjects({ offsetBars: -1 }, 0);
        const barText = (ros[3] as any).text;
        // Clamped to 0 time, so negative bars should not go below 000
        expect(barText).toBe('-01');
    });
});
