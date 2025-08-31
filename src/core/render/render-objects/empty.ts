import { RenderObject, RenderConfig, Bounds } from './base';

interface AnchorVisualizationData {
    layoutBounds: Bounds;
    visualBounds: Bounds;
    anchorX: number;
    anchorY: number;
}

export class EmptyRenderObject extends RenderObject {
    anchorOffsetX: number;
    anchorOffsetY: number;
    anchorVisualizationData?: AnchorVisualizationData;
    baseBounds?: Bounds; // injected externally
    anchorFraction?: { x: number; y: number };
    _worldCorners?: { x: number; y: number }[];

    constructor(x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1, options?: { includeInLayoutBounds?: boolean }) {
        super(x, y, scaleX, scaleY, opacity, { includeInLayoutBounds: options?.includeInLayoutBounds ?? false });
        this.anchorOffsetX = 0;
        this.anchorOffsetY = 0;
        // Default remains: an empty container shouldn't affect layout bounds unless opted-in
    }

    setAnchorOffset(anchorOffsetX: number, anchorOffsetY: number): this {
        this.anchorOffsetX = anchorOffsetX;
        this.anchorOffsetY = anchorOffsetY;
        return this;
    }
    setAnchorVisualizationData(layoutBounds: Bounds, visualBounds: Bounds, anchorX: number, anchorY: number): this {
        this.anchorVisualizationData = { layoutBounds, visualBounds, anchorX, anchorY };
        return this;
    }

    render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (!this.visible || this.opacity <= 0) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1 || this.skewX !== 0 || this.skewY !== 0) {
            ctx.translate(this.anchorOffsetX, this.anchorOffsetY);
            if (this.rotation !== 0) ctx.rotate(this.rotation);
            if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
            if (this.skewX !== 0 || this.skewY !== 0) {
                const transform: [number, number, number, number, number, number] = [
                    1,
                    Math.tan(this.skewY),
                    Math.tan(this.skewX),
                    1,
                    0,
                    0,
                ];
                ctx.transform(...transform);
            }
            ctx.translate(-this.anchorOffsetX, -this.anchorOffsetY);
        }
        if (this.opacity !== 1) ctx.globalAlpha *= this.opacity;
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

    // intentionally empty
    protected _renderSelf(): void {
        /* no-op */
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

    getBounds(): Bounds {
        const metaBase = this.baseBounds;
        if (!metaBase) {
            if (this.getChildren().length === 0) return { x: this.x, y: this.y, width: 0, height: 0 };
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            for (const child of this.getChildren()) {
                const b = child.getBounds();
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
            }
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        const b = metaBase;
        const anchorFrac = this.anchorFraction || { x: 0.5, y: 0.5 };
        const anchorX = b.x + b.width * anchorFrac.x;
        const anchorY = b.y + b.height * anchorFrac.y;
        const sin = Math.sin(this.rotation || 0);
        const cos = Math.cos(this.rotation || 0);
        const skewX = Math.tan(this.skewX || 0);
        const skewY = Math.tan(this.skewY || 0);
        const sx = this.scaleX || 1;
        const sy = this.scaleY || 1;
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
        const S = (sx: number, sy: number) => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
        const K = (kx: number, ky: number) => ({ a: 1, b: ky, c: kx, d: 1, e: 0, f: 0 });
        let M = T(this.x, this.y);
        M = multiply(M, T(anchorX, anchorY));
        M = multiply(M, R(cos, sin));
        M = multiply(M, S(sx, sy));
        M = multiply(M, K(skewX, skewY));
        M = multiply(M, T(-anchorX, -anchorY));
        const corners: [number, number][] = [
            [b.x, b.y],
            [b.x + b.width, b.y],
            [b.x + b.width, b.y + b.height],
            [b.x, b.y + b.height],
        ];
        const txPt = (pt: [number, number]) => ({
            x: M.a * pt[0] + M.c * pt[1] + M.e,
            y: M.b * pt[0] + M.d * pt[1] + M.f,
        });
        const worldCorners = corners.map(txPt);
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const p of worldCorners) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        this._worldCorners = worldCorners;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
}
