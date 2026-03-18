import { registerFeatureRequirements, type AudioFeatureRequirement } from '@audio/audioElementMetadata';

// Public plugin SDK exports. Keep this file intentionally narrow and stable.
export {
    SceneElement,
    asNumber,
    asBoolean,
    asString,
    asTrimmedString,
    type PropertyTransform,
    type PropertyDescriptor,
    type PropertyDescriptorMap,
    type PropertySnapshot,
} from '@core/scene/elements/base';
export {
    RenderObject,
    EmptyRenderObject,
    Rectangle,
    Text,
    Line,
    Image,
    AnimatedGif,
    Poly,
    BezierPath,
    Arc,
} from '@core/render/render-objects';
export {
    PLUGIN_API_VERSION,
    PLUGIN_CAPABILITIES,
    type PluginHostApi,
    type PluginHostCapability,
} from '@core/scene/plugins/host-api/plugin-api';
export {
    getPluginHostApi,
    type PluginHostApiResolution,
    type PluginHostApiStatus,
} from '@core/scene/plugins/host-api/get-plugin-host-api';
export { registerFeatureRequirements };
export type { AudioFeatureRequirement };
export type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
