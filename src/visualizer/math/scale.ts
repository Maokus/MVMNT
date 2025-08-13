// Scaling logic with anchor preservation.

import { applyRSK } from './transformHelpers';
import { ScaleComputationParams, ScaleResult } from './types';

/** Compute new scale (and resulting offset) given a drag on a scale handle. */
export function computeScaledTransform(
    mouseX: number,
    mouseY: number,
    p: ScaleComputationParams,
    shiftKey: boolean
): ScaleResult | null {
    const {
        geom,
        mode,
        origScaleX,
        origScaleY,
        baseBounds,
        fixedWorldPoint,
        origRotation,
        origSkewX,
        origSkewY,
        origAnchorX,
        origAnchorY,
    } = p;
    if (!geom || !fixedWorldPoint || !baseBounds) return null;
    const { widthVec, heightVec } = geom;
    const { x: wvx, y: wvy } = widthVec;
    const { x: hvx, y: hvy } = heightVec;
    const det = wvx * hvy - wvy * hvx;
    const dragWorld = { x: mouseX, y: mouseY };
    const dWorld = { x: dragWorld.x - fixedWorldPoint.x, y: dragWorld.y - fixedWorldPoint.y };
    let newScaleX = origScaleX;
    let newScaleY = origScaleY;

    if (Math.abs(det) > 1e-6) {
        if (mode === 'scale-se' || mode === 'scale-ne' || mode === 'scale-sw' || mode === 'scale-nw') {
            const cornersOrdered = [geom.corners.TL, geom.corners.TR, geom.corners.BR, geom.corners.BL];
            const cornerNames = ['TL', 'TR', 'BR', 'BL'];
            // Find fixed corner index by identity or distance fallback.
            let idxFixed = cornerNames.findIndex((n) => (geom.corners as any)[n] === fixedWorldPoint); // eslint-disable-line @typescript-eslint/no-explicit-any
            if (idxFixed === -1) {
                let bestI = 0;
                let bestD = Infinity;
                cornersOrdered.forEach((c, i) => {
                    const dxF = c.x - fixedWorldPoint.x;
                    const dyF = c.y - fixedWorldPoint.y;
                    const dist = dxF * dxF + dyF * dyF;
                    if (dist < bestD) {
                        bestD = dist;
                        bestI = i;
                    }
                });
                idxFixed = bestI;
            }
            const rot = (arr: any[], k: number) => arr.slice(k).concat(arr.slice(0, k)); // eslint-disable-line @typescript-eslint/no-explicit-any
            const rc = rot(cornersOrdered, idxFixed);
            const basisW = { x: rc[1].x - rc[0].x, y: rc[1].y - rc[0].y };
            const basisH = { x: rc[3].x - rc[0].x, y: rc[3].y - rc[0].y };
            const det2 = basisW.x * basisH.y - basisW.y * basisH.x;
            if (Math.abs(det2) > 1e-6) {
                let a = (dWorld.x * basisH.y - dWorld.y * basisH.x) / det2;
                let b = (basisW.x * dWorld.y - basisW.y * dWorld.x) / det2;
                if (mode === 'scale-ne' || mode === 'scale-sw') {
                    const tmp = a;
                    a = b;
                    b = tmp;
                }
                a = Math.abs(a);
                b = Math.abs(b);
                newScaleX = Math.max(0.01, origScaleX * a);
                newScaleY = Math.max(0.01, origScaleY * b);
            }
        } else if (mode === 'scale-e' || mode === 'scale-w') {
            const len2 = wvx * wvx + wvy * wvy || 1;
            let a = (dWorld.x * wvx + dWorld.y * wvy) / len2;
            if (mode === 'scale-w') a = -a;
            a = Math.abs(a);
            newScaleX = Math.max(0.01, origScaleX * a);
        } else if (mode === 'scale-n' || mode === 'scale-s') {
            const len2 = hvx * hvx + hvy * hvy || 1;
            let b = (dWorld.x * hvx + dWorld.y * hvy) / len2;
            if (mode === 'scale-n') b = -b;
            b = Math.abs(b);
            newScaleY = Math.max(0.01, origScaleY * b);
        }
    }

    // Uniform scaling with Shift: choose dominant change factor.
    if (shiftKey) {
        const ratioX = newScaleX / (origScaleX || 1);
        const ratioY = newScaleY / (origScaleY || 1);
        let factor = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
        if (!isFinite(factor) || factor <= 0) factor = 1;
        newScaleX = Math.max(0.01, (origScaleX || 1) * factor);
        newScaleY = Math.max(0.01, (origScaleY || 1) * factor);
    }

    // Reconstruct new offset so that the fixed world point remains invariant under the new transform.
    const relFixed = {
        x: baseBounds.width / 2 - 2 * origAnchorX * baseBounds.width,
        y: -(baseBounds.height / 2 - 2 * origAnchorY * baseBounds.height),
    };
    const qFixed = applyRSK(relFixed.x, relFixed.y, origRotation, origSkewX, origSkewY, newScaleX, newScaleY);
    const newOffsetX = fixedWorldPoint.x - qFixed.x;
    const newOffsetY = fixedWorldPoint.y - qFixed.y;
    return { newScaleX, newScaleY, newOffsetX, newOffsetY };
}
