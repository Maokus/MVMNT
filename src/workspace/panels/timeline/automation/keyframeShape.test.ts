import { describe, expect, it } from 'vitest';
import { buildKeyframeShapePath, getKeyframeHalfShape } from './keyframeShape';

describe('automation keyframe shapes', () => {
    it('maps segment interactions to stable half-shapes', () => {
        expect(getKeyframeHalfShape({ mode: 'constant', direction: 'auto' }, undefined, 'left')).toBe('square');
        expect(getKeyframeHalfShape({ mode: 'bezier', direction: 'auto' }, 'auto', 'right')).toBe('circle');
        expect(getKeyframeHalfShape({ mode: 'quad', direction: 'ease_in' }, undefined, 'right')).toBe('hourglass');
        expect(getKeyframeHalfShape({ mode: 'quad', direction: 'ease_in' }, undefined, 'left')).toBe('diamond');
    });

    it('builds one closed SVG path from the two interaction halves', () => {
        const path = buildKeyframeShapePath('square', 'circle', 10, 20, 7);
        expect(path).toMatch(/^M10,13 /);
        expect(path).toContain('A7,7');
        expect(path).toMatch(/ Z$/);
    });
});
