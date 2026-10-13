export interface PreviewBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function unionPreviewBounds(bounds: readonly PreviewBounds[]): PreviewBounds | null {
    const valid = bounds.filter(
        (bound) =>
            Number.isFinite(bound.x) &&
            Number.isFinite(bound.y) &&
            Number.isFinite(bound.width) &&
            Number.isFinite(bound.height) &&
            bound.width >= 0 &&
            bound.height >= 0
    );
    if (!valid.length) return null;
    const left = Math.min(...valid.map((bound) => bound.x));
    const top = Math.min(...valid.map((bound) => bound.y));
    const right = Math.max(...valid.map((bound) => bound.x + bound.width));
    const bottom = Math.max(...valid.map((bound) => bound.y + bound.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

export function framePreviewBounds(
    bounds: PreviewBounds,
    stage: { width: number; height: number },
    display: { w: number; h: number },
    viewport: { width: number; height: number }
): { zoom: number; pan: { x: number; y: number } } | null {
    if (!stage.width || !stage.height || !display.w || !display.h || viewport.width <= 40 || viewport.height <= 40) {
        return null;
    }
    const scaleX = display.w / stage.width;
    const scaleY = display.h / stage.height;
    const artworkWidth = Math.max(bounds.width * scaleX, 1);
    const artworkHeight = Math.max(bounds.height * scaleY, 1);
    const zoom = Math.min(
        10,
        Math.max(0.05, Math.min((viewport.width - 40) / artworkWidth, (viewport.height - 40) / artworkHeight) * 0.9)
    );
    return {
        zoom,
        pan: {
            x: -zoom * (bounds.x + bounds.width / 2 - stage.width / 2) * scaleX,
            y: -zoom * (bounds.y + bounds.height / 2 - stage.height / 2) * scaleY,
        },
    };
}
