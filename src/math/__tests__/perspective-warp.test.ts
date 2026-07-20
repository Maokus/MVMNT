import { describe, expect, it } from 'vitest';
import {
    IDENTITY_PERSPECTIVE_WARP,
    applyAffinePoint,
    clipPerspectiveBounds,
    createPerspectiveCameraWarp,
    createHomography,
    getProjectedBounds,
    invertHomography,
    isPerspectiveEdgeOn,
    cameraDistanceToPerspectiveStrength,
    perspectiveStrengthToCameraDistance,
    projectPerspectivePoint,
    validatePerspectiveWarp,
    warpLocalPoint,
} from '../perspective-warp';

describe('perspective warp geometry', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const viewport = { width: 1000, height: 500 };
    const projection = {
        rotationX: 0, rotationY: 0, strength: 50,
        pivotX: 0.5, pivotY: 0.5,
        vanishingPointX: 0.5, vanishingPointY: 0.5,
    };

    it('derives identity at zero rotation and a valid aspect-aware tilted projection', () => {
        expect(createPerspectiveCameraWarp(bounds, affine, viewport, projection)).toEqual({
            kind: 'projected',
            warp: IDENTITY_PERSPECTIVE_WARP,
        });

        const tilted = createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationX: 20, rotationY: -15,
        });
        expect(tilted.kind).toBe('projected');
        expect(validatePerspectiveWarp(tilted.warp).valid).toBe(true);
        expect(tilted.warp).not.toEqual(IDENTITY_PERSPECTIVE_WARP);
    });

    it('supports independent pivots and canvas-relative vanishing points', () => {
        const centered = createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationX: 20, rotationY: 20,
        });
        const offset = createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection,
            rotationX: 20,
            rotationY: 20,
            pivotX: 0.2,
            pivotY: 0.8,
            vanishingPointX: 0.1,
            vanishingPointY: 0.9,
        });

        expect(offset).not.toEqual(centered);
        expect(offset.kind).toBe('projected');
        expect(validatePerspectiveWarp(offset.warp).valid).toBe(true);
        expect(isPerspectiveEdgeOn(90, 0)).toBe(true);
        expect(isPerspectiveEdgeOn(0, -90)).toBe(true);
        expect(isPerspectiveEdgeOn(89.9, 0)).toBe(false);
    });

    it('maps perspective strength to a safe camera distance', () => {
        expect(perspectiveStrengthToCameraDistance(0)).toBe(Infinity);
        expect(perspectiveStrengthToCameraDistance(100)).toBeCloseTo(1.1);
        expect(cameraDistanceToPerspectiveStrength(2.2)).toBeCloseTo(50);
        expect(cameraDistanceToPerspectiveStrength(Infinity)).toBe(0);
    });

    it('keeps the supported camera range finite and convex', () => {
        for (const rotationX of [-179, -120, -45, 0, 45, 120, 179]) {
            for (const rotationY of [-179, -120, -45, 0, 45, 120, 179]) {
                for (const strength of [0, 50, 100]) {
                    const result = createPerspectiveCameraWarp(bounds, affine, viewport, {
                        ...projection,
                        rotationX,
                        rotationY,
                        strength,
                        pivotX: rotationX > 0 ? 0 : 1,
                        pivotY: rotationY > 0 ? 1 : 0,
                        vanishingPointX: -2,
                        vanishingPointY: 3,
                    });
                    expect(result.kind).toBe('projected');
                    expect(validatePerspectiveWarp(result.warp).valid).toBe(true);
                }
            }
        }
    });

    it('preserves tilts beyond a quarter turn', () => {
        const positiveTilt = createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationX: 120,
        });
        const negativeTilt = createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationY: -120,
        });

        expect(positiveTilt.kind).toBe('projected');
        expect(negativeTilt.kind).toBe('projected');
        expect(positiveTilt.warp).not.toEqual(createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationX: 90,
        }).warp);
        expect(negativeTilt.warp).not.toEqual(createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationY: -90,
        }).warp);
    });

    it('reports exact quarter turns as edge-on', () => {
        expect(createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationX: 90,
        }).kind).toBe('edge-on');
        expect(createPerspectiveCameraWarp(bounds, affine, viewport, {
            ...projection, rotationY: -90,
        }).kind).toBe('edge-on');
    });

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
