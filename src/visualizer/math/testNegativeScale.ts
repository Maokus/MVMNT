import { computeScaledTransform } from '.';
import { ScaleComputationParams } from '.';

// Simple ad-hoc console test (not part of jest) to verify negative scaling sign preservation.
const baseBounds = { x: 0, y: 0, width: 100, height: 80, anchorX: 0.5, anchorY: 0.5 } as any;
const geom: any = {
    widthVec: { x: 100, y: 0 },
    heightVec: { x: 0, y: 80 },
    corners: { TL: { x: 0, y: 0 }, TR: { x: 100, y: 0 }, BR: { x: 100, y: 80 }, BL: { x: 0, y: 80 } },
    mids: {},
};

const params: ScaleComputationParams = {
    mode: 'scale-e',
    origScaleX: 1,
    origScaleY: 1,
    baseBounds,
    fixedWorldPoint: { x: 0, y: 0 },
    fixedLocalPoint: { x: 0, y: 0 },
    dragLocalPoint: { x: 100, y: 0 },
    geom,
    origRotation: 0,
    origSkewX: 0,
    origSkewY: 0,
    origAnchorX: 0.5,
    origAnchorY: 0.5,
};

// Drag mouse to negative x (past the fixedWest point) to induce negative scale.
const res = computeScaledTransform(-50, 0, params, false);
console.log('Negative scale test result:', res);
