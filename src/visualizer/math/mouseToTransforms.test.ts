import { describe, test, expect } from 'vitest';
import { computeScaledTransform, computeAnchorAdjustment, computeRotation } from './mouseToTransforms';
import { applyRSK } from './transformHelpers';
import { ScaleComputationParams, AnchorAdjustParams } from './types';

function buildGeom(width: number, height: number) {
    return {
        widthVec: { x: width, y: 0 },
        heightVec: { x: 0, y: height },
        corners: {
            TL: { x: 0, y: 0 },
            TR: { x: width, y: 0 },
            BR: { x: width, y: height },
            BL: { x: 0, y: height },
        },
        mids: {
            MTop: { x: width / 2, y: 0 },
            MRight: { x: width, y: height / 2 },
            MBottom: { x: width / 2, y: height },
            MLeft: { x: 0, y: height / 2 },
        },
        baseBounds: { x: 0, y: 0, width, height, anchorX: 0, anchorY: 0 },
    } as const;
}

function buildScaleParams(overrides: Partial<ScaleComputationParams>): ScaleComputationParams {
    const geom = buildGeom(100, 100);
    return {
        mode: 'scale-se',
        origScaleX: 1,
        origScaleY: 1,
        baseBounds: geom.baseBounds,
        fixedWorldPoint: { x: 0, y: 0 },
        fixedLocalPoint: { x: 0, y: 0 },
        dragLocalPoint: { x: 0, y: 0 },
        geom: geom as any,
        origRotation: 0,
        origSkewX: 0,
        origSkewY: 0,
        origAnchorX: 0,
        origAnchorY: 0,
        ...overrides,
    };
}

describe('computeScaledTransform basic scaling', () => {
    test('corner scale se simple square', () => {
        const params = buildScaleParams({ mode: 'scale-se', fixedWorldPoint: { x: 0, y: 0 } });
        const res = computeScaledTransform(100, 100, params, false)!;
        expect(res.newScaleX).toBeCloseTo(1, 5);
        expect(res.newScaleY).toBeCloseTo(1, 5);
    });

    test('negative horizontal scale via east handle', () => {
        const params = buildScaleParams({ mode: 'scale-e', fixedWorldPoint: { x: 0, y: 0 } });
        const res = computeScaledTransform(-50, 0, params, false)!;
        expect(res.newScaleX).toBeLessThan(0);
        expect(Math.abs(res.newScaleX)).toBeCloseTo(0.5, 4);
    });
});

describe('computeScaledTransform with skew & rotation (corner exact solve)', () => {
    test('doubling along intuitive axes under skew+rotation increases scale', () => {
        const geom = buildGeom(100, 80);
        const params: ScaleComputationParams = {
            mode: 'scale-se',
            origScaleX: 1,
            origScaleY: 1,
            baseBounds: geom.baseBounds,
            fixedWorldPoint: { x: 0, y: 0 },
            fixedLocalPoint: { x: 0, y: 0 },
            dragLocalPoint: { x: 100, y: 80 },
            geom: geom as any,
            origRotation: Math.PI / 8,
            origSkewX: 0.4,
            origSkewY: -0.25,
            origAnchorX: 0,
            origAnchorY: 0,
        };
        const targetMouse = { x: 200, y: 160 };
        const res = computeScaledTransform(targetMouse.x, targetMouse.y, params, false)!;
        expect(res.newScaleX).toBeGreaterThan(1.2);
        expect(res.newScaleY).toBeGreaterThan(1.2);
        expect(res.newScaleX).toBeLessThan(2.1);
        expect(res.newScaleY).toBeLessThan(2.1);
    });
});

describe('computeAnchorAdjustment invariants', () => {
    test('offset update matches applyRSK(deltaLocal) formula', () => {
        const baseBounds = { x: 0, y: 0, width: 120, height: 60, anchorX: 0, anchorY: 0 } as any;
        const params: AnchorAdjustParams = {
            baseBounds,
            origAnchorX: 0.25,
            origAnchorY: 0.25,
            origOffsetX: 300,
            origOffsetY: 100,
            origRotation: Math.PI / 6,
            origSkewX: 0.3,
            origSkewY: -0.2,
            origScaleX: 1.2,
            origScaleY: 0.8,
        };
        const targetAnchor = { x: 0.6, y: 0.7 };
        // Forge a mouse position that will decode to this anchor in inverse math: forward map local->world
        const targetLocal = { x: baseBounds.width * targetAnchor.x, y: baseBounds.height * targetAnchor.y };
        const targetRSK = applyRSK(
            targetLocal.x,
            targetLocal.y,
            params.origRotation,
            params.origSkewX,
            params.origSkewY,
            params.origScaleX,
            params.origScaleY
        );
        const mouseX = params.origOffsetX + targetRSK.x;
        const mouseY = params.origOffsetY + targetRSK.y;
        const adj = computeAnchorAdjustment(mouseX, mouseY, params, false);
        // Expected offset per formula newOffset = origOffset + RSK(deltaLocal)
        const oldAnchorLocal = {
            x: baseBounds.width * params.origAnchorX,
            y: baseBounds.height * params.origAnchorY,
        };
        const newAnchorLocal = {
            x: baseBounds.width * adj.newAnchorX,
            y: baseBounds.height * adj.newAnchorY,
        };
        const deltaLocal = {
            x: newAnchorLocal.x - oldAnchorLocal.x,
            y: newAnchorLocal.y - oldAnchorLocal.y,
        };
        const deltaWorld = applyRSK(
            deltaLocal.x,
            deltaLocal.y,
            params.origRotation,
            params.origSkewX,
            params.origSkewY,
            params.origScaleX,
            params.origScaleY
        );
        const expectedOffset = {
            x: params.origOffsetX + deltaWorld.x,
            y: params.origOffsetY + deltaWorld.y,
        };
        expect(adj.newOffsetX).toBeCloseTo(expectedOffset.x, 5);
        expect(adj.newOffsetY).toBeCloseTo(expectedOffset.y, 5);
    });
});

describe('computeRotation snapping', () => {
    test('rotation snapping with shift (15 deg increments)', () => {
        const bounds = { x: 0, y: 0, width: 100, height: 100 } as any;
        const p = {
            bounds,
            origAnchorX: 0.5,
            origAnchorY: 0.5,
            corners: null,
            startX: 50,
            startY: 0,
            origRotation: 0,
        };
        const angle = 47; // deg
        const r = (angle * Math.PI) / 180;
        const mouseX = 50 + Math.cos(r) * 50;
        const mouseY = 50 + Math.sin(r) * 50;
        const deg = computeRotation(mouseX, mouseY, p, true);
        expect(Math.round(deg) % 15).toBe(0);
        expect(Math.round(deg)).toBe(135); // relative delta from start (-90deg -> ~47deg)
    });
});
