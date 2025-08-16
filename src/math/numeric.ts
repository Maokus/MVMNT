// Shared small math utilities for transform computations.
// Centralising these improves readability and keeps numerical safeguards consistent.

/** Clamp a signed scale value so its magnitude never falls below a tiny epsilon (preserving sign). */
export function clampSignedScale(v: number, minMagnitude = 0.01): number {
    const mag = Math.abs(v);
    if (!isFinite(v)) return v < 0 ? -minMagnitude : minMagnitude;
    if (mag < minMagnitude) return v < 0 ? -minMagnitude : minMagnitude;
    return v;
}

/** Clamp a normalized anchor coordinate into [0,1]. */
export function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Snap an (x,y) pair to the nearest candidate pair (Cartesian product of candidates) */
export function snapToGrid2D(x: number, y: number, candidates: number[]) {
    let bestX = x;
    let bestY = y;
    let bestD = Infinity;
    for (const cx of candidates) {
        for (const cy of candidates) {
            const dx = cx - x;
            const dy = cy - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD) {
                bestD = d2;
                bestX = cx;
                bestY = cy;
            }
        }
    }
    return { x: bestX, y: bestY };
}

/** Convenience resolving sin/cos only once. */
export function sincos(theta: number) {
    return { sin: Math.sin(theta), cos: Math.cos(theta) };
}
