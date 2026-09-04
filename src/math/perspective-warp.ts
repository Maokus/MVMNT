export interface PerspectivePoint {
    x: number;
    y: number;
}

export interface PerspectiveWarp {
    topLeft: PerspectivePoint;
    topRight: PerspectivePoint;
    bottomRight: PerspectivePoint;
    bottomLeft: PerspectivePoint;
}

export interface PerspectiveBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Row-major 3x3 matrix. Points are treated as column vectors. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY_PERSPECTIVE_WARP: Readonly<PerspectiveWarp> = Object.freeze({
    topLeft: Object.freeze({ x: 0, y: 0 }),
    topRight: Object.freeze({ x: 1, y: 0 }),
    bottomRight: Object.freeze({ x: 1, y: 1 }),
    bottomLeft: Object.freeze({ x: 0, y: 1 }),
});

const EPSILON = 1e-8;

export interface PerspectiveCameraProjection {
    rotationX: number;
    rotationY: number;
    strength: number;
    /** Normalized element coordinate; finite values outside 0–1 are supported. */
    pivotX: number;
    /** Normalized element coordinate; finite values outside 0–1 are supported. */
    pivotY: number;
    vanishingPointX: number;
    vanishingPointY: number;
}

export interface PerspectiveViewport {
    width: number;
    height: number;
}

export type PerspectiveCameraResult =
    | { kind: 'projected'; warp: PerspectiveWarp }
    | { kind: 'edge-on'; warp: PerspectiveWarp }
    | { kind: 'invalid'; warp: PerspectiveWarp; reason: string };

/**
 * Creates a corner projection for a plane tilted around its horizontal and
 * vertical axes. The inputs are degrees so they can be exposed directly in
 * the inspector, while the renderer continues to consume its normal
 * homography-based representation.
 */
/**
 * Whether the projected plane has collapsed to a line (or point). This must
 * be determined from the projected corners rather than its tilt angle: at a
 * quarter turn, an off-plane vanishing point can still produce drawable area.
 */
export function isPerspectiveEdgeOn(warp: PerspectiveWarp): boolean {
    const points = perspectiveWarpPoints(warp);
    if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return false;

    let first = points[0];
    let second = first;
    let longestDistanceSquared = 0;
    for (const point of points) {
        for (const other of points) {
            const distanceSquared = (point.x - other.x) ** 2 + (point.y - other.y) ** 2;
            if (distanceSquared > longestDistanceSquared) {
                first = point;
                second = other;
                longestDistanceSquared = distanceSquared;
            }
        }
    }
    if (longestDistanceSquared <= EPSILON ** 2) return true;

    const length = Math.sqrt(longestDistanceSquared);
    return points.every((point) => Math.abs(cross(first, second, point)) <= EPSILON * length);
}

export function perspectiveStrengthToCameraDistance(strength: number): number {
    const normalized = Math.max(0, Math.min(100, Number.isFinite(strength) ? strength : 50)) / 100;
    return normalized <= EPSILON ? Infinity : 1.1 / normalized;
}

export function cameraDistanceToPerspectiveStrength(distance: number): number {
    if (distance === Infinity) return 0;
    if (!Number.isFinite(distance) || distance <= 0) return 50;
    return Math.max(0, Math.min(100, 110 / distance));
}

/**
 * Projects an aspect-correct local plane toward a canvas-relative vanishing
 * point. The returned normalized corners remain compatible with the existing
 * homography compositor.
 */
