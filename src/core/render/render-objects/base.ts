// Base RenderObject class for modular rendering system (TypeScript version)

/**
 * Controls whether this object and its descendants contribute to layout bounds.
 * - 'auto'    Include self; respect each child's own policy (default).
 * - 'include' Force-include self and all descendants.
 * - 'exclude' Force-exclude self and all descendants.
 */
export type LayoutParticipation = 'auto' | 'include' | 'exclude';

export interface RenderConfig {
    canvas?: HTMLCanvasElement; // Many callers provide canvas for sizing logic
    showAnchorPoints?: boolean;
    /** When true, VisualMedia objects draw a debug overlay (bounds, anchors, pivot). */
    showDebug?: boolean;
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
    /**
     * Local-space transform origin in pixels.
     * The object's world (x, y) position maps to this point in local space.
     * Rotation and scale happen around this point.
     * (0, 0) = top-left (default). For a 200×200 object, (100, 100) = center.
     */
    originX: number;
    originY: number;
    /** Stored origin fractions (0–1) for dimension-aware subclasses. null = not set. */
    protected _originFractionX: number | null = null;
    protected _originFractionY: number | null = null;
    children: RenderObject[]; // public to satisfy RenderObjectInterface
    /** Controls whether this object and descendants contribute to layout bounds. Default: 'auto'. */
    layoutParticipation: LayoutParticipation;
    /** Optional Canvas 2D composite operation applied within this object's save/restore scope. */
    blendMode: GlobalCompositeOperation | null;
    /** Optional CSS filter string (e.g. 'blur(8px)') applied within this object's save/restore scope. */
    filter: string | null;

    constructor(
        x = 0,
        y = 0,
        scaleX = 1,
        scaleY = 1,
        opacity = 1,
        options?: {
            layoutParticipation?: LayoutParticipation;
            /** @deprecated Use layoutParticipation instead. */
            includeInLayoutBounds?: boolean | undefined;
            originX?: number;
            originY?: number;
        }
    ) {
        this.x = x;
        this.y = y;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.skewX = 0; // Skew in radians
        this.skewY = 0; // Skew in radians
        this.opacity = opacity;
        this.visible = true;
        this.rotation = 0; // Rotation in radians
        this.originX = options?.originX ?? 0;
        this.originY = options?.originY ?? 0;
        this.children = []; // Array of child render objects
        if (options?.layoutParticipation !== undefined) {
            this.layoutParticipation = options.layoutParticipation;
        } else if (options?.includeInLayoutBounds === true) {
            this.layoutParticipation = 'include';
        } else if (options?.includeInLayoutBounds === false) {
            this.layoutParticipation = 'exclude';
        } else {
            this.layoutParticipation = 'auto';
        }
        this.blendMode = null;
        this.filter = null;
    }

    /**
     * Set the local-space transform origin in pixels.
     * The object's world position maps to this point; rotation and scale happen around it.
     * Clears any stored origin fractions.
     */
    setOrigin(x: number, y: number): this {
        this.originX = x;
        this.originY = y;
        this._originFractionX = null;
        this._originFractionY = null;
        return this;
    }

    /**
     * Set the transform origin as fractions of the object's dimensions (0–1).
     * Stores the fractions so subclasses can reapply them when dimensions change
     * by calling `_reapplyPivotFraction(width, height)` inside `setDimensions`.
     *
     * Example: (0.5, 1) = bottom-center of the box is its world position and rotation axis.
     *
     * Note: this base implementation only stores the fractions; it does NOT update
     * originX/Y because the base class has no width/height. Subclasses with known
     * dimensions should override this to also call _reapplyPivotFraction immediately.
     */
    setOriginFraction(x: number, y: number): this {
        this._originFractionX = x;
        this._originFractionY = y;
        return this;
    }

    /** @deprecated Use setOrigin instead. */
    setPivot(x: number, y: number): this {
        return this.setOrigin(x, y);
    }

    /** @deprecated Use setOriginFraction instead. */
    setPivotFraction(x: number, y: number): this {
        return this.setOriginFraction(x, y);
    }

