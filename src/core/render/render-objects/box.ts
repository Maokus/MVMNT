import { RenderObject, type Bounds } from './base';

/**
 * Abstract base for render objects with a known rectangular extent (width × height).
 * Provides shared width/height fields, setSize(), setOriginFraction() (with immediate
 * pivot reapply), and a default _getSelfBounds() returning the untransformed (0,0,w,h)
 * rect. Subclasses with stroke padding or fit-mode bounds override _getSelfBounds.
 *
 * Concrete subclasses: Rectangle, VisualMedia, PixelGrid.
 */
export abstract class BoxRenderObject extends RenderObject {
    width: number;
    height: number;

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        options?: { includeInLayoutBounds?: boolean | undefined }
    ) {
        super(x, y, 1, 1, 1, options);
        this.width = Math.max(0, width);
        this.height = Math.max(0, height);
    }

    setSize(w: number, h: number): this {
        this.width = Math.max(0, w);
        this.height = Math.max(0, h);
        this._reapplyPivotFraction(this.width, this.height);
        return this;
    }

    override setOriginFraction(x: number, y: number): this {
        super.setOriginFraction(x, y);
        this._reapplyPivotFraction(this.width, this.height);
        return this;
    }

    protected override _getSelfBounds(): Bounds {
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
}
