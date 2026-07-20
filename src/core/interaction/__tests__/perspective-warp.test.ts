import { describe, expect, it } from 'vitest';
import { computeWarpCornerDrag, inverseMapPointerToNormalizedLocal } from '../perspective-warp';
import { IDENTITY_PERSPECTIVE_WARP } from '@math/perspective-warp';

describe('perspective warp interaction', () => {
    const affine = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 };
    const bounds = { x: 10, y: 20, width: 200, height: 100 };

    it('inverse-maps a world pointer through the affine element transform', () => {
        expect(inverseMapPointerToNormalizedLocal({ x: 520, y: 290 }, affine, bounds)).toEqual({ x: 1, y: 1 });
    });

    it('updates only the requested corner when the sample is valid', () => {
        const result = computeWarpCornerDrag({ x: 500, y: 90 }, 'warp-tr', IDENTITY_PERSPECTIVE_WARP, affine, bounds)!;
        expect(result.point).toEqual({ x: 0.95, y: 0 });
        expect(result.warp.topRight).toEqual(result.point);
        expect(result.warp.topLeft).toEqual({ x: 0, y: 0 });
        expect(result.warp.bottomRight).toEqual({ x: 1, y: 1 });
    });

    it('rejects an invalid drag sample', () => {
        const result = computeWarpCornerDrag({ x: 440, y: 250 }, 'warp-tl', IDENTITY_PERSPECTIVE_WARP, affine, bounds);
        expect(result).toBeNull();
    });
});
