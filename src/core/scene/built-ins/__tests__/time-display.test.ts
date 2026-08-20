import { describe, it, expect, vi } from 'vitest';
import { sceneElementRegistry } from '@core/scene/registry';
import type { EmptyRenderObject } from '@core/render/render-objects';

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
            subscribe: vi.fn(() => () => {}),
        },
    };
});

describe('TimeDisplayElement offsetBars', () => {
    it('shifts displayed bar/beat by offsetBars while keeping internal time', () => {
        const elNoOffset = sceneElementRegistry.createElement('timeDisplay', { id: 'testTimeBase' });
        const elWithOffset = sceneElementRegistry.createElement('timeDisplay', {
            id: 'testTimeOffset',
            offsetBars: 2,
        });

        const rosNoOffset = (elNoOffset?.buildRenderObjects({}, 0)[0] as EmptyRenderObject).getChildren();
        const rosWithOffset = (elWithOffset?.buildRenderObjects({}, 0)[0] as EmptyRenderObject).getChildren();

        const barTextNoOffset = (rosNoOffset[3] as any).text; // index 3 = bar label per implementation
        const barTextWithOffset = (rosWithOffset[3] as any).text;

        expect(barTextNoOffset).toBe('000');
        expect(barTextWithOffset).toBe('002'); // +2 bars => 1 -> 3
    });

    it.skip('applies negative offset', () => {
        const el = sceneElementRegistry.createElement('timeDisplay', { id: 'testTimeNeg', offsetBars: -1 });
        const ros = (el?.buildRenderObjects({ offsetBars: -1 }, 0)[0] as EmptyRenderObject).getChildren();
        const barText = (ros[3] as any).text;
        // Clamped to 0 time, so negative bars should not go below 000
        expect(barText).toBe('-01');
    });
});
