import { EmptyRenderObject } from './empty';
import type { Bounds, RenderConfig } from './base';
import type { PerspectiveCompositor } from '../perspective-compositor';
import {
    applyAffinePoint,
    createPerspectiveCameraWarp,
    createHomography,
    getProjectedBounds,
    isIdentityPerspectiveWarp,
    invertAffineTransform,
    perspectiveWarpPoints,
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
import type { Matrix2D } from '@state/scene-graph';

export class PerspectiveElementRoot extends EmptyRenderObject {
    private _perspectiveWarp: PerspectiveWarp;
    readonly elementId: string | null;
    visualBounds?: Bounds;
    private _warpMatrix: Homography | null = null;
    private _warpInvalidReason?: string;
    private _isPerspectiveEdgeOn: boolean;
    private _resolvedAncestorTransform: Matrix2D = [1, 0, 0, 1, 0, 0];
    private _cameraProjection: PerspectiveCameraProjection | null = null;
    private _cameraViewport: PerspectiveViewport | null = null;
    private _linkCameraPivotToNode = false;
    private _resolvedNodePivot: PerspectivePoint | null = null;
    /**
     * A blend mode shared by the element's direct visual children. Perspective
     * rendering rasterizes those children into an isolated surface, so this is
     * applied only when the warped surface is composited onto the scene.
     */
    private _outputBlendMode: GlobalCompositeOperation | null = null;

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

    get outputBlendMode(): GlobalCompositeOperation | null {
        return this._outputBlendMode;
    }

    setOutputBlendMode(mode: GlobalCompositeOperation | null): this {
        this._outputBlendMode = mode;
        return this;
    }

    configureCamera(
        projection: PerspectiveCameraProjection,
        viewport: PerspectiveViewport,
        linkPivotToNode = false
    ): void {
        this._cameraProjection = { ...projection };
        this._cameraViewport = { ...viewport };
        this._linkCameraPivotToNode = linkPivotToNode;
        this._recomputeCameraWarp();
    }

    private _recomputeCameraWarp(): void {
        const projection = this._cameraProjection;
        const viewport = this._cameraViewport;
        if (!projection || !viewport || !this.baseBounds) return;
        let resolvedProjection = projection;
        if (this._linkCameraPivotToNode && this._resolvedNodePivot) {
            this._resolveOriginFractions();
            const local = this._getWorldTransformMatrix();
            const inverseLocal = invertAffineTransform(local);
            if (inverseLocal) {
                const localPivot = applyAffinePoint(inverseLocal, this._resolvedNodePivot);
                resolvedProjection = {
                    ...projection,
                    pivotX: (localPivot.x - this.baseBounds.x) / this.baseBounds.width,
                    pivotY: (localPivot.y - this.baseBounds.y) / this.baseBounds.height,
                };
            }
        }
        const result = createPerspectiveCameraWarp(
            this.baseBounds,
            this.getAffineTransform(),
            viewport,
            resolvedProjection
        );
        this._perspectiveWarp = result.warp;
        this._isPerspectiveEdgeOn = result.kind === 'edge-on';
        this._warpInvalidReason = result.kind === 'invalid' ? result.reason : undefined;
        this._warpMatrix = result.kind === 'projected' ? createHomography(result.warp) : null;
    }

    get warpInvalidReason(): string | undefined {
        return this._warpInvalidReason;
    }

    getAffineTransform(): AffineTransform {
        this._resolveOriginFractions();
        const local = this._getWorldTransformMatrix();
        const [a, b, c, d, e, f] = this._resolvedAncestorTransform;
        return {
            a: a * local.a + c * local.b,
            b: b * local.a + d * local.b,
            c: a * local.c + c * local.d,
            d: b * local.c + d * local.d,
            e: a * local.e + c * local.f + e,
            f: b * local.e + d * local.f + f,
        };
    }

    setResolvedAncestorTransform(matrix: Matrix2D): void {
        this._resolvedAncestorTransform = [...matrix];
        this._recomputeCameraWarp();
    }

    setResolvedNodeTransform(matrix: Matrix2D, pivot: PerspectivePoint): void {
        this._resolvedAncestorTransform = [...matrix];
        this._resolvedNodePivot = { ...pivot };
        this._recomputeCameraWarp();
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
            return points.some((point) => !point) ? null : (points as PerspectivePoint[]);
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
        // A plane with no projected area must not fall through to the affine
        // renderer: that would make an edge-on element appear untransformed.
        if (this._isPerspectiveEdgeOn) return true;
        if (!this._warpMatrix || !this.baseBounds) return false;
        if (isIdentityPerspectiveWarp(this.perspectiveWarp)) {
            this.render(ctx, config, currentTime);
            compositor.recordIdentityWarp();
            return true;
        }
        return compositor.renderElement(this, ctx, config, currentTime);
    }

    override render(ctx: CanvasRenderingContext2D, config: RenderConfig, currentTime: number): void {
        if (this._isPerspectiveEdgeOn) return;
        // Direct rendering (including deterministic GPU fallback) retains the old affine result.
        ctx.save();
        ctx.transform(...this._resolvedAncestorTransform);
        super.render(ctx, config, currentTime);
        ctx.restore();
    }

    protected override _getSelfBounds(): Bounds {
        if (this._isPerspectiveEdgeOn && this.baseBounds) {
            const affine = this.getAffineTransform();
            const corners = perspectiveWarpPoints(this._perspectiveWarp).map((point) =>
                applyAffinePoint(affine, {
                    x: this.baseBounds!.x + point.x * this.baseBounds!.width,
                    y: this.baseBounds!.y + point.y * this.baseBounds!.height,
                })
            );
            const bounds = getProjectedBounds(corners);
            if (bounds) {
                // Keep the collapsed edge selectable without turning it into a
                // large affine fallback box. One logical pixel on either side
                // gives a stable hit target for a horizontal, vertical, or
                // diagonal projected edge.
                const edgePadding = 1;
                this._worldCorners = corners;
                return {
                    x: bounds.x - edgePadding,
                    y: bounds.y - edgePadding,
                    width: bounds.width + edgePadding * 2,
                    height: bounds.height + edgePadding * 2,
                };
            }
        }
        const corners = this.getProjectedCorners();
        if (!corners) return super._getSelfBounds();
        this._worldCorners = corners;
        return getProjectedBounds(corners) ?? super._getSelfBounds();
    }
}
