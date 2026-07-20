import {
    applyAffinePoint,
    invertAffineTransform,
    validatePerspectiveWarp,
    type AffineTransform,
    type PerspectivePoint,
    type PerspectiveWarp,
} from '@math/perspective-warp';

export type WarpCornerId = 'warp-tl' | 'warp-tr' | 'warp-br' | 'warp-bl';

export function inverseMapPointerToNormalizedLocal(
    pointer: PerspectivePoint,
    affine: AffineTransform,
    bounds: { x: number; y: number; width: number; height: number }
): PerspectivePoint | null {
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width === 0 || bounds.height === 0) return null;
    const inverse = invertAffineTransform(affine);
    if (!inverse) return null;
    const local = applyAffinePoint(inverse, pointer);
    const normalized = { x: (local.x - bounds.x) / bounds.width, y: (local.y - bounds.y) / bounds.height };
    return Number.isFinite(normalized.x) && Number.isFinite(normalized.y) ? normalized : null;
}

export function replaceWarpCorner(warp: PerspectiveWarp, corner: WarpCornerId, point: PerspectivePoint): PerspectiveWarp {
    const next: PerspectiveWarp = {
        topLeft: { ...warp.topLeft },
        topRight: { ...warp.topRight },
        bottomRight: { ...warp.bottomRight },
        bottomLeft: { ...warp.bottomLeft },
    };
    if (corner === 'warp-tl') next.topLeft = point;
    else if (corner === 'warp-tr') next.topRight = point;
    else if (corner === 'warp-br') next.bottomRight = point;
    else next.bottomLeft = point;
    return next;
}

export function computeWarpCornerDrag(
    pointer: PerspectivePoint,
    corner: WarpCornerId,
    warp: PerspectiveWarp,
    affine: AffineTransform,
    bounds: { x: number; y: number; width: number; height: number }
): { warp: PerspectiveWarp; point: PerspectivePoint } | null {
    const point = inverseMapPointerToNormalizedLocal(pointer, affine, bounds);
    if (!point) return null;
    const candidate = replaceWarpCorner(warp, corner, point);
    if (!validatePerspectiveWarp(candidate).valid) return null;
    return { warp: candidate, point };
}

