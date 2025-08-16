// Geometry utilities (point-in-polygon tests, geometry construction, local handle mapping).
// Logic intentionally preserved verbatim from the previous monolithic interactionMath.ts.

import { Bounds, GeometryInfo, Point } from '@math/transforms/types';

/** Ray-casting point in polygon test. */
export const pointInPolygon = (ptX: number, ptY: number, corners: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
        const xi = corners[i].x,
            yi = corners[i].y;
        const xj = corners[j].x,
            yj = corners[j].y;
        // prettier-ignore
        const intersect = ((yi > ptY) !== (yj > ptY)) && (ptX < (((xj - xi) * (ptY - yi)) / ((yj - yi) + 1e-9) + xi));
        if (intersect) inside = !inside;
    }
    return inside;
};

/** Build orthogonal-ish geometry vectors (width/height) + midpoints from an element corner record. */
export function buildGeometry(rec: any): GeometryInfo | null {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!rec || !rec.corners || rec.corners.length !== 4) return null;
    const [TL, TR, BR, BL] = rec.corners as Point[];
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

/** Map a handle tag to a local (untransformed) point inside a bounds rectangle. */
export function localPointFor(tag: string, bb: Bounds | null): Point {
    if (!bb) return { x: 0, y: 0 };
    const { x, y, width: w, height: h } = bb;
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
