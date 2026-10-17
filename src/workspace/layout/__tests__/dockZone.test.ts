import { describe, expect, it } from 'vitest';
import { resolveDockZone } from '../dockZone';

const rect = { left: 0, top: 0, width: 400, height: 400 };

describe('resolveDockZone', () => {
    it('picks the nearest edge zone', () => {
        expect(resolveDockZone(rect, 20, 200)).toBe('left');
        expect(resolveDockZone(rect, 380, 200)).toBe('right');
        expect(resolveDockZone(rect, 200, 20)).toBe('top');
        expect(resolveDockZone(rect, 200, 380)).toBe('bottom');
    });

    it('merges in the middle of the column', () => {
        expect(resolveDockZone(rect, 200, 200)).toBe('center');
        expect(resolveDockZone(rect, 180, 220)).toBe('center');
    });

    it('resolves relative to the column origin, not the viewport', () => {
        const offset = { left: 300, top: 100, width: 400, height: 400 };
        expect(resolveDockZone(offset, 320, 300)).toBe('left');
        expect(resolveDockZone(offset, 500, 300)).toBe('center');
    });

    it('falls back to the merge zone for a collapsed column', () => {
        expect(resolveDockZone({ left: 0, top: 0, width: 0, height: 0 }, 0, 0)).toBe('center');
    });
});
