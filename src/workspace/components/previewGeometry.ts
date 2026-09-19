/** Crop in lane coordinates without changing the clip's time scale. */
export function getPreviewViewport(left: number, right: number, laneWidth: number) {
    const startX = Math.max(0, left);
    const endX = Math.min(laneWidth, right);
    return { left: startX - left, width: Math.max(0, endX - startX), startX, endX };
}

export function getClipPreviewLayout(rowHeight: number) {
    const height = Math.max(1, rowHeight - 8);
    return { height, headerHeight: height >= 32 ? 16 : 0 };
}

export function getNoteVerticalBounds(height: number, pitch: number, minPitch: number, maxPitch: number) {
    const padding = Math.min(2, height / 4);
    const available = Math.max(0, height - padding * 2);
    const range = Math.max(0, maxPitch - minPitch);
    const thickness = Math.min(available, Math.max(1, Math.min(6, available / Math.min(range + 1, 12))));
    const position = range === 0 ? 0.5 : Math.max(0, Math.min(1, (maxPitch - pitch) / range));
    return { y: padding + position * (available - thickness), height: thickness };
}

/** Tiles have integer physical boundaries, including at fractional display densities. */
export function getPreviewTiles(width: number, height: number, scale: number) {
    const physicalWidth = Math.ceil(width * scale);
    const physicalHeight = Math.max(1, Math.ceil(height * scale));
    const tileWidth = Math.max(1, Math.min(8192, Math.floor((16 * 1024 * 1024) / physicalHeight)));
    const tiles: Array<{ pixelX: number; pixelWidth: number }> = [];
    for (let pixelX = 0; pixelX < physicalWidth; pixelX += tileWidth) {
        tiles.push({ pixelX, pixelWidth: Math.min(tileWidth, physicalWidth - pixelX) });
    }
    return tiles;
}
