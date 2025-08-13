// Rotation computation extracted from interactionMath.ts

/** Compute rotation (degrees) based on mouse position & original anchor metadata. */
export function computeRotation(mouseX: number, mouseY: number, meta: any, shiftKey: boolean): number {
    // eslint-disable-line @typescript-eslint/no-explicit-any
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
    const startAngleRad = Math.atan2(meta.startY - centerY, meta.startX - centerX);
    const currentAngleRad = Math.atan2(mouseY - centerY, mouseX - centerX);
    const deltaRad = currentAngleRad - startAngleRad;
    let newRotationRad = (meta.origRotation || 0) + deltaRad;
    if (shiftKey) {
        const deg = (newRotationRad * 180) / Math.PI;
        const snappedDeg = Math.round(deg / 15) * 15;
        newRotationRad = (snappedDeg * Math.PI) / 180;
    }
    return (newRotationRad * 180) / Math.PI;
}
