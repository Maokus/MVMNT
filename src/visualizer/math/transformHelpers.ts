// Helper functions for applying skew/scale/rotation (RSK) transforms.
// Extracted to ensure consistent math and to reduce duplication between scaling & anchor adjustment.

/** Apply (SkewX, SkewY) -> Scale -> Rotation to a local vector (vx, vy). */
export function applyRSK(
    vx: number,
    vy: number,
    rotation: number,
    skewX: number,
    skewY: number,
    scaleX: number,
    scaleY: number
) {
    const kx = Math.tan(skewX);
    const ky = Math.tan(skewY);
    // Skew application replicates the original formula order exactly:
    const kxVy = vx + kx * vy; // (x + tan(skewX) * y)
    const kyVx = ky * vx + vy; // (tan(skewY) * x + y)
    // Scale
    const sx = kxVy * scaleX;
    const sy = kyVx * scaleY;
    // Rotate
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return { x: cos * sx - sin * sy, y: sin * sx + cos * sy };
}
