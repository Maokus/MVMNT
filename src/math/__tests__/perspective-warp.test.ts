import { describe, expect, it } from 'vitest';
import {
    IDENTITY_PERSPECTIVE_WARP,
    applyAffinePoint,
    clipPerspectiveBounds,
    createHomography,
    getProjectedBounds,
    invertHomography,
    projectPerspectivePoint,
    validatePerspectiveWarp,
    warpLocalPoint,
} from '../perspective-warp';

describe('perspective warp geometry', () => {
    it('solves identity and strong quadrilateral homographies', () => {
        const identity = createHomography(IDENTITY_PERSPECTIVE_WARP)!;
        expect(projectPerspectivePoint(identity, { x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 });

        const warp = {
            topLeft: { x: -0.1, y: 0.15 },
            topRight: { x: 1.2, y: -0.05 },
            bottomRight: { x: 0.85, y: 1.1 },
            bottomLeft: { x: 0.08, y: 0.9 },
        };
        const matrix = createHomography(warp)!;
        const corners = [warp.topLeft, warp.topRight, warp.bottomRight, warp.bottomLeft];
        const sources = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
        sources.forEach((source, index) => {
            expect(projectPerspectivePoint(matrix, source)?.x).toBeCloseTo(corners[index].x, 8);
            expect(projectPerspectivePoint(matrix, source)?.y).toBeCloseTo(corners[index].y, 8);
        });
    });

    it('round-trips points through the inverse homography', () => {
        const matrix = createHomography({
            topLeft: { x: 0.1, y: 0 }, topRight: { x: 0.9, y: 0.2 },
            bottomRight: { x: 1.1, y: 1 }, bottomLeft: { x: -0.2, y: 0.85 },
        })!;
        const inverse = invertHomography(matrix)!;
        const source = { x: 0.37, y: 0.62 };
        const projected = projectPerspectivePoint(matrix, source)!;
        const restored = projectPerspectivePoint(inverse, projected)!;
        expect(restored.x).toBeCloseTo(source.x, 8);
        expect(restored.y).toBeCloseTo(source.y, 8);
    });

    it('composes warp before the existing affine transform', () => {
        const matrix = createHomography({
            topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 },
            bottomRight: { x: 0.8, y: 1 }, bottomLeft: { x: 0.2, y: 1 },
        })!;
        const local = warpLocalPoint(matrix, { x: 10, y: 20, width: 200, height: 100 }, { x: 210, y: 120 })!;
        const world = applyAffinePoint({ a: 2, b: 0, c: 0, d: 3, e: 5, f: 7 }, local);
        expect(local).toEqual({ x: 170, y: 120 });
        expect(world).toEqual({ x: 345, y: 367 });
    });

    it('computes projected and viewport-clipped AABBs', () => {
        expect(getProjectedBounds([{ x: -10, y: 5 }, { x: 30, y: -5 }, { x: 20, y: 40 }])).toEqual({
            x: -10, y: -5, width: 40, height: 45,
        });
        expect(clipPerspectiveBounds({ x: -10, y: 5, width: 40, height: 50 }, 20, 30)).toEqual({
            x: 0, y: 5, width: 20, height: 25,
        });
        expect(clipPerspectiveBounds({ x: 30, y: 5, width: 10, height: 10 }, 20, 30)).toBeNull();
    });

    it('rejects non-finite, concave, crossed, and degenerate quadrilaterals', () => {
        const invalid = [
            { topLeft: { x: NaN, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 1, y: 1 }, bottomLeft: { x: 0, y: 1 } },
            { topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 0.2, y: 0.2 }, bottomLeft: { x: 0, y: 1 } },
            { topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 1 }, bottomRight: { x: 1, y: 0 }, bottomLeft: { x: 0, y: 1 } },
            { topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 2, y: 0 }, bottomLeft: { x: 0, y: 1 } },
        ];
        invalid.forEach((warp) => expect(validatePerspectiveWarp(warp).valid).toBe(false));
    });
});

