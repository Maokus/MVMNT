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
            // --- Corner scaling ---
            // Previous implementation projected the drag delta onto the original (widthVec, heightVec) basis and
            // treated the resulting coefficients as independent scale factors. Under skew this is not exact because
            // the skew couples the X/Y edge directions: the vertical component of the width edge depends on scaleY
            // (through skewY) while the horizontal component of the height edge depends on scaleX (through skewX).
            // This caused the dragged handle to drift away from the cursor when skew was present: the solved scale
            // factors produced a corner position different from the mouse position.
            //
            // We fix this by solving the exact linear system for the corner vector with skew coupling.
            // For a vector (Δx, Δy) from the fixed corner to the dragged corner in *unscaled* local space, after
            // applying skew (x' = x + kx*y, y' = ky*x + y), then scale (sx, sy), then rotation θ, we obtain world delta:
            // X = cosθ * ( (Δx + kx*Δy) * sx ) - sinθ * ( (ky*Δx + Δy) * sy )
            // Y = sinθ * ( (Δx + kx*Δy) * sx ) + cosθ * ( (ky*Δx + Δy) * sy )
            // Let A = (Δx + kx*Δy), B = (ky*Δx + Δy). Solving the 2x2 system gives:
            //   sx = (cosθ*X + sinθ*Y) / A
            //   sy = (cosθ*Y - sinθ*X) / B
            // (Determinant simplifies to A*B.)
            // We only use this exact solution when skew is non-zero; otherwise we retain the original projection
            // method (slightly more numerically forgiving for axis-aligned/rotated rectangles).
            if (origSkewX !== 0 || origSkewY !== 0) {
                const width = baseBounds.width || 0;
                const height = baseBounds.height || 0;
                // Determine local delta from fixed to dragged corner based on handle mode (dragged corner indicated by mode)
                let dx = 0;
                let dy = 0;
                switch (mode) {
                    case 'scale-se': // fixed NW
                        dx = width;
                        dy = height;
                        break;
                    case 'scale-nw': // fixed SE
                        dx = -width;
                        dy = -height;
                        break;
                    case 'scale-ne': // fixed SW
                        dx = width;
                        dy = -height;
                        break;
                    case 'scale-sw': // fixed NE
                        dx = -width;
                        dy = height;
                        break;
                }
                const kx = Math.tan(origSkewX);
                const ky = Math.tan(origSkewY);
                const A = dx + kx * dy;
                const B = ky * dx + dy;
                const cos = Math.cos(origRotation);
                const sin = Math.sin(origRotation);
                const X = dWorld.x;
                const Y = dWorld.y;
                if (Math.abs(A) > 1e-8 && Math.abs(B) > 1e-8) {
                    const sxExact = (cos * X + sin * Y) / A;
                    const syExact = (cos * Y - sin * X) / B;
                    if (isFinite(sxExact) && isFinite(syExact)) {
                        const clampSigned = (v: number) => {
                            const mag = Math.abs(v);
                            if (mag < 0.01) return v < 0 ? -0.01 : 0.01;
                            return v;
                        };
                        newScaleX = clampSigned(sxExact);
                        newScaleY = clampSigned(syExact);
                        // Skip legacy projection path
                    } else {
                        // fallback to legacy method below if not finite
                    }
                }
            }
            // Only run legacy projection method if corner scales were not recomputed above (i.e., skew==0 or fallback)
            if (newScaleX === origScaleX && newScaleY === origScaleY) {
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
                    const clampSigned = (v: number) => {
                        const mag = Math.abs(v);
                        if (mag < 0.01) return v < 0 ? -0.01 : 0.01;
                        return v;
                    };
                    newScaleX = clampSigned(origScaleX * a);
                    newScaleY = clampSigned(origScaleY * b);
                }
            }
        } else if (mode === 'scale-e' || mode === 'scale-w') {
            const len2 = wvx * wvx + wvy * wvy || 1;
            let a = (dWorld.x * wvx + dWorld.y * wvy) / len2;
            if (mode === 'scale-w') a = -a;
            const clampSigned = (v: number) => {
                const mag = Math.abs(v);
                if (mag < 0.01) return v < 0 ? -0.01 : 0.01;
                return v;
            };
            newScaleX = clampSigned(origScaleX * a);
        } else if (mode === 'scale-n' || mode === 'scale-s') {
            const len2 = hvx * hvx + hvy * hvy || 1;
            let b = (dWorld.x * hvx + dWorld.y * hvy) / len2;
            if (mode === 'scale-n') b = -b;
            const clampSigned = (v: number) => {
                const mag = Math.abs(v);
                if (mag < 0.01) return v < 0 ? -0.01 : 0.01;
                return v;
            };
            newScaleY = clampSigned(origScaleY * b);
        }
    }

    // Uniform scaling with Shift: choose dominant change factor.
    if (shiftKey) {
        const ratioX = newScaleX / (origScaleX || 1);
        const ratioY = newScaleY / (origScaleY || 1);
        let factor = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
        if (!isFinite(factor) || Math.abs(factor) <= 0) factor = 1;
        const clampSigned = (v: number) => {
            const mag = Math.abs(v);
            if (mag < 0.01) return v < 0 ? -0.01 : 0.01;
            return v;
        };
        newScaleX = clampSigned((origScaleX || 1) * factor);
        newScaleY = clampSigned((origScaleY || 1) * factor);
    }

    // Reconstruct new offset so that the fixed world point remains invariant under the new transform.
    // --- Offset reconstruction ---
    // We know: worldPoint = offset + RSK(localPoint - anchorLocal).
    // For the chosen fixedWorldPoint we want it to remain invariant after re-scaling.
    // Let F be fixed world point, A be anchor world point we seek, vLocal = (anchorLocal - fixedLocal) in *unscaled* local pixels.
    // Then A = F + RSK_new(vLocal).
    // We derive fixedLocal by projecting F onto the (widthVec, heightVec) basis defined by current geometry.
    // widthVec maps local +X (pixels) and heightVec maps local +Y (pixels) after original RSK + translation.
    // Solve (F - TL) = u*widthVec + v*heightVec, where u,v are normalized (0..1 for points inside the rect).
    const TL = geom.corners.TL;
    const dxF = fixedWorldPoint.x - TL.x;
    const dyF = fixedWorldPoint.y - TL.y;
    let uFixed = 0.5;
    let vFixed = 0.5;
    if (Math.abs(det) > 1e-6) {
        uFixed = (dxF * hvy - dyF * hvx) / det; // coefficient along widthVec
        vFixed = (wvx * dyF - wvy * dxF) / det; // coefficient along heightVec
    }
    // Local anchor (normalized)
    const uAnchor = origAnchorX;
    const vAnchor = origAnchorY;
    // Local pixel delta from fixed point to anchor (pre-scale, pre-rotation/skew)
    const vLocal = {
        x: (uAnchor - uFixed) * baseBounds.width,
        y: (vAnchor - vFixed) * baseBounds.height,
    };
    const vWorldNew = applyRSK(vLocal.x, vLocal.y, origRotation, origSkewX, origSkewY, newScaleX, newScaleY);
    const newOffsetX = fixedWorldPoint.x + vWorldNew.x;
    const newOffsetY = fixedWorldPoint.y + vWorldNew.y;
    return { newScaleX, newScaleY, newOffsetX, newOffsetY };
}
