// Anchor adjustment logic extracted from interactionMath.ts

import { AnchorAdjustParams } from './types';
import { applyRSK } from './transformHelpers';

/** Adjust offsets when the anchor (pivot) moves to keep visual position stable. */
// Contract:
// Inputs: target anchor (normalized) the user is dragging to, original transform components & base bounds.
// Output: new anchor (possibly snapped if shiftKey) + offset that keeps the anchor's world position fixed
// and preserves existing behaviour when skew is zero. Under skew we must use full RSK mapping.
export function computeAnchorAdjustment(mouseX: number, mouseY: number, p: AnchorAdjustParams, shiftKey: boolean) {
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
    if (!baseBounds) {
        return {
            newAnchorX: origAnchorX,
            newAnchorY: origAnchorY,
            newOffsetX: origOffsetX,
            newOffsetY: origOffsetY,
        };
    }

    // --- Derive local (untransformed) coordinates under full RSK from mouse world coords ---
    // Inverse of: world = offset + R * S * K (local)
    const cos = Math.cos(origRotation);
    const sin = Math.sin(origRotation);
    const kx = Math.tan(origSkewX);
    const ky = Math.tan(origSkewY);

    // Translate to rotation/scale/skew space (remove offset)
    const wx = mouseX - origOffsetX;
    const wy = mouseY - origOffsetY;
    // Inverse rotation
    const sx = cos * wx + sin * wy; // (R^-1) * w  -> (scale+skew space)
    const sy = -sin * wx + cos * wy;
    // Inverse scale
    const kxVy = sx / (origScaleX || 1); // avoid div 0
    const kyVx = sy / (origScaleY || 1);
    // Solve for vx, vy from:
    // kxVy = vx + kx * vy
    // kyVx = ky * vx + vy
    let denom = 1 - ky * kx;
    if (Math.abs(denom) < 1e-8) denom = denom >= 0 ? 1e-8 : -1e-8; // guard near singular
    const vy = (kyVx - ky * kxVy) / denom;
    const vx = kxVy - kx * vy;

    // Normalize into raw anchor fractions relative to baseBounds
    let anchorX = (vx - baseBounds.x) / (baseBounds.width || 1);
    let anchorY = (vy - baseBounds.y) / (baseBounds.height || 1);

    // Clamp
    anchorX = Math.max(0, Math.min(1, anchorX));
    anchorY = Math.max(0, Math.min(1, anchorY));

    // Optional snapping identical to previous logic (9-point grid) when shift held.
    if (shiftKey) {
        const candidates = [0, 0.5, 1];
        let best = { ax: anchorX, ay: anchorY, d: Infinity };
        for (const ax of candidates) {
            for (const ay of candidates) {
                const dx = ax - anchorX;
                const dy = ay - anchorY;
                const d2 = dx * dx + dy * dy;
                if (d2 < best.d) best = { ax, ay, d: d2 };
            }
        }
        anchorX = best.ax;
        anchorY = best.ay;
    }

    // We want the old anchor world position to remain constant while we change to (anchorX, anchorY).
    // Original approach: compute local delta and pass through applyRSK. That remains valid even with skew,
    // since applyRSK composes Skew->Scale->Rotation on a *vector* (translation handled by offset).
    const oldAnchorLocal = {
        x: baseBounds.x + baseBounds.width * origAnchorX,
        y: baseBounds.y + baseBounds.height * origAnchorY,
    };
    const newAnchorLocal = {
        x: baseBounds.x + baseBounds.width * anchorX,
        y: baseBounds.y + baseBounds.height * anchorY,
    };
    const deltaLocal = { x: newAnchorLocal.x - oldAnchorLocal.x, y: newAnchorLocal.y - oldAnchorLocal.y };
    // Transform delta through full RSK (scale & skew & rotation) to world space then add to offset so visual anchor stays put.
    const adjust = applyRSK(deltaLocal.x, deltaLocal.y, origRotation, origSkewX, origSkewY, origScaleX, origScaleY);
    const newOffsetX = origOffsetX + adjust.x;
    const newOffsetY = origOffsetY + adjust.y;
    return { newAnchorX: anchorX, newAnchorY: anchorY, newOffsetX, newOffsetY };
}
