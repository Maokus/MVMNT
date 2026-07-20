// Anchor adjustment & transform interaction utilities (moved from math/transforms)

import { AnchorAdjustParams, ScaleComputationParams, ScaleResult } from '@math/transforms/types';
import { applyRSK, clampSignedScale, clamp01, snapToGrid2D, sincos } from '@math/transforms/numeric';
import {
    createHomography,
    invertAffineTransform,
    invertHomography,
    applyAffinePoint,
    unwarpLocalPoint,
    warpLocalPoint,
} from '@math/perspective-warp';

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
        warp,
    } = p;
    if (!baseBounds) {
        return {
            newAnchorX: origAnchorX,
            newAnchorY: origAnchorY,
            newOffsetX: origOffsetX,
            newOffsetY: origOffsetY,
        };
    }
    const oldAnchorLocal = {
        x: baseBounds.x + baseBounds.width * origAnchorX,
        y: baseBounds.y + baseBounds.height * origAnchorY,
    };
    const warpMatrix = warp ? createHomography(warp) : null;
    const affine = {
        a: Math.cos(origRotation) * origScaleX - Math.sin(origRotation) * Math.tan(origSkewY) * origScaleY,
        b: Math.sin(origRotation) * origScaleX + Math.cos(origRotation) * Math.tan(origSkewY) * origScaleY,
        c: Math.cos(origRotation) * Math.tan(origSkewX) * origScaleX - Math.sin(origRotation) * origScaleY,
        d: Math.sin(origRotation) * Math.tan(origSkewX) * origScaleX + Math.cos(origRotation) * origScaleY,
        e: origOffsetX,
        f: origOffsetY,
    };
    // The affine translation maps the (possibly warped) origin to offset.
    const oldOrigin = warpMatrix ? warpLocalPoint(warpMatrix, baseBounds, oldAnchorLocal) : oldAnchorLocal;
    const affineWithOrigin = {
        ...affine,
        e: origOffsetX - (affine.a * (oldOrigin?.x ?? 0) + affine.c * (oldOrigin?.y ?? 0)),
        f: origOffsetY - (affine.b * (oldOrigin?.x ?? 0) + affine.d * (oldOrigin?.y ?? 0)),
    };
    const inverse = invertAffineTransform(affineWithOrigin);
    const localPointer = inverse ? applyAffinePoint(inverse, { x: mouseX, y: mouseY }) : null;
    const inverseWarp = warpMatrix ? invertHomography(warpMatrix) : null;
    const unwarpedPointer = inverseWarp && localPointer ? unwarpLocalPoint(inverseWarp, baseBounds, localPointer) : localPointer;
    const pointerLocal = unwarpedPointer ?? oldAnchorLocal;
    let anchorX = clamp01((pointerLocal.x - baseBounds.x) / (baseBounds.width || 1));
    let anchorY = clamp01((pointerLocal.y - baseBounds.y) / (baseBounds.height || 1));
    if (shiftKey) {
        const snapped = snapToGrid2D(anchorX, anchorY, [0, 0.5, 1]);
        anchorX = snapped.x;
        anchorY = snapped.y;
    }
    const newAnchorLocal = {
        x: baseBounds.x + baseBounds.width * anchorX,
        y: baseBounds.y + baseBounds.height * anchorY,
    };
    const newOrigin = warpMatrix ? warpLocalPoint(warpMatrix, baseBounds, newAnchorLocal) : newAnchorLocal;
    const deltaLocal = {
        x: (newOrigin?.x ?? newAnchorLocal.x) - (oldOrigin?.x ?? oldAnchorLocal.x),
        y: (newOrigin?.y ?? newAnchorLocal.y) - (oldOrigin?.y ?? oldAnchorLocal.y),
    };
    const adjust = applyRSK(deltaLocal.x, deltaLocal.y, origRotation, origSkewX, origSkewY, origScaleX, origScaleY);
    const newOffsetX = origOffsetX + adjust.x;
    const newOffsetY = origOffsetY + adjust.y;
    return { newAnchorX: anchorX, newAnchorY: anchorY, newOffsetX, newOffsetY };
}

