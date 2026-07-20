import { EmptyRenderObject } from './empty';
import type { Bounds, RenderConfig } from './base';
import type { PerspectiveCompositor } from '../perspective-compositor';
import {
    applyAffinePoint,
    createPerspectiveCameraWarp,
    createHomography,
    getProjectedBounds,
    isIdentityPerspectiveWarp,
    projectPerspectivePoint,
    validatePerspectiveWarp,
    warpLocalPoint,
    type AffineTransform,
    type Homography,
    type PerspectivePoint,
    type PerspectiveCameraProjection,
    type PerspectiveViewport,
    type PerspectiveWarp,
} from '@math/perspective-warp';

export class PerspectiveElementRoot extends EmptyRenderObject {
    private _perspectiveWarp: PerspectiveWarp;
    readonly elementId: string | null;
    visualBounds?: Bounds;
    private _warpMatrix: Homography | null = null;
    private _warpInvalidReason?: string;
    private _isPerspectiveEdgeOn: boolean;

    constructor(
        elementId: string | null,
        warp: PerspectiveWarp,
        x = 0,
        y = 0,
        scaleX = 1,
        scaleY = 1,
        opacity = 1,
        isPerspectiveEdgeOn = false
    ) {
        super(x, y, scaleX, scaleY, opacity);
        this.elementId = elementId;
        this._perspectiveWarp = warp;
        this._isPerspectiveEdgeOn = isPerspectiveEdgeOn;
        // An edge-on plane has no drawable area. Marking the root invisible
        // avoids treating the degenerate projection as an invalid warp and
        // falling back to its ordinary affine rendering.
        if (isPerspectiveEdgeOn) this.visible = false;
        const validation = validatePerspectiveWarp(warp);
        if (validation.valid) this._warpMatrix = createHomography(warp);
        else this._warpInvalidReason = validation.reason;
    }

    get warpMatrix(): Homography | null {
        return this._warpMatrix;
    }

    get perspectiveWarp(): PerspectiveWarp {
        return this._perspectiveWarp;
    }

    get isPerspectiveEdgeOn(): boolean {
        return this._isPerspectiveEdgeOn;
    }

    configureCamera(projection: PerspectiveCameraProjection, viewport: PerspectiveViewport): void {
        if (!this.baseBounds) return;
        const result = createPerspectiveCameraWarp(this.baseBounds, this.getAffineTransform(), viewport, projection);
        this._perspectiveWarp = result.warp;
        this._isPerspectiveEdgeOn = result.kind === 'edge-on';
        this._warpInvalidReason = result.kind === 'invalid' ? result.reason : undefined;
        this._warpMatrix = result.kind === 'projected' ? createHomography(result.warp) : null;
        if (result.kind === 'edge-on') this.visible = false;
    }

    get warpInvalidReason(): string | undefined {
        return this._warpInvalidReason;
    }

    getAffineTransform(): AffineTransform {
        this._resolveOriginFractions();
        return this._getWorldTransformMatrix();
    }

    getProjectedCorners(): PerspectivePoint[] | null {
        if (!this.baseBounds || !this._warpMatrix) return null;
        const { x, y, width, height } = this.baseBounds;
        const localCorners = [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
        ];
        const affine = this.getAffineTransform();
        const projected = localCorners.map((point) => warpLocalPoint(this._warpMatrix!, this.baseBounds!, point));
        if (projected.some((point) => !point)) return null;
        return (projected as PerspectivePoint[]).map((point) => applyAffinePoint(affine, point));
    }

    projectNormalizedPoint(point: PerspectivePoint): PerspectivePoint | null {
        if (!this.baseBounds || !this._warpMatrix) return null;
        const warped = projectPerspectivePoint(this._warpMatrix, point);
        if (!warped) return null;
        const local = {
            x: this.baseBounds.x + warped.x * this.baseBounds.width,
            y: this.baseBounds.y + warped.y * this.baseBounds.height,
        };
        return applyAffinePoint(this.getAffineTransform(), local);
    }

