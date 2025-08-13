import { computeScaledTransform } from '.';
import { ScaleComputationParams } from '.';

// Simple diagnostic test to verify scaling with skew keeps dragged corner under cursor.
// Logs computed vs expected world corner delta.

const baseBounds = { x: 0, y: 0, width: 100, height: 80, anchorX: 0, anchorY: 0 };
const geom = {
    widthVec: { x: 100, y: 0 },
    heightVec: { x: 0, y: 80 },
    corners: { TL: { x: 0, y: 0 }, TR: { x: 100, y: 0 }, BR: { x: 100, y: 80 }, BL: { x: 0, y: 80 } },
    mids: {
        MTop: { x: 50, y: 0 },
        MRight: { x: 100, y: 40 },
        MBottom: { x: 50, y: 80 },
        MLeft: { x: 0, y: 40 },
    },
    baseBounds,
};

function buildParams(overrides: Partial<ScaleComputationParams>): ScaleComputationParams {
    return {
        mode: 'scale-se',
        origScaleX: 1,
        origScaleY: 1,
        baseBounds,
        fixedWorldPoint: { x: 0, y: 0 },
        fixedLocalPoint: { x: 0, y: 0 },
        dragLocalPoint: { x: 100, y: 80 },
        geom,
        origRotation: Math.PI / 8, // some rotation
        origSkewX: 0.4, // radians (approx 22.9 deg)
        origSkewY: -0.25, // radians (~ -14.3 deg)
        origAnchorX: 0,
        origAnchorY: 0,
        ...overrides,
    };
}

// Simulate dragging the SE corner to (200, 160) in world space (doubling along both intuitive axes)
const params = buildParams({});
const targetMouse = { x: 200, y: 160 };
const res = computeScaledTransform(targetMouse.x, targetMouse.y, params, false);
console.log('Skew corner scale test result:', res);
