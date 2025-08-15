// Base RenderObject class for modular rendering system (TypeScript version)
export interface RenderConfig {
    canvas?: HTMLCanvasElement; // Many callers provide canvas for sizing logic
    showAnchorPoints?: boolean;
    // Allow arbitrary additional configuration keys
    [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export abstract class RenderObject {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
    opacity: number;
    visible: boolean;
    rotation: number;
    children: RenderObject[]; // public to satisfy RenderObjectInterface

    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1) {
        this.x = x;
        this.y = y;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.skewX = 0; // Skew in radians
        this.skewY = 0; // Skew in radians
        this.opacity = opacity;
        this.visible = true;
        this.rotation = 0; // Rotation in radians
        this.children = []; // Array of child render objects
    }

    /** Main render method that handles transformations and delegates to _renderSelf */
    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.rotation !== 0) ctx.rotate(this.rotation);
        if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);

        if (this.skewX !== 0 || this.skewY !== 0) {
            const transform: [number, number, number, number, number, number] = [
                1,
                Math.tan(this.skewY), // skewY affects Y->X
                Math.tan(this.skewX),
                1, // skewX affects X->Y
                0,
                0,
            ];
            ctx.transform(...transform);
        }

        if (this.opacity !== 1) ctx.globalAlpha *= this.opacity;

        this._renderSelf(ctx, config, currentTime);

        for (const child of this.children) child?.render?.(ctx, config, currentTime);

        ctx.restore();
    }

    /** Abstract method for subclasses to implement their specific drawing logic */
    protected abstract _renderSelf(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void;

    setPosition(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }
    setScale(scaleX: number, scaleY = scaleX): this {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        return this;
    }
    setSkew(skewX: number, skewY: number): this {
        this.skewX = skewX;
        this.skewY = skewY;
        return this;
    }
    setOpacity(opacity: number): this {
        this.opacity = Math.max(0, Math.min(1, opacity));
        return this;
    }
    setVisible(visible: boolean): this {
        this.visible = visible;
        return this;
    }
    setRotation(rotation: number): this {
        this.rotation = rotation;
        return this;
    }
    addChild(child: (RenderObject & { [key: string]: any }) | null | undefined): this {
        if (child && !this.children.includes(child)) this.children.push(child as RenderObject);
        return this;
    }
    removeChild(child: RenderObject | { [key: string]: any }): this {
        const index = this.children.indexOf(child as RenderObject);
        if (index !== -1) this.children.splice(index, 1);
        return this;
    }
    getChildren(): RenderObject[] {
        return this.children.slice();
    }
    clearChildren(): this {
        this.children = [];
        return this;
    }
    /** Basic bounds (override in subclasses) */
    getBounds(): Bounds {
        return { x: this.x, y: this.y, width: 0, height: 0 };
    }
}