    /** Recompute originX/Y from stored fractions for the given dimensions. */
    protected _reapplyPivotFraction(width: number, height: number): void {
        if (this._originFractionX !== null) this.originX = this._originFractionX * width;
        if (this._originFractionY !== null) this.originY = this._originFractionY * height;
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

        // Apply origin: shift content so originX/originY in local space aligns with (x, y) in world.
        if (this.originX !== 0 || this.originY !== 0) ctx.translate(-this.originX, -this.originY);

        if (this.opacity !== 1) ctx.globalAlpha *= this.opacity;

        if (this.blendMode) ctx.globalCompositeOperation = this.blendMode;
        if (this.filter) ctx.filter = this.filter;

        this._renderSelf(ctx, config, currentTime);

        for (const child of this.children) child?.render?.(ctx, config, currentTime);

        ctx.restore();
    }

    /** Abstract method for subclasses to implement their specific drawing logic */
    protected abstract _renderSelf(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void;

    setOpacity(alpha: number): this {
        this.opacity = Math.max(0, Math.min(1, alpha));
        return this;
    }

    /** @deprecated Use opacity directly or setOpacity(). */
    get globalAlpha(): number {
        return this.opacity;
    }
    /** @deprecated Use opacity directly or setOpacity(). */
    set globalAlpha(v: number) {
        this.opacity = v;
    }
    /** @deprecated Use setOpacity(). */
    setGlobalAlpha(alpha: number): this {
        return this.setOpacity(alpha);
    }

    /** Control layout participation for this object and its descendants. */
    setLayoutParticipation(p: LayoutParticipation): this {
        this.layoutParticipation = p;
        return this;
    }
    /** @deprecated Use setLayoutParticipation() */
    setIncludeInLayoutBounds(include: boolean | undefined): this {
        this.layoutParticipation = include === true ? 'include' : include === false ? 'exclude' : 'auto';
        return this;
    }
    /** @deprecated Use layoutParticipation */
    get includeInLayoutBounds(): boolean | undefined {
        if (this.layoutParticipation === 'include') return true;
        if (this.layoutParticipation === 'exclude') return false;
        return undefined;
    }
    /** @deprecated Use layoutParticipation */
    set includeInLayoutBounds(v: boolean | undefined) {
        this.layoutParticipation = v === true ? 'include' : v === false ? 'exclude' : 'auto';
    }
    /** Set the Canvas 2D composite operation for this object's render scope. */
    setBlendMode(mode: GlobalCompositeOperation | null): this {
        this.blendMode = mode;
        return this;
    }
    /** Set a CSS filter (e.g. 'blur(8px)') applied to this object's render scope. */
    setFilter(filter: string | null): this {
        this.filter = filter;
        return this;
    }
    setPosition(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }
    setScale(x: number, y = x): this {
        this.scaleX = x;
        this.scaleY = y;
        return this;
    }
    setRotation(radians: number): this {
        this.rotation = radians;
        return this;
    }
    setSkew(x: number, y: number): this {
        this.skewX = x;
        this.skewY = y;
        return this;
    }
    setVisible(v: boolean): this {
        this.visible = v;
        return this;
    }
    addChild(child: (RenderObject & { [key: string]: any }) | null | undefined): this {
        if (child && !this.children.includes(child)) this.children.push(child as RenderObject);
        return this;
    }
    /** Add multiple children at once (skips null/undefined and dedupes) */
    addChildren(childrenToAdd: Array<(RenderObject & { [key: string]: any }) | null | undefined>): this {
        for (const c of childrenToAdd) {
            if (c && !this.children.includes(c)) this.children.push(c as RenderObject);
        }
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
    /**
     * Visual bounds of this object including its children (ignores includeInLayoutBounds flags).
     */
    getVisualBounds(): Bounds {
        let union: Bounds | null = this._getSelfBounds();
        for (const child of this.children) {
            if (!child) continue;
            const cb = child.getVisualBounds();
            union = RenderObject._unionBounds(union, cb);
        }
        // Fallback to empty if somehow null
        return union ?? { x: this.x, y: this.y, width: 0, height: 0 };
    }

    /**
     * Layout bounds honoring layoutParticipation semantics.
     * Returns null if excluded by policy.
     */
    getLayoutBounds(): Bounds | null {
        const policy: 'force-include' | 'force-exclude' | 'respect' =
            this.layoutParticipation === 'include'
                ? 'force-include'
                : this.layoutParticipation === 'exclude'
                  ? 'force-exclude'
                  : 'respect';
        return this._getLayoutBoundsRecursive(policy);
    }

    /** Back-compat: default getBounds to visual bounds. */
    getBounds(): Bounds {
        return this.getVisualBounds();
    }

    /**
     * Subclasses override to return only their own bounds (no children).
     * Base implementation has no intrinsic size.
     */
    protected _getSelfBounds(): Bounds | null {
        return { x: this.x, y: this.y, width: 0, height: 0 };
    }

    /** Recursively compute layout bounds based on a parent policy. */
    protected _getLayoutBoundsRecursive(parentPolicy: 'force-include' | 'force-exclude' | 'respect'): Bounds | null {
        if (parentPolicy === 'force-exclude') return null;

        // Determine this level's policy to pass to children
        const childPolicy: 'force-include' | 'force-exclude' | 'respect' =
            parentPolicy === 'force-include'
                ? 'force-include'
                : this.layoutParticipation === 'include'
                  ? 'force-include'
                  : this.layoutParticipation === 'exclude'
                    ? 'force-exclude'
                    : 'respect';

        // Determine whether to include self at this level
        const includeSelf = parentPolicy === 'force-include' || this.layoutParticipation !== 'exclude';

        let union: Bounds | null = includeSelf ? this._getSelfBounds() : null;

        for (const child of this.children) {
            if (!child) continue;
            const cb = child._getLayoutBoundsRecursive(childPolicy);
            if (cb) union = RenderObject._unionBounds(union, cb);
        }
        return union;
    }

    /**
     * Compute the world transform matrix matching the render() order:
     * M = T(x,y) * R(rotation) * S(scaleX,scaleY) * K(skewX,skewY) * T(-originX,-originY)
     */
    protected _getWorldTransformMatrix(): { a: number; b: number; c: number; d: number; e: number; f: number } {
        const sin = Math.sin(this.rotation || 0);
        const cos = Math.cos(this.rotation || 0);
        const kx = Math.tan(this.skewX || 0);
        const ky = Math.tan(this.skewY || 0);
        const sx = this.scaleX || 1;
        const sy = this.scaleY || 1;
        const px = this.originX || 0;
        const py = this.originY || 0;
        // helpers
        const multiply = (m1: any, m2: any) => ({
            a: m1.a * m2.a + m1.c * m2.b,
            b: m1.b * m2.a + m1.d * m2.b,
            c: m1.a * m2.c + m1.c * m2.d,
            d: m1.b * m2.c + m1.d * m2.d,
            e: m1.a * m2.e + m1.c * m2.f + m1.e,
            f: m1.b * m2.e + m1.d * m2.f + m1.f,
        });
        const T = (tx: number, ty: number) => ({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
        const R = (cs: number, sn: number) => ({ a: cs, b: sn, c: -sn, d: cs, e: 0, f: 0 });
        const S = (sx2: number, sy2: number) => ({ a: sx2, b: 0, c: 0, d: sy2, e: 0, f: 0 });
        const K = (kx2: number, ky2: number) => ({ a: 1, b: ky2, c: kx2, d: 1, e: 0, f: 0 });
        let M = T(this.x, this.y);
        M = multiply(M, R(cos, sin));
        M = multiply(M, S(sx, sy));
        M = multiply(M, K(kx, ky));
        if (px !== 0 || py !== 0) M = multiply(M, T(-px, -py));
        return M;
    }

    /** Transform a local point [lx,ly] into world space using this object's transform */
    protected _transformPoint(lx: number, ly: number): { x: number; y: number } {
        const M = this._getWorldTransformMatrix();
        return { x: M.a * lx + M.c * ly + M.e, y: M.b * lx + M.d * ly + M.f };
    }

    /**
     * Compute transformed AABB for a local axis-aligned rect (lx,ly,w,h) in this object's local space.
     */
    protected _computeTransformedRectBounds(lx: number, ly: number, w: number, h: number): Bounds {
        const pts = [
            this._transformPoint(lx, ly),
            this._transformPoint(lx + w, ly),
            this._transformPoint(lx + w, ly + h),
            this._transformPoint(lx, ly + h),
        ];
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    }

    /** Utility: union two bounds */
    private static _unionBounds(a: Bounds | null | undefined, b: Bounds | null | undefined): Bounds | null {
        const A = a ?? null;
        const B = b ?? null;
        if (!A && !B) return null;
        if (!A && B) return { ...B };
        if (!B && A) return { ...A };
        const minX = Math.min(A!.x, B!.x);
        const minY = Math.min(A!.y, B!.y);
        const maxX = Math.max(A!.x + A!.width, B!.x + B!.width);
        const maxY = Math.max(A!.y + A!.height, B!.y + B!.height);
        return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    }
}
