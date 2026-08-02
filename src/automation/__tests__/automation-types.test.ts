import { describe, it, expect } from 'vitest';
import {
    elementPropertyTarget,
    createChannel,
    insertKeyframeSorted,
    removeKeyframeAtTick,
    cloneChannel,
    findKeyframeAtTick,
} from '../types';
import type { AutomationKeyframe } from '../types';

function kf(tick: number, value: unknown = 0): AutomationKeyframe {
    return { tick, value, segmentInterpolation: { mode: 'linear', direction: 'auto' } };
}

describe('automation/types utilities', () => {
    describe('createChannel', () => {
        it('creates an empty channel with defaults', () => {
            const ch = createChannel(elementPropertyTarget('el1', 'x'), 'number');
            expect(ch.id).toMatch(/^channel:/);
            expect(ch.target).toEqual({ owner: { kind: 'element', id: 'el1' }, propertyPath: 'x' });
            expect(ch.keyframes).toEqual([]);
            expect(ch.valueType).toBe('number');
        });
    });

    describe('insertKeyframeSorted', () => {
        it('inserts into empty array', () => {
            const result = insertKeyframeSorted([], kf(100));
            expect(result).toEqual([kf(100)]);
        });

        it('inserts in sorted order', () => {
            const existing = [kf(0), kf(200)];
            const result = insertKeyframeSorted(existing, kf(100, 50));
            expect(result.map((k) => k.tick)).toEqual([0, 100, 200]);
        });

        it('replaces keyframe at same tick within tolerance', () => {
            const existing = [kf(0, 0), kf(100, 10), kf(200, 20)];
            const result = insertKeyframeSorted(existing, kf(100, 99));
            expect(result.length).toBe(3);
            expect(result[1].value).toBe(99);
        });

        it('does not mutate the input array', () => {
            const existing = [kf(0), kf(200)];
            const copy = [...existing];
            insertKeyframeSorted(existing, kf(100));
            expect(existing).toEqual(copy);
        });
    });

    describe('removeKeyframeAtTick', () => {
        it('removes the keyframe at the given tick', () => {
            const kfs = [kf(0), kf(100), kf(200)];
            const result = removeKeyframeAtTick(kfs, 100);
            expect(result.map((k) => k.tick)).toEqual([0, 200]);
        });

        it('returns same-length array if tick not found', () => {
            const kfs = [kf(0), kf(100)];
            const result = removeKeyframeAtTick(kfs, 50);
            expect(result.length).toBe(2);
        });

        it('does not mutate the input array', () => {
            const kfs = [kf(0), kf(100)];
            const copy = [...kfs];
            removeKeyframeAtTick(kfs, 100);
            expect(kfs).toEqual(copy);
        });
    });

    describe('cloneChannel', () => {
        it('creates a deep copy', () => {
            const ch = createChannel(elementPropertyTarget('el1', 'x'), 'number');
            ch.keyframes.push(kf(0, 10));
            const cloned = cloneChannel(ch);
            expect(cloned.id).not.toBe(ch.id);
            expect(cloned.keyframes).toEqual(ch.keyframes);
            expect(cloned.keyframes).not.toBe(ch.keyframes);
        });

        it('reassigns to new element ID', () => {
            const ch = createChannel(elementPropertyTarget('el1', 'x'), 'number');
            const cloned = cloneChannel(ch, elementPropertyTarget('el2', 'x'));
            expect(cloned.id).toMatch(/^channel:/);
            expect(cloned.target.owner.id).toBe('el2');
        });
    });

    describe('findKeyframeAtTick', () => {
        it('finds exact match', () => {
            const kfs = [kf(0, 0), kf(100, 10), kf(200, 20)];
            expect(findKeyframeAtTick(kfs, 100)).toEqual(kf(100, 10));
        });

        it('finds within tolerance', () => {
            const kfs = [kf(100, 10)];
            expect(findKeyframeAtTick(kfs, 100.3, 0.5)).toEqual(kf(100, 10));
        });

        it('returns null if not found', () => {
            const kfs = [kf(0), kf(200)];
            expect(findKeyframeAtTick(kfs, 100)).toBeNull();
        });

        it('returns null for empty array', () => {
            expect(findKeyframeAtTick([], 0)).toBeNull();
        });
    });
});
