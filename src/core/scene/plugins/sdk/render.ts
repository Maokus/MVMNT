/**
 * Render objects: all canvas primitives available to plugin scene elements.
 *
 * @module @mvmnt/plugin-sdk/render
 */

export {
    RenderObject,
    BoxRenderObject,
    EmptyRenderObject,
    Rectangle,
    Text,
    Line,
    Poly,
    BezierPath,
    Arc,
    GlowLayer,
    CompositeLayer,
    ClipLayer,
    VisualMedia,
    type FramePlacement,
    type FramePlacementPreset,
    type FramePlacementCustom,
    type VisualMediaOptions,
    PixelGrid,
} from '@core/render/render-objects';
export type { RenderConfig } from '@core/render/render-objects/base';
