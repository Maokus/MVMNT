import { BoxRenderObject } from './box';
import { type RenderConfig } from './base';

/**
 * Renders a rectangular grid of colored cells using OffscreenCanvas + putImageData,
 * then blits the result with drawImage. This is orders of magnitude faster than one
 * RenderObject per cell for large grids.
 *
 * Pixel data format: flat Uint8ClampedArray of length cols * rows * 4 (RGBA per cell).
 * Transparent cells (alpha === 0) are skipped efficiently.
 *
 * Two rendering paths:
 *  - cellGap === 0: tiny offscreen at cols×rows, scaled up (Option 3)
 *  - cellGap > 0: full-resolution offscreen with gaps baked into pixel blocks (Option 4)
 *
 * To avoid per-frame OffscreenCanvas reallocation, cache the PixelGrid instance on
 * the SceneElement and call updatePixels() each frame instead of creating a new object.
 */
export class PixelGrid extends BoxRenderObject {
    readonly cols: number;
    readonly rows: number;
    readonly cellSize: number;
    readonly cellGap: number;

    private _offscreen: OffscreenCanvas;

    constructor(
        x: number,
        y: number,
        cols: number,
        rows: number,
        cellSize: number,
        pixels: Uint8ClampedArray,
        options?: { cellGap?: number; includeInLayoutBounds?: boolean }
    ) {
        const clampedCols = Math.max(1, Math.round(cols));
        const clampedRows = Math.max(1, Math.round(rows));
        const clampedCellSize = Math.max(1, cellSize);
        super(x, y, clampedCols * clampedCellSize, clampedRows * clampedCellSize, {
            includeInLayoutBounds: options?.includeInLayoutBounds,
        });
        this.cols = clampedCols;
        this.rows = clampedRows;
        this.cellSize = clampedCellSize;
        this.cellGap = Math.max(0, options?.cellGap ?? 0);
        this._offscreen = this._buildOffscreen(pixels);
    }

    /** Rebuild pixel data without reallocating the OffscreenCanvas (when dimensions are unchanged). */
    updatePixels(pixels: Uint8ClampedArray): void {
        this._offscreen = this._buildOffscreen(pixels);
    }

    private _buildOffscreen(pixels: Uint8ClampedArray): OffscreenCanvas {
        if (this.cellGap === 0) {
            return this._buildScaledOffscreen(pixels);
        }
        return this._buildGappedOffscreen(pixels);
    }

    /** Option 3: 1px-per-cell offscreen, drawImage scales it up. */
    private _buildScaledOffscreen(pixels: Uint8ClampedArray): OffscreenCanvas {
        const off = new OffscreenCanvas(this.cols, this.rows);
        const offCtx = off.getContext('2d')!;
        const imgData = new ImageData(new Uint8ClampedArray(pixels), this.cols, this.rows);
        offCtx.putImageData(imgData, 0, 0);
        return off;
    }

    /** Option 4: Full-resolution offscreen with gap pixels left transparent. */
    private _buildGappedOffscreen(pixels: Uint8ClampedArray): OffscreenCanvas {
        const drawSize = Math.max(1, this.cellSize - this.cellGap);
        const gapOff = Math.floor(this.cellGap / 2);
        const offW = this.width;
        const offH = this.height;

        const off = new OffscreenCanvas(offW, offH);
        const offCtx = off.getContext('2d')!;
        const imgData = offCtx.createImageData(offW, offH);
        const data = imgData.data;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const srcIdx = (row * this.cols + col) * 4;
                const a = pixels[srcIdx + 3];
                if (a === 0) continue;

                const r = pixels[srcIdx];
                const g = pixels[srcIdx + 1];
                const b = pixels[srcIdx + 2];
                const px = col * this.cellSize + gapOff;
                const py = row * this.cellSize + gapOff;

                for (let dy = 0; dy < drawSize; dy++) {
                    const rowStart = ((py + dy) * offW + px) * 4;
                    for (let dx = 0; dx < drawSize; dx++) {
                        const dstIdx = rowStart + dx * 4;
                        data[dstIdx] = r;
                        data[dstIdx + 1] = g;
                        data[dstIdx + 2] = b;
                        data[dstIdx + 3] = a;
                    }
                }
            }
        }

        offCtx.putImageData(imgData, 0, 0);
        return off;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _currentTime: number): void {
        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._offscreen, 0, 0, this.width, this.height);
        ctx.imageSmoothingEnabled = prevSmoothing;
    }
}
