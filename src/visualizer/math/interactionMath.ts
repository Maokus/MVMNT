// Centralized math utilities extracted from PreviewPanel drag/interaction code.
// These functions are pure and should not modify external state.

export interface Point {
    x: number;
    y: number;
}
export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
}
export interface CornerRecord {
    corners: Point[];
    bounds: Bounds;
    id?: string;
    element?: any;
    baseBounds?: Bounds;
}

export interface GeometryInfo {
    widthVec: Point;
    heightVec: Point;
    corners: { TL: Point; TR: Point; BR: Point; BL: Point };
    mids: { MTop: Point; MRight: Point; MBottom: Point; MLeft: Point };
    baseBounds: Bounds | null;
}

export const pointInPolygon = (ptX: number, ptY: number, corners: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
        const xi = corners[i].x,
            yi = corners[i].y;
        const xj = corners[j].x,
            yj = corners[j].y;
        //prettier-ignore
        const intersect = ((yi > ptY) !== (yj > ptY)) && (ptX < (((xj - xi) * (ptY - yi)) / ((yj - yi) + 1e-9) + xi));
        if (intersect) inside = !inside;
    }
    return inside;
};

export function buildGeometry(rec: any): GeometryInfo | null {
    if (!rec || !rec.corners || rec.corners.length !== 4) return null;
    const [TL, TR, BR, BL] = rec.corners;
    const widthVec = { x: TR.x - TL.x, y: TR.y - TL.y };
    const heightVec = { x: BL.x - TL.x, y: BL.y - TL.y };
    const mid = (p: Point, q: Point) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const MTop = mid(TL, TR);
    const MRight = mid(TR, BR);
    const MBottom = mid(BR, BL);
    const MLeft = mid(BL, TL);
    return {
        widthVec,
        heightVec,
        corners: { TL, TR, BR, BL },
        mids: { MTop, MRight, MBottom, MLeft },
        baseBounds: rec.baseBounds || null,
    };
}

export function localPointFor(tag: string, bb: Bounds | null): Point {
    // maps handle tags to local coordinates
    if (!bb) return { x: 0, y: 0 };
    let { x, y, width: w, height: h } = bb;
    switch (tag) {
        case 'TL':
            return { x, y };
        case 'TR':
            return { x: x + w, y };
        case 'BR':
            return { x: x + w, y: y + h };
        case 'BL':
            return { x, y: y + h };
        case 'MTop':
            return { x: x + w / 2, y };
        case 'MRight':
            return { x: x + w, y: y + h / 2 };
        case 'MBottom':
            return { x: x + w / 2, y: y + h };
        case 'MLeft':
            return { x, y: y + h / 2 };
        default:
            return { x: 0, y: 0 };
    }
}

export interface ScaleComputationParams {
    mode: string;
    origScaleX: number;
    origScaleY: number;
    baseBounds: Bounds;
    fixedWorldPoint: Point;
    fixedLocalPoint: Point;
    dragLocalPoint: Point;
    geom: GeometryInfo;
    origRotation: number;
    origSkewX: number;
    origSkewY: number;
    origAnchorX: number;
    origAnchorY: number;
}