const ROTATION_SNAP_INCREMENT_DEG = 15;
const ROTATION_SNAP_INCREMENT_RAD = (ROTATION_SNAP_INCREMENT_DEG * Math.PI) / 180;

export function computeRotation(mouseX: number, mouseY: number, p: any, shiftKey: boolean): number {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    let centerX = p.bounds.x + p.bounds.width * p.origAnchorX;
    let centerY = p.bounds.y + p.bounds.height * p.origAnchorY;
    if (p.anchorWorld) {
        centerX = p.anchorWorld.x;
        centerY = p.anchorWorld.y;
    } else if (p.corners && p.corners.length === 4) {
        const interp = (a: number, b: number, t: number) => a + (b - a) * t;
        const top = {
            x: interp(p.corners[0].x, p.corners[1].x, p.origAnchorX),
            y: interp(p.corners[0].y, p.corners[1].y, p.origAnchorX),
        };
        const bottom = {
            x: interp(p.corners[3].x, p.corners[2].x, p.origAnchorX),
            y: interp(p.corners[3].y, p.corners[2].y, p.origAnchorX),
        };
        const anchorPt = { x: interp(top.x, bottom.x, p.origAnchorY), y: interp(top.y, bottom.y, p.origAnchorY) };
        centerX = anchorPt.x;
        centerY = anchorPt.y;
    }
    const startAngleRad = Math.atan2(p.startY - centerY, p.startX - centerX);
    const currentAngleRad = Math.atan2(mouseY - centerY, mouseX - centerX);
    // Keep the drag delta on the shortest arc so crossing the -π/π seam does
    // not produce a visually equivalent but numerically huge rotation.
    const deltaRad = Math.atan2(Math.sin(currentAngleRad - startAngleRad), Math.cos(currentAngleRad - startAngleRad));
    let newRotationRad = (p.origRotation || 0) + deltaRad;
    if (shiftKey) {
        newRotationRad = Math.round(newRotationRad / ROTATION_SNAP_INCREMENT_RAD) * ROTATION_SNAP_INCREMENT_RAD;
    }
    return newRotationRad;
}

