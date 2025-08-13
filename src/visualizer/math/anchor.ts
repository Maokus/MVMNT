// Anchor adjustment logic extracted from interactionMath.ts

import { AnchorAdjustParams } from './types';
import { applyRSK } from './transformHelpers';

/** Adjust offsets when the anchor (pivot) moves to keep visual position stable. */
export function computeAnchorAdjustment(anchorX: number, anchorY: number, p: AnchorAdjustParams) {
    const {
        baseBounds,
        origAnchorX,
        origAnchorY,
        origOffsetX,
        origOffsetY,
        origRotation,
        origSkewX,
        origSkewY,
        origScaleX,
        origScaleY,
    } = p;
    if (!baseBounds) return { newOffsetX: origOffsetX, newOffsetY: origOffsetY };
    const oldAnchorLocal = {
        x: baseBounds.x + baseBounds.width * origAnchorX,
        y: baseBounds.y + baseBounds.height * origAnchorY,
    };
    const newAnchorLocal = {
        x: baseBounds.x + baseBounds.width * anchorX,
        y: baseBounds.y + baseBounds.height * anchorY,
    };
    const deltaLocal = { x: newAnchorLocal.x - oldAnchorLocal.x, y: newAnchorLocal.y - oldAnchorLocal.y };
    const adjust = applyRSK(deltaLocal.x, deltaLocal.y, origRotation, origSkewX, origSkewY, origScaleX, origScaleY);
    return { newOffsetX: origOffsetX + adjust.x, newOffsetY: origOffsetY + adjust.y };
}
