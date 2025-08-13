import { computeAnchorAdjustment } from '.';
import { applyRSK } from './transformHelpers';
import { AnchorAdjustParams } from './types';

// Simple console test to verify anchor remains under same world position after adjustment when skew present.
// (Run with: npm run orphan src/visualizer/math/testSkewAnchor.ts) if you have a script similar to other tests.

const baseBounds = { x: 0, y: 0, width: 200, height: 100, anchorX: 0.5, anchorY: 0.5 } as any;

const params: AnchorAdjustParams = {
    baseBounds,
    origAnchorX: 0.5,
    origAnchorY: 0.5,
    origOffsetX: 100,
    origOffsetY: 100,
    origRotation: 0, // 30 deg
    origSkewX: 45,
    origSkewY: 0,
    origScaleX: 1,
    origScaleY: 1,
};

// Simulate dragging anchor to (0.75, 0.6) by constructing a mouse world coordinate.
const targetLocal = {
    x: baseBounds.x + baseBounds.width * 0.75,
    y: baseBounds.y + baseBounds.height * 0.6,
};
// Convert local delta from (0,0) to local point through RSK then add offset (simplistic for test)
const localDelta = { x: targetLocal.x, y: targetLocal.y }; // assuming base origin at (0,0)
const worldDelta = applyRSK(
    localDelta.x,
    localDelta.y,
    params.origRotation,
    params.origSkewX,
    params.origSkewY,
    params.origScaleX,
    params.origScaleY
);
const mouseX = params.origOffsetX + worldDelta.x;
const mouseY = params.origOffsetY + worldDelta.y;
const res = computeAnchorAdjustment(mouseX, mouseY, params, false);
console.log('Result anchor adjust (skew):', res);