export function createPerspectiveCameraWarp(
    bounds: PerspectiveBounds,
    affine: AffineTransform,
    viewport: PerspectiveViewport,
    projection: PerspectiveCameraProjection
): PerspectiveCameraResult {
    if (Math.abs(bounds.width) <= EPSILON || Math.abs(bounds.height) <= EPSILON) {
        return { kind: 'invalid', warp: { ...IDENTITY_PERSPECTIVE_WARP }, reason: 'element bounds are empty' };
    }
    const inverseAffine = invertAffineTransform(affine);
    if (!inverseAffine) {
        return { kind: 'invalid', warp: { ...IDENTITY_PERSPECTIVE_WARP }, reason: 'element transform is singular' };
    }

    const rotationX = Number.isFinite(projection.rotationX) ? projection.rotationX : 0;
    const rotationY = Number.isFinite(projection.rotationY) ? projection.rotationY : 0;
    const strength = Math.max(0, Math.min(100, Number.isFinite(projection.strength) ? projection.strength : 50));
    // Normalized pivot coordinates intentionally support points outside the
    // element rectangle. This keeps a linked perspective pivot continuous
    // when the content anchor is below 0 or above 1.
    const pivotX = Number.isFinite(projection.pivotX) ? projection.pivotX : 0.5;
    const pivotY = Number.isFinite(projection.pivotY) ? projection.pivotY : 0.5;
    const vanishingPointX = Math.max(
        -2,
        Math.min(3, Number.isFinite(projection.vanishingPointX) ? projection.vanishingPointX : 0.5)
    );
    const vanishingPointY = Math.max(
        -2,
        Math.min(3, Number.isFinite(projection.vanishingPointY) ? projection.vanishingPointY : 0.5)
    );
    const pitch = (rotationX * Math.PI) / 180;
    const yaw = (rotationY * Math.PI) / 180;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const pivot = {
        x: bounds.x + bounds.width * pivotX,
        y: bounds.y + bounds.height * pivotY,
    };
    const viewportWidth = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : bounds.width;
    const viewportHeight = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : bounds.height;
    const vanishingPoint = applyAffinePoint(inverseAffine, {
        x: viewportWidth * vanishingPointX,
        y: viewportHeight * vanishingPointY,
    });
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const distanceInDiagonals = perspectiveStrengthToCameraDistance(strength);
    const cameraDistance = distanceInDiagonals * diagonal;

    const project = ({ x, y }: PerspectivePoint): PerspectivePoint => {
        const localX = x - pivot.x;
        const localY = y - pivot.y;
        const pitchedY = localY * cosPitch;
        const pitchedZ = localY * sinPitch;
        const rotatedX = localX * cosYaw + pitchedZ * sinYaw;
        const rotatedZ = -localX * sinYaw + pitchedZ * cosYaw;
        const rotatedPoint = { x: pivot.x + rotatedX, y: pivot.y + pitchedY };
        if (!Number.isFinite(cameraDistance)) return rotatedPoint;
        const scale = cameraDistance / (cameraDistance + rotatedZ);
        return {
            x: vanishingPoint.x + (rotatedPoint.x - vanishingPoint.x) * scale,
            y: vanishingPoint.y + (rotatedPoint.y - vanishingPoint.y) * scale,
        };
    };

    const normalize = (point: PerspectivePoint): PerspectivePoint => ({
        x: (point.x - bounds.x) / bounds.width,
        y: (point.y - bounds.y) / bounds.height,
    });
    const warp = {
        topLeft: normalize(project({ x: bounds.x, y: bounds.y })),
        topRight: normalize(project({ x: bounds.x + bounds.width, y: bounds.y })),
        bottomRight: normalize(project({ x: bounds.x + bounds.width, y: bounds.y + bounds.height })),
        bottomLeft: normalize(project({ x: bounds.x, y: bounds.y + bounds.height })),
    };
    const validation = validatePerspectiveWarp(warp);
    if (isPerspectiveEdgeOn(warp)) return { kind: 'edge-on', warp };
    return validation.valid
        ? { kind: 'projected', warp }
        : { kind: 'invalid', warp, reason: validation.reason ?? 'invalid projection' };
}

export function perspectiveWarpPoints(warp: PerspectiveWarp): PerspectivePoint[] {
    return [warp.topLeft, warp.topRight, warp.bottomRight, warp.bottomLeft];
}

export function isIdentityPerspectiveWarp(warp: PerspectiveWarp, epsilon = 1e-10): boolean {
    const actual = perspectiveWarpPoints(warp);
    const expected = perspectiveWarpPoints(IDENTITY_PERSPECTIVE_WARP);
    return actual.every(
        (point, index) =>
            Math.abs(point.x - expected[index].x) <= epsilon && Math.abs(point.y - expected[index].y) <= epsilon
    );
}

function cross(a: PerspectivePoint, b: PerspectivePoint, c: PerspectivePoint): number {
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

export function validatePerspectiveWarp(warp: PerspectiveWarp): { valid: boolean; reason?: string } {
    const points = perspectiveWarpPoints(warp);
    if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
        return { valid: false, reason: 'corner coordinates must be finite' };
    }

    const turns = points.map((point, index) => cross(point, points[(index + 1) % 4], points[(index + 2) % 4]));
    if (turns.some((turn) => Math.abs(turn) <= EPSILON)) {
        return { valid: false, reason: 'quadrilateral is degenerate' };
    }
    const winding = Math.sign(turns[0]);
    if (turns.some((turn) => Math.sign(turn) !== winding)) {
        return { valid: false, reason: 'quadrilateral must be convex and consistently wound' };
    }

    const homography = createHomography(warp);
    if (!homography) return { valid: false, reason: 'homography is singular' };
    // For a rectangle, homogeneous w is affine, so equal signs at all corners prove
    // that no projective pole crosses the interior.
    const wValues = [
        homography[8],
        homography[6] + homography[8],
        homography[6] + homography[7] + homography[8],
        homography[7] + homography[8],
    ];
    if (wValues.some((value) => !Number.isFinite(value) || Math.abs(value) <= EPSILON)) {
        return { valid: false, reason: 'projective pole touches the element' };
    }
    const wSign = Math.sign(wValues[0]);
    if (wValues.some((value) => Math.sign(value) !== wSign)) {
        return { valid: false, reason: 'projective pole crosses the element' };
    }
    return { valid: true };
}

