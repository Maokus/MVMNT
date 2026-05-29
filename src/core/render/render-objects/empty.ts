import { RenderObject, RenderConfig, Bounds } from './base';

interface AnchorVisualizationData {
    layoutBounds: Bounds;
    visualBounds: Bounds;
    anchorX: number;
    anchorY: number;
}

export class EmptyRenderObject extends RenderObject {
    anchorVisualizationData?: AnchorVisualizationData;
    baseBounds?: Bounds; // injected externally
    _worldCorners?: { x: number; y: number }[];

    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1, options?: { includeInLayoutBounds?: boolean }) {
        super(x, y, scaleX, scaleY, opacity);
        // Default: empty containers are excluded from layout bounds unless opted-in.
        this.layoutParticipation = options?.includeInLayoutBounds === true ? 'include' : 'exclude';
    }

    /** @deprecated Use setOriginFraction() */
    setAnchorOffset(ax: number, ay: number): this {
        this.pivotX = ax;
        this.pivotY = ay;
        return this;
    }

    /** @deprecated Use layoutParticipation + pivotX/Y directly */
    get anchorOffsetX(): number { return this.pivotX; }
    /** @deprecated Use layoutParticipation + pivotX/Y directly */
    set anchorOffsetX(v: number) { this.pivotX = v; }
    /** @deprecated Use layoutParticipation + pivotX/Y directly */
    get anchorOffsetY(): number { return this.pivotY; }
    /** @deprecated Use layoutParticipation + pivotY directly */
    set anchorOffsetY(v: number) { this.pivotY = v; }

    /** @deprecated Use setOriginFraction() */
    get anchorFraction(): { x: number; y: number } | undefined {
        if (this._pivotFractionX === null) return undefined;
        return { x: this._pivotFractionX, y: this._pivotFractionY ?? 0 };
    }
    /** @deprecated Use setOriginFraction() */
    set anchorFraction(v: { x: number; y: number } | undefined) {
        if (v) { this._pivotFractionX = v.x; this._pivotFractionY = v.y; }
        else { this._pivotFractionX = null; this._pivotFractionY = null; }
    }

    setAnchorVisualizationData(layoutBounds: Bounds, visualBounds: Bounds, anchorX: number, anchorY: number): this {
        this.anchorVisualizationData = { layoutBounds, visualBounds, anchorX, anchorY };
        return this;
    }

    /** Resolve lazy origin fractions using baseBounds when available. */
    private _resolveOriginFractions(): void {
        if (this.baseBounds) {
            if (this._pivotFractionX !== null) {
                this.pivotX = this.baseBounds.x + this._pivotFractionX * this.baseBounds.width;
            }
            if (this._pivotFractionY !== null) {
                this.pivotY = this.baseBounds.y + this._pivotFractionY * this.baseBounds.height;
            }
        }
    }

    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;
        this._resolveOriginFractions();
        ctx.save();
        this._applyLayerTransform(ctx);
        if (this.opacity !== 1) ctx.globalAlpha *= this.opacity;
        if (this.blendMode) ctx.globalCompositeOperation = this.blendMode;
        if (this.filter) ctx.filter = this.filter;
        for (const child of this.getChildren()) child.render(ctx, config, currentTime);
        if (config.showAnchorPoints && this.anchorVisualizationData) {
            this.renderAnchorVisualization(
                ctx,
                this.anchorVisualizationData.visualBounds,
                this.anchorVisualizationData.layoutBounds,
                this.anchorVisualizationData.anchorX,
                this.anchorVisualizationData.anchorY
            );
        }
        ctx.restore();
    }

    protected _applyLayerTransform(ctx: CanvasRenderingContext2D): void {
        ctx.translate(this.x, this.y);
        if (this.rotation !== 0) ctx.rotate(this.rotation);
        if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
        if (this.skewX !== 0 || this.skewY !== 0) {
            ctx.transform(1, Math.tan(this.skewY), Math.tan(this.skewX), 1, 0, 0);
        }
        if (this.pivotX !== 0 || this.pivotY !== 0) ctx.translate(-this.pivotX, -this.pivotY);
    }

    // intentionally empty
    protected _renderSelf(): void {
        /* no-op */
    }

    override getVisualBounds(): Bounds {
        if (this.baseBounds) {
            return this._getSelfBounds();
        }
        return super.getVisualBounds();
    }

    protected override _getLayoutBoundsRecursive(
        parentPolicy: 'force-include' | 'force-exclude' | 'respect'
    ): Bounds | null {
        if (!this.baseBounds) {
            return super._getLayoutBoundsRecursive(parentPolicy);
        }
        if (parentPolicy === 'force-exclude') {
            return null;
        }
        if (parentPolicy === 'force-include' || this.layoutParticipation !== 'exclude') {
            return this._getSelfBounds();
        }
        return null;
    }

    renderAnchorVisualization(
        ctx: CanvasRenderingContext2D,
        visualBounds: Bounds,
        layoutBounds: Bounds,
        anchorX: number,
        anchorY: number
    ): void {
        const v = visualBounds;
        const l = layoutBounds;
        if (!v || v.width <= 0 || v.height <= 0) return;
        if (!l || l.width <= 0 || l.height <= 0) return;
        const anchorPixelX = l.x + l.width * anchorX;
        const anchorPixelY = l.y + l.height * anchorY;
        ctx.save();
        // Visual bounds (cyan dashed)
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(v.x, v.y, v.width, v.height);
        ctx.setLineDash([]);
        // Layout bounds (magenta dotted)
        ctx.strokeStyle = '#FF00FF';
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(l.x, l.y, l.width, l.height);
        ctx.setLineDash([]);
        // Anchor crosshair and label (yellow), based on layout bounds
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(l.x, anchorPixelY);
        ctx.lineTo(l.x + l.width, anchorPixelY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(anchorPixelX, l.y);
        ctx.lineTo(anchorPixelX, l.y + l.height);
        ctx.stroke();
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(anchorPixelX - 5, anchorPixelY - 5, 10, 10);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const text = `Anchor: (${anchorX.toFixed(2)}, ${anchorY.toFixed(2)})`;
        const textMetrics = ctx.measureText(text);
        const textX = anchorPixelX + 15;
        const textY = anchorPixelY - 15;
        const textWidth = textMetrics.width;
        const textHeight = 14;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(textX - 2, textY - 2, textWidth + 4, textHeight + 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, textX, textY);
        ctx.restore();
    }

    protected _getSelfBounds(): Bounds {
        if (!this.baseBounds) {
            return { x: this.x, y: this.y, width: 0, height: 0 };
        }
        this._resolveOriginFractions();
        const { x, y, width, height } = this.baseBounds;
        const worldCorners = [
            this._transformPoint(x, y),
            this._transformPoint(x + width, y),
            this._transformPoint(x + width, y + height),
            this._transformPoint(x, y + height),
        ];
        this._worldCorners = worldCorners;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const point of worldCorners) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
        return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    }
}
