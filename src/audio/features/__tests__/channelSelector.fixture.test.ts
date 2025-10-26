import { describe, expect, it } from 'vitest';
import midSideFrame from '../__fixtures__/mid-side-frame.json';
import { selectChannelSample } from '@core/scene/elements/audioFeatureUtils';

describe('channel selector fixtures', () => {
    it('selects mid-side channels using semantic aliases', () => {
        const sample = midSideFrame as any;
        const midSelection = selectChannelSample(sample, 'mid');
        expect(midSelection?.channelIndex).toBe(0);
        expect(midSelection?.values?.[0]).toBeCloseTo(0.2, 5);

        const sideSelection = selectChannelSample(sample, 'side');
        expect(sideSelection?.channelIndex).toBe(1);
        expect(sideSelection?.values?.[0]).toBeCloseTo(-0.2, 5);
    });

    it('falls back to numeric channel indices when provided', () => {
        const sample = midSideFrame as any;
        const numericSelection = selectChannelSample(sample, 1);
        expect(numericSelection?.channelIndex).toBe(1);
    });
});