    private projectLocalPoint(point: PerspectivePoint): PerspectivePoint | null {
        if (!this.baseBounds || !this._warpMatrix) return null;
        const warped = warpLocalPoint(this._warpMatrix, this.baseBounds, point);
        return warped ? applyAffinePoint(this.getAffineTransform(), warped) : null;
    }

    /** Draw the ordinary anchor debug information in projected world space. */
    renderProjectedAnchorVisualization(ctx: CanvasRenderingContext2D): void {
        const data = this.anchorVisualizationData;
        if (!data || !this.baseBounds || !this._warpMatrix) return;

        const projectRect = (bounds: Bounds): PerspectivePoint[] | null => {
            const points = [
                { x: bounds.x, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                { x: bounds.x, y: bounds.y + bounds.height },
            ].map((point) => this.projectLocalPoint(point));
            return points.some((point) => !point) ? null : points as PerspectivePoint[];
        };
        const drawPolygon = (points: PerspectivePoint[] | null, color: string, dash: number[]) => {
            if (!points) return;
            ctx.strokeStyle = color;
            ctx.setLineDash(dash);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
            ctx.closePath();
            ctx.stroke();
        };

        const layout = data.layoutBounds;
        const anchorLocal = {
            x: layout.x + layout.width * data.anchorX,
            y: layout.y + layout.height * data.anchorY,
        };
        const anchor = this.projectLocalPoint(anchorLocal);
        const horizontalStart = this.projectLocalPoint({ x: layout.x, y: anchorLocal.y });
        const horizontalEnd = this.projectLocalPoint({ x: layout.x + layout.width, y: anchorLocal.y });
        const verticalStart = this.projectLocalPoint({ x: anchorLocal.x, y: layout.y });
        const verticalEnd = this.projectLocalPoint({ x: anchorLocal.x, y: layout.y + layout.height });
        if (!anchor || !horizontalStart || !horizontalEnd || !verticalStart || !verticalEnd) return;

        ctx.save();
        ctx.globalAlpha *= this.opacity;
        ctx.lineWidth = 1;
        drawPolygon(projectRect(data.visualBounds), '#00FFFF', [5, 5]);
        drawPolygon(projectRect(layout), '#FF00FF', [2, 4]);
        ctx.setLineDash([]);
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(horizontalStart.x, horizontalStart.y);
        ctx.lineTo(horizontalEnd.x, horizontalEnd.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(verticalStart.x, verticalStart.y);
        ctx.lineTo(verticalEnd.x, verticalEnd.y);
        ctx.stroke();
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(anchor.x - 5, anchor.y - 5, 10, 10);
        const text = `Anchor: (${data.anchorX.toFixed(2)}, ${data.anchorY.toFixed(2)})`;
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const textX = anchor.x + 15;
        const textY = anchor.y - 15;
        const textWidth = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(textX - 2, textY - 2, textWidth + 4, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, textX, textY);
        ctx.restore();
    }

    renderPerspective(
        compositor: PerspectiveCompositor,
        ctx: CanvasRenderingContext2D,
        config: RenderConfig,
        currentTime: number
    ): boolean {
        if (!this.visible || this.opacity <= 0) return true;
        if (!this._warpMatrix || !this.baseBounds) return false;
        if (isIdentityPerspectiveWarp(this.perspectiveWarp)) {
            super.render(ctx, config, currentTime);
            compositor.recordIdentityWarp();
            return true;
        }
        return compositor.renderElement(this, ctx, config, currentTime);
    }

    override render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        // Direct rendering (including deterministic GPU fallback) retains the old affine result.
        super.render(ctx, config, currentTime);
    }

    protected override _getSelfBounds(): Bounds {
        const corners = this.getProjectedCorners();
        if (!corners) return super._getSelfBounds();
        this._worldCorners = corners;
        return getProjectedBounds(corners) ?? super._getSelfBounds();
    }

}
