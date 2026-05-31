import { BoxRenderObject } from './box';
import { type RenderConfig, type LayoutParticipation } from './base';

export interface PixelGridOptions {
    pixels?: Uint8ClampedArray;
    layoutParticipation?: LayoutParticipation;
    /** @deprecated Use layoutParticipation. */
    includeInLayoutBounds?: boolean;
    originX?: number;
    originY?: number;
}

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

    private _offscreen: OffscreenCanvas;
    private _offCtx: OffscreenCanvasRenderingContext2D;
    private _imgData: ImageData;

    constructor(x: number, y: number, cols: number, rows: number, cellSize: number, options: PixelGridOptions = {}) {
        const clampedCols = Math.max(1, Math.round(cols));
        const clampedRows = Math.max(1, Math.round(rows));
        const clampedCellSize = Math.max(1, Math.round(cellSize));
        super(x, y, clampedCols * clampedCellSize, clampedRows * clampedCellSize, options);
        this.cols = clampedCols;
        this.rows = clampedRows;
        if (options.originX !== undefined) this.originX = options.originX;
        if (options.originY !== undefined) this.originY = options.originY;

        this._offscreen = new OffscreenCanvas(clampedCols, clampedRows);
        this._offCtx = this._offscreen.getContext('2d')!;
        this._imgData = new ImageData(clampedCols, clampedRows);

        if (options.pixels) {
            const expected = clampedCols * clampedRows * 4;
            if (options.pixels.length !== expected) {
                throw new RangeError(
                    `PixelGrid: pixels.length (${options.pixels.length}) must equal cols × rows × 4 (${expected})`
                );
            }
            this.updatePixels(options.pixels);
        }
    }

    updatePixels(pixels: Uint8ClampedArray): void {
        this._imgData.data.set(pixels);
        this._offCtx.putImageData(this._imgData, 0, 0);
    }

    drawTo(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        dx = 0,
        dy = 0,
        dw = this.width,
        dh = this.height
    ): void {
        const prev = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._offscreen, dx, dy, dw, dh);
        ctx.imageSmoothingEnabled = prev;
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, _currentTime: number): void {
        this.drawTo(ctx, 0, 0, this.width, this.height);
    }
}