export interface ScaleResult {
    newScaleX: number;
    newScaleY: number;
    newOffsetX: number;
    newOffsetY: number;
}

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
    const widthVec = geom.widthVec;
    const heightVec = geom.heightVec;
    const wvx = widthVec.x;
    const wvy = widthVec.y;
    const hvx = heightVec.x;
    const hvy = heightVec.y;
    const det = wvx * hvy - wvy * hvx;
    const dragWorld = { x: mouseX, y: mouseY };
    const dWorld = { x: dragWorld.x - fixedWorldPoint.x, y: dragWorld.y - fixedWorldPoint.y };
    let newScaleX = origScaleX;
    let newScaleY = origScaleY;
    if (Math.abs(det) > 1e-6) {
        if (mode === 'scale-se' || mode === 'scale-ne' || mode === 'scale-sw' || mode === 'scale-nw') {
            const cornersOrdered = [geom.corners.TL, geom.corners.TR, geom.corners.BR, geom.corners.BL];
            const cornerNames = ['TL', 'TR', 'BR', 'BL'];
            let idxFixed = cornerNames.findIndex((n) => (geom.corners as any)[n] === fixedWorldPoint);
            if (idxFixed === -1) {
                // distance fallback
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
            const rot = (arr: any[], k: number) => arr.slice(k).concat(arr.slice(0, k));
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
        } else {
            if (mode === 'scale-e' || mode === 'scale-w') {
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
    }
    if (shiftKey) {
        // uniform scaling
        const ratioX = newScaleX / (origScaleX || 1);
        const ratioY = newScaleY / (origScaleY || 1);
        let factor = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
        if (!isFinite(factor) || factor <= 0) factor = 1;
        newScaleX = Math.max(0.01, (origScaleX || 1) * factor);
        newScaleY = Math.max(0.01, (origScaleY || 1) * factor);
    }
    const applyRSK = (vx: number, vy: number) => {
        const kx = Math.tan(origSkewX);
        const ky = Math.tan(origSkewY);
        const kxVy = vx + kx * vy;
        const kyVx = ky * vx + vy;
        const sx = kxVy * newScaleX;
        const sy = kyVx * newScaleY;
        const cos = Math.cos(origRotation);
        const sin = Math.sin(origRotation);
        return { x: cos * sx - sin * sy, y: sin * sx + cos * sy };
    };
    const relFixed = {
        x: baseBounds.width / 2 - 2 * origAnchorX * baseBounds.width,
        y: -(baseBounds.height / 2 - 2 * origAnchorY * baseBounds.height),
    };
    const qFixed = applyRSK(relFixed.x, relFixed.y);
    const newOffsetX = fixedWorldPoint.x - qFixed.x;
    const newOffsetY = fixedWorldPoint.y - qFixed.y;
    return { newScaleX, newScaleY, newOffsetX, newOffsetY };
}

export interface AnchorAdjustParams {
    origOffsetX: number;
    origOffsetY: number;
    origAnchorX: number;
    origAnchorY: number;
    origRotation: number;
    origSkewX: number;
    origSkewY: number;
    origScaleX: number;
    origScaleY: number;
    baseBounds: Bounds | null;
}

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
    const applyRSK = (vx: number, vy: number) => {
        const kx = Math.tan(origSkewX);
        const ky = Math.tan(origSkewY);
        const kxVy = vx + kx * vy;
        const kyVx = ky * vx + vy;
        const sx = kxVy * origScaleX;
        const sy = kyVx * origScaleY;
        const cos = Math.cos(origRotation);
        const sin = Math.sin(origRotation);
        return { x: cos * sx - sin * sy, y: sin * sx + cos * sy };
    };
    const adjust = applyRSK(deltaLocal.x, deltaLocal.y);
    return { newOffsetX: origOffsetX + adjust.x, newOffsetY: origOffsetY + adjust.y };
}

export function computeRotation(mouseX: number, mouseY: number, meta: any, shiftKey: boolean): number {
    // returns rotation degrees
    let centerX = meta.bounds.x + meta.bounds.width * meta.origAnchorX;
    let centerY = meta.bounds.y + meta.bounds.height * meta.origAnchorY;
    if (meta.corners && meta.corners.length === 4) {
        const interp = (a: number, b: number, t: number) => a + (b - a) * t;
        const top = {
            x: interp(meta.corners[0].x, meta.corners[1].x, meta.origAnchorX),
            y: interp(meta.corners[0].y, meta.corners[1].y, meta.origAnchorX),
        };
        const bottom = {
            x: interp(meta.corners[3].x, meta.corners[2].x, meta.origAnchorX),
            y: interp(meta.corners[3].y, meta.corners[2].y, meta.origAnchorX),
        };
        const anchorPt = { x: interp(top.x, bottom.x, meta.origAnchorY), y: interp(top.y, bottom.y, meta.origAnchorY) };
        centerX = anchorPt.x;
        centerY = anchorPt.y;
    }
    // Match original implementation: atan2(dy, dx)
    const startAngleRad = Math.atan2(meta.startY - centerY, meta.startX - centerX);
    const currentAngleRad = Math.atan2(mouseY - centerY, mouseX - centerX);
    let deltaRad = currentAngleRad - startAngleRad;
    let newRotationRad = (meta.origRotation || 0) + deltaRad;
    if (shiftKey) {
        const deg = (newRotationRad * 180) / Math.PI;
        const snappedDeg = Math.round(deg / 15) * 15;
        newRotationRad = (snappedDeg * Math.PI) / 180;
    }
    return (newRotationRad * 180) / Math.PI;
}
