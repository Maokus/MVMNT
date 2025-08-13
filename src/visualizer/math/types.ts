// Shared math/geometry related TypeScript types.
// Extracted from the former interactionMath.ts for modularity & clarity.

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
    element?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    baseBounds?: Bounds;
}

export interface GeometryInfo {
    widthVec: Point;
    heightVec: Point;
    corners: { TL: Point; TR: Point; BR: Point; BL: Point };
    mids: { MTop: Point; MRight: Point; MBottom: Point; MLeft: Point };
    baseBounds: Bounds | null;
}

export interface ScaleComputationParams {
    mode: string;
    origScaleX: number;
    origScaleY: number;
    baseBounds: Bounds;
    fixedWorldPoint: Point;
    fixedLocalPoint: Point; // retained for future use / clarity (not used directly in computeScaledTransform)
    dragLocalPoint: Point; // retained for future use / clarity (not used directly in computeScaledTransform)
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