export function computeScaledTransform(
    mouseX: number,
    mouseY: number,
    p: ScaleComputationParams,
    shiftKey: boolean,
    altKey = false
): ScaleResult | null {
    const {
        geom,
        mode,
        origScaleX,
        origScaleY,
        baseBounds,
        fixedWorldPoint,
        fixedLocalPoint,
        dragLocalPoint,
        centerWorldPoint,
        centerLocalPoint,
        origRotation,
        origSkewX,
        origSkewY,
        origAnchorX,
        origAnchorY,
        warp,
    } = p;
    if (!geom || !fixedWorldPoint || !baseBounds) return null;
    const warpMatrix = warp ? createHomography(warp) : null;
    // A perspective warp bends the element edges, so the displayed handle
    // positions are not an affine basis. Solve scale from the source points
    // after warping instead of decomposing the projected quadrilateral.
    if (warpMatrix && dragLocalPoint && fixedLocalPoint) {
        const warpedFixed = warpLocalPoint(warpMatrix, baseBounds, fixedLocalPoint);
        const warpedDrag = warpLocalPoint(warpMatrix, baseBounds, dragLocalPoint);
        const anchorSource = {
            x: baseBounds.x + baseBounds.width * origAnchorX,
            y: baseBounds.y + baseBounds.height * origAnchorY,
        };
        const warpedAnchor = warpLocalPoint(warpMatrix, baseBounds, anchorSource);
        if (warpedFixed && warpedDrag && warpedAnchor) {
            const dx = warpedDrag.x - warpedFixed.x;
            const dy = warpedDrag.y - warpedFixed.y;
            const { cos, sin } = sincos(origRotation);
            const worldDx = mouseX - fixedWorldPoint.x;
            const worldDy = mouseY - fixedWorldPoint.y;
            const localX = cos * worldDx + sin * worldDy;
            const localY = -sin * worldDx + cos * worldDy;
            const xBasis = dx + Math.tan(origSkewX) * dy;
            const yBasis = Math.tan(origSkewY) * dx + dy;
            let newScaleX = origScaleX;
            let newScaleY = origScaleY;
            if (mode !== 'scale-n' && mode !== 'scale-s' && Math.abs(xBasis) > 1e-8) {
                newScaleX = clampSignedScale(localX / xBasis);
            }
            if (mode !== 'scale-e' && mode !== 'scale-w' && Math.abs(yBasis) > 1e-8) {
                newScaleY = clampSignedScale(localY / yBasis);
            }
            if (shiftKey) {
                const ratioX = newScaleX / (origScaleX || 1);
                const ratioY = newScaleY / (origScaleY || 1);
                const factor = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
                newScaleX = clampSignedScale((origScaleX || 1) * factor);
                newScaleY = clampSignedScale((origScaleY || 1) * factor);
            }
            const originDelta = { x: warpedAnchor.x - warpedFixed.x, y: warpedAnchor.y - warpedFixed.y };
            const offsetDelta = applyRSK(
                originDelta.x,
                originDelta.y,
                origRotation,
                origSkewX,
                origSkewY,
                newScaleX,
                newScaleY
            );
            return {
                newScaleX,
                newScaleY,
                newOffsetX: fixedWorldPoint.x + offsetDelta.x,
                newOffsetY: fixedWorldPoint.y + offsetDelta.y,
            };
        }
    }
    if (
        altKey &&
        centerWorldPoint &&
        centerLocalPoint &&
        dragLocalPoint &&
        (Math.abs(dragLocalPoint.x - centerLocalPoint.x) > 1e-6 ||
            Math.abs(dragLocalPoint.y - centerLocalPoint.y) > 1e-6)
    ) {
        const desiredVec = { x: mouseX - centerWorldPoint.x, y: mouseY - centerWorldPoint.y };
        const dragVecLocal = {
            x: dragLocalPoint.x - centerLocalPoint.x,
            y: dragLocalPoint.y - centerLocalPoint.y,
        };
        const kx = Math.tan(origSkewX || 0);
        const ky = Math.tan(origSkewY || 0);
        const kxVy = dragVecLocal.x + kx * dragVecLocal.y;
        const kyVx = ky * dragVecLocal.x + dragVecLocal.y;
        const { cos, sin } = sincos(origRotation || 0);
        const a = cos * kxVy;
        const b = -sin * kyVx;
        const c = sin * kxVy;
        const d = cos * kyVx;
        const detCenter = a * d - b * c;
        if (isFinite(detCenter) && Math.abs(detCenter) >= 1e-6) {
            let newScaleX = (desiredVec.x * d - desiredVec.y * b) / detCenter;
            let newScaleY = (-desiredVec.x * c + desiredVec.y * a) / detCenter;
            newScaleX = clampSignedScale(newScaleX);
            newScaleY = clampSignedScale(newScaleY);
            if (shiftKey) {
                const ratioX = newScaleX / (origScaleX || 1);
                const ratioY = newScaleY / (origScaleY || 1);
                let factor = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
                if (!isFinite(factor) || Math.abs(factor) <= 0) factor = 1;
                newScaleX = clampSignedScale((origScaleX || 1) * factor);
                newScaleY = clampSignedScale((origScaleY || 1) * factor);
            }
            const anchorLocal = {
                x: baseBounds.x + baseBounds.width * (origAnchorX ?? 0.5),
                y: baseBounds.y + baseBounds.height * (origAnchorY ?? 0.5),
            };
            const deltaLocal = {
                x: centerLocalPoint.x - anchorLocal.x,
                y: centerLocalPoint.y - anchorLocal.y,
            };
            const anchorOffset = applyRSK(
                deltaLocal.x,
                deltaLocal.y,
                origRotation || 0,
                origSkewX || 0,
                origSkewY || 0,
                newScaleX,
                newScaleY
            );
            const newOffsetX = centerWorldPoint.x - anchorOffset.x;
            const newOffsetY = centerWorldPoint.y - anchorOffset.y;
            return { newScaleX, newScaleY, newOffsetX, newOffsetY };
        }
    }
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
            if (origSkewX !== 0 || origSkewY !== 0) {
                const width = baseBounds.width || 0;
                const height = baseBounds.height || 0;
                let dx = 0;
                let dy = 0;
                switch (mode) {
                    case 'scale-se':
                        dx = width;
                        dy = height;
                        break;
                    case 'scale-nw':
                        dx = -width;
                        dy = -height;
                        break;
                    case 'scale-ne':
                        dx = width;
                        dy = -height;
                        break;
                    case 'scale-sw':
                        dx = -width;
                        dy = height;
                        break;
                }
                const kx = Math.tan(origSkewX);
                const ky = Math.tan(origSkewY);
                const A = dx + kx * dy;
                const B = ky * dx + dy;
                const { cos, sin } = sincos(origRotation);
                const { x: X, y: Y } = dWorld;
                if (Math.abs(A) > 1e-8 && Math.abs(B) > 1e-8) {
                    const sxExact = (cos * X + sin * Y) / A;
                    const syExact = (cos * Y - sin * X) / B;
                    if (isFinite(sxExact) && isFinite(syExact)) {
                        newScaleX = clampSignedScale(sxExact);
                        newScaleY = clampSignedScale(syExact);
                    } else {
                        // fallback path
                    }
                }
            }
            if (newScaleX === origScaleX && newScaleY === origScaleY) {
                const cornersOrdered = [geom.corners.TL, geom.corners.TR, geom.corners.BR, geom.corners.BL];
                const cornerNames = ['TL', 'TR', 'BR', 'BL'];
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
                    newScaleX = clampSignedScale(origScaleX * a);
                    newScaleY = clampSignedScale(origScaleY * b);
                }
            }
        } else if (mode === 'scale-e' || mode === 'scale-w') {
            const len2 = wvx * wvx + wvy * wvy || 1;
            let a = (dWorld.x * wvx + dWorld.y * wvy) / len2;
            if (mode === 'scale-w') a = -a;
            newScaleX = clampSignedScale(origScaleX * a);
        } else if (mode === 'scale-n' || mode === 'scale-s') {
            const len2 = hvx * hvx + hvy * hvy || 1;
            let b = (dWorld.x * hvx + dWorld.y * hvy) / len2;
            if (mode === 'scale-n') b = -b;
            newScaleY = clampSignedScale(origScaleY * b);
        }
    }
    if (shiftKey) {
        const ratioX = newScaleX / (origScaleX || 1);
        const ratioY = newScaleY / (origScaleY || 1);
        let factor = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
        if (!isFinite(factor) || Math.abs(factor) <= 0) factor = 1;
        newScaleX = clampSignedScale((origScaleX || 1) * factor);
        newScaleY = clampSignedScale((origScaleY || 1) * factor);
    }
    const TL = geom.corners.TL;
    const dxF = fixedWorldPoint.x - TL.x;
    const dyF = fixedWorldPoint.y - TL.y;
    let uFixed = 0.5;
    let vFixed = 0.5;
    if (Math.abs(det) > 1e-6) {
        uFixed = (dxF * hvy - dyF * hvx) / det;
        vFixed = (wvx * dyF - wvy * dxF) / det;
    }
    const uAnchor = origAnchorX;
    const vAnchor = origAnchorY;
    const vLocal = {
        x: (uAnchor - uFixed) * baseBounds.width,
        y: (vAnchor - vFixed) * baseBounds.height,
    };
    const vWorldNew = applyRSK(vLocal.x, vLocal.y, origRotation, origSkewX, origSkewY, newScaleX, newScaleY);
    const newOffsetX = fixedWorldPoint.x + vWorldNew.x;
    const newOffsetY = fixedWorldPoint.y + vWorldNew.y;
    return { newScaleX, newScaleY, newOffsetX, newOffsetY };
}
