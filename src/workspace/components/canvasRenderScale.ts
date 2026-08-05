const MAX_BACKING_DIMENSION = 8192;
const MAX_BACKING_PIXELS = 16 * 1024 * 1024;

/**
 * Limits a canvas backing store to dimensions browsers can reliably allocate.
 * The canvas can still occupy its full CSS size; it is simply rasterized at a
 * lower density when a highly zoomed clip would otherwise create a huge bitmap.
 */
export function getCanvasRenderScale(width: number, height: number, devicePixelRatio: number): number {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const requestedScale = Math.max(1, devicePixelRatio);
    const dimensionScale = Math.min(MAX_BACKING_DIMENSION / safeWidth, MAX_BACKING_DIMENSION / safeHeight);
    const areaScale = Math.sqrt(MAX_BACKING_PIXELS / (safeWidth * safeHeight));

    return Math.min(requestedScale, dimensionScale, areaScale);
}
