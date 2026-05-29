import { BoxRenderObject } from './box';
import { type RenderConfig } from './base';

/**
 * Renders a rectangular grid of colored cells using OffscreenCanvas + putImageData,
 * then blits the result with drawImage. This is orders of magnitude faster than one
 * RenderObject per cell for large grids.
 *
 * Pixel data format: flat Uint8ClampedArray of length cols * rows * 4 (RGBA per cell).
 * Each cell is rendered as a nearest-neighbour scaled block of cellSize × cellSize pixels.
 *
 * To avoid per-frame OffscreenCanvas reallocation, cache the PixelGrid instance on
 * the SceneElement and call updatePixels() each frame instead of creating a new object.
 */
export class PixelGrid extends BoxRenderObject {
    readonly cols: number;
    readonly rows: number;
    readonly cellSize: number;

    private _offscreen: OffscreenCanvas;
    private _offCtx: OffscreenCanvasRenderingContext2D;
    private _imgData: ImageData;

    constructor(
        x: number,
        y: number,
        cols: number,
        rows: number,
        cellSize: number,
        pixels: Uint8ClampedArray,
        options?: { includeInLayoutBounds?: boolean }
    ) {
        const clampedCols = Math.max(1, Math.round(cols));
        const clampedRows = Math.max(1, Math.round(rows));
        const clampedCellSize = Math.max(1, Math.round(cellSize));
        super(x, y, clampedCols * clampedCellSize, clampedRows * clampedCellSize, {
            includeInLayoutBounds: options?.includeInLayoutBounds,
        });
        this.cols = clampedCols;
        this.rows = clampedRows;
        this.cellSize = clampedCellSize;

        const expected = clampedCols * clampedRows * 4;
        if (pixels.length !== expected) {
            throw new RangeError(
                `PixelGrid: pixels.length (${pixels.length}) must equal cols × rows × 4 (${expected})`
            );
        }

        this._offscreen = new OffscreenCanvas(clampedCols, clampedRows);
        this._offCtx = this._offscreen.getContext('2d')!;
        this._imgData = new ImageData(clampedCols, clampedRows);
        this.updatePixels(pixels);
    }

    updatePixels(pixels: Uint8ClampedArray): void {
        this._imgData.data.set(pixels);
        this._offCtx.putImageData(this._imgData, 0, 0);
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _currentTime: number): void {
        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._offscreen, 0, 0, this.width, this.height);
        ctx.imageSmoothingEnabled = prevSmoothing;
    }
}