/** Solve the unit square -> warp homography. */
export function createHomography(warp: PerspectiveWarp): Homography | null {
    const [p0, p1, p2, p3] = perspectiveWarpPoints(warp);
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const dy3 = p0.y - p1.y + p2.y - p3.y;
    const denominator = dx1 * dy2 - dx2 * dy1;

    let g = 0;
    let h = 0;
    if (Math.abs(dx3) > EPSILON || Math.abs(dy3) > EPSILON) {
        if (Math.abs(denominator) <= EPSILON) return null;
        g = (dx3 * dy2 - dx2 * dy3) / denominator;
        h = (dx1 * dy3 - dx3 * dy1) / denominator;
    }
    const a = p1.x - p0.x + g * p1.x;
    const b = p3.x - p0.x + h * p3.x;
    const c = p0.x;
    const d = p1.y - p0.y + g * p1.y;
    const e = p3.y - p0.y + h * p3.y;
    const f = p0.y;
    const result: Homography = [a, b, c, d, e, f, g, h, 1];
    return result.every(Number.isFinite) ? result : null;
}

export function invertHomography(matrix: Homography): Homography | null {
    const [a, b, c, d, e, f, g, h, i] = matrix;
    const A = e * i - f * h;
    const B = c * h - b * i;
    const C = b * f - c * e;
    const D = f * g - d * i;
    const E = a * i - c * g;
    const F = c * d - a * f;
    const G = d * h - e * g;
    const H = b * g - a * h;
    const I = a * e - b * d;
    const determinant = a * A + b * D + c * G;
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= EPSILON) return null;
    const inverse = 1 / determinant;
    const result: Homography = [
        A * inverse,
        B * inverse,
        C * inverse,
        D * inverse,
        E * inverse,
        F * inverse,
        G * inverse,
        H * inverse,
        I * inverse,
    ];
    return result.every(Number.isFinite) ? result : null;
}

export function projectPerspectivePoint(matrix: Homography, point: PerspectivePoint): PerspectivePoint | null {
    const w = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
    if (!Number.isFinite(w) || Math.abs(w) <= EPSILON) return null;
    const x = (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / w;
    const y = (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / w;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function getProjectedBounds(points: readonly PerspectivePoint[]): PerspectiveBounds | null {
    if (!points.length || !points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

export function clipPerspectiveBounds(
    bounds: PerspectiveBounds,
    viewportWidth: number,
    viewportHeight: number
): PerspectiveBounds | null {
    const x = Math.max(0, bounds.x);
    const y = Math.max(0, bounds.y);
    const right = Math.min(viewportWidth, bounds.x + bounds.width);
    const bottom = Math.min(viewportHeight, bounds.y + bounds.height);
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
}

export interface AffineTransform {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

export function applyAffinePoint(matrix: AffineTransform, point: PerspectivePoint): PerspectivePoint {
    return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
}

export function invertAffineTransform(matrix: AffineTransform): AffineTransform | null {
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= EPSILON) return null;
    return {
        a: matrix.d / determinant,
        b: -matrix.b / determinant,
        c: -matrix.c / determinant,
        d: matrix.a / determinant,
        e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
        f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
    };
}

export function warpLocalPoint(
    warpMatrix: Homography,
    bounds: PerspectiveBounds,
    localPoint: PerspectivePoint
): PerspectivePoint | null {
    if (Math.abs(bounds.width) <= EPSILON || Math.abs(bounds.height) <= EPSILON) return null;
    const normalized = { x: (localPoint.x - bounds.x) / bounds.width, y: (localPoint.y - bounds.y) / bounds.height };
    const projected = projectPerspectivePoint(warpMatrix, normalized);
    return projected ? { x: bounds.x + projected.x * bounds.width, y: bounds.y + projected.y * bounds.height } : null;
}

export function unwarpLocalPoint(
    inverseWarpMatrix: Homography,
    bounds: PerspectiveBounds,
    warpedPoint: PerspectivePoint
): PerspectivePoint | null {
    if (Math.abs(bounds.width) <= EPSILON || Math.abs(bounds.height) <= EPSILON) return null;
    const normalized = { x: (warpedPoint.x - bounds.x) / bounds.width, y: (warpedPoint.y - bounds.y) / bounds.height };
    const local = projectPerspectivePoint(inverseWarpMatrix, normalized);
    return local ? { x: bounds.x + local.x * bounds.width, y: bounds.y + local.y * bounds.height } : null;
}
