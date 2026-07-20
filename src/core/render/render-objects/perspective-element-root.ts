import { EmptyRenderObject } from './empty';
import type { Bounds, RenderConfig } from './base';
import type { PerspectiveCompositor } from '../perspective-compositor';
import {
    applyAffinePoint,
    createHomography,
    getProjectedBounds,
    isIdentityPerspectiveWarp,
    projectPerspectivePoint,
    validatePerspectiveWarp,
    warpLocalPoint,
    type AffineTransform,
    type Homography,
    type PerspectivePoint,
    type PerspectiveWarp,
} from '@math/perspective-warp';

export class PerspectiveElementRoot extends EmptyRenderObject {
    readonly perspectiveWarp: PerspectiveWarp;
    readonly elementId: string | null;
    visualBounds?: Bounds;
    private _warpMatrix: Homography | null = null;
    private _warpInvalidReason?: string;

    constructor(
        elementId: string | null,
        warp: PerspectiveWarp,
        x = 0,
        y = 0,
        scaleX = 1,
        scaleY = 1,
        opacity = 1
    ) {
        super(x, y, scaleX, scaleY, opacity);
        this.elementId = elementId;
        this.perspectiveWarp = warp;
        const validation = validatePerspectiveWarp(warp);
        if (validation.valid) this._warpMatrix = createHomography(warp);
        else this._warpInvalidReason = validation.reason;
    }

    get warpMatrix(): Homography | null {
        return this._warpMatrix;
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
