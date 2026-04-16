/**
 * Render safety: guards for preventing run-away render loops and capability checks.
 *
 * @module @mvmnt/plugin-sdk/safety
 */

export {
    withRenderSafety,
    limitRenderObjects,
    checkCapability,
    DEFAULT_SAFETY_CONFIG,
    type PluginSafetyConfig,
    PluginSafetyError,
} from '@core/scene/plugins/plugin-safety';
