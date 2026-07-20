import { describe, expect, it } from 'vitest';
import { computeAnchorAdjustment, computeRotation, computeScaledTransform } from '../mouse-transforms';
import { applyRSK } from '@math/transforms/numeric';
import { createHomography, warpLocalPoint } from '@math/perspective-warp';

const bounds = { x: 0, y: 0, width: 200, height: 100, anchorX: 0.5, anchorY: 0.5 };
const warp = {
    topLeft: { x: 0.1, y: 0 },
    topRight: { x: 0.9, y: 0.1 },
    bottomRight: { x: 1.1, y: 1 },
    bottomLeft: { x: -0.1, y: 0.9 },
};

describe('perspective-aware mouse transforms', () => {
    it('inverse-maps an anchor drag through the warp and keeps the displayed anchor under the pointer', () => {
        const matrix = createHomography(warp)!;
        const oldOrigin = warpLocalPoint(matrix, bounds, { x: 100, y: 50 })!;
        const target = warpLocalPoint(matrix, bounds, { x: 50, y: 75 })!;
        const offset = { x: 300, y: 180 };
        const pointer = { x: offset.x + target.x - oldOrigin.x, y: offset.y + target.y - oldOrigin.y };

        const result = computeAnchorAdjustment(pointer.x, pointer.y, {
            baseBounds: bounds,
            origAnchorX: 0.5,
            origAnchorY: 0.5,
            origOffsetX: offset.x,
            origOffsetY: offset.y,
            origRotation: 0,
            origSkewX: 0,
            origSkewY: 0,
            origScaleX: 1,
            origScaleY: 1,
            warp,
        }, false);

        expect(result.newAnchorX).toBeCloseTo(0.25, 8);
        expect(result.newAnchorY).toBeCloseTo(0.75, 8);
        expect(result.newOffsetX).toBeCloseTo(pointer.x, 8);
        expect(result.newOffsetY).toBeCloseTo(pointer.y, 8);
    });

    it('rotates around the projected anchor instead of a bilinear corner approximation', () => {
        const rotation = computeRotation(100, 20, {
            bounds,
            origAnchorX: 0.5,
            origAnchorY: 0.5,
            origRotation: 0,
            startX: 80,
            startY: 50,
            anchorWorld: { x: 100, y: 50 },
        }, false);
        expect(rotation).toBeCloseTo(Math.PI / 2, 8);
    });

    it('solves a warped scale handle in post-warp local space', () => {
        const matrix = createHomography(warp)!;
        const fixed = warpLocalPoint(matrix, bounds, { x: 0, y: 0 })!;
        const drag = warpLocalPoint(matrix, bounds, { x: 200, y: 100 })!;
        const anchor = warpLocalPoint(matrix, bounds, { x: 100, y: 50 })!;
        const offset = { x: 400, y: 200 };
        const fixedWorld = { x: offset.x + fixed.x - anchor.x, y: offset.y + fixed.y - anchor.y };
        const targetScale = { x: 1.4, y: 0.7 };
        const pointerDelta = applyRSK(drag.x - fixed.x, drag.y - fixed.y, 0, 0, 0, targetScale.x, targetScale.y);
        const result = computeScaledTransform(fixedWorld.x + pointerDelta.x, fixedWorld.y + pointerDelta.y, {
            mode: 'scale-se', origScaleX: 1, origScaleY: 1, baseBounds: bounds,
            fixedWorldPoint: fixedWorld, fixedLocalPoint: { x: 0, y: 0 }, dragLocalPoint: { x: 200, y: 100 },
            geom: { widthVec: { x: 1, y: 0 }, heightVec: { x: 0, y: 1 }, corners: { TL: fixedWorld, TR: fixedWorld, BR: fixedWorld, BL: fixedWorld }, mids: { MTop: fixedWorld, MRight: fixedWorld, MBottom: fixedWorld, MLeft: fixedWorld }, baseBounds: bounds },
            origRotation: 0, origSkewX: 0, origSkewY: 0, origAnchorX: 0.5, origAnchorY: 0.5, warp,
        }, false)!;

        expect(result.newScaleX).toBeCloseTo(targetScale.x, 8);
        expect(result.newScaleY).toBeCloseTo(targetScale.y, 8);
    });
});
