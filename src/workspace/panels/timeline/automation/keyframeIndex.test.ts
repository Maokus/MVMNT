import { describe, expect, it } from 'vitest';
import { createChannel, createKeyframe, elementPropertyTarget } from '@automation/types';
import { indexHeaderKeyframes, keyframeTickAtPlayhead } from './keyframeIndex';

describe('keyframe rendering index', () => {
    it('indexes shared header ticks and preserves half-tick selection tolerance', () => {
        const a = createChannel(elementPropertyTarget('a', 'fontSize'), 'number');
        const b = createChannel(elementPropertyTarget('b', 'fontSize'), 'number');
        a.keyframes = [createKeyframe(0, 1), createKeyframe(10, 2)];
        b.keyframes = [createKeyframe(0.25, 3), createKeyframe(10, 4), createKeyframe(10.5, 5)];
        const index = indexHeaderKeyframes([a, b]);
        expect(index.ticks.map((entry) => entry.tick)).toEqual([0, 0.25, 10, 10.5]);
        expect(index.owners.get(0)).toEqual(new Set([a.id, b.id]));
        expect(index.owners.get(10)).toEqual(new Set([a.id, b.id]));
        expect(index.owners.get(10.5)).toEqual(new Set([b.id]));
    });

    it('finds a playhead keyframe in logarithmic work without a full keyframe scan', () => {
        let reads = 0;
        const keyframes = Array.from({ length: 100000 }, (_, index) => ({
            ...createKeyframe(index * 10, 1),
            get tick() {
                reads++;
                return index * 10;
            },
        }));
        expect(keyframeTickAtPlayhead(keyframes, 900000)).toBe(900000);
        expect(reads).toBeLessThan(30);
        expect(keyframeTickAtPlayhead(keyframes, 900000.5)).toBeNull();
        expect(keyframeTickAtPlayhead([], 0)).toBeNull();
    });
});
