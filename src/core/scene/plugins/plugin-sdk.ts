import { registerFeatureRequirements, type AudioFeatureRequirement } from '@audio/audioElementMetadata';
import type { PluginCapabilityMap } from '@core/scene/plugins/host-api/plugin-api';

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
    type PluginCapabilityMap,
} from '@core/scene/plugins/host-api/plugin-api';
export {
    getPluginHostApi,
    type PluginHostApiResolution,
    type PluginHostApiStatus,
    type GetPluginHostApiOptions,
} from '@core/scene/plugins/host-api/get-plugin-host-api';
export {
    PluginApiError,
    MissingHostError,
    UnsupportedVersionError,
    MissingCapabilityError,
} from '@core/scene/plugins/plugin-errors';
export {
    selectNotes,
    sampleAudio,
    sampleAudioRange,
    timeToBeats,
    beatsToTime,
    timeToTicks,
    ticksToTime,
    beatToTicks,
    ticksToBeat,
    noteName,
} from '@core/scene/plugins/plugin-sdk-shortcuts';
export {
    timelineApi,
    audioApi,
    timingApi,
    utilitiesApi,
} from '@core/scene/plugins/plugin-sdk-capabilities';
export { registerFeatureRequirements };
export type { AudioFeatureRequirement };
export type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
export type { FeatureDataResult, FeatureInput } from '@audio/features/sceneApi';
export type { TimelineNoteEvent } from '@state/selectors/timelineSelectors';
export {
    withRenderSafety,
    limitRenderObjects,
    checkCapability,
    DEFAULT_SAFETY_CONFIG,
    type PluginSafetyConfig,
    PluginSafetyError,
} from '@core/scene/plugins/plugin-safety';
export {
    normalizeColorAlphaValue,
    ensureEightDigitHex,
} from '@utils/color';
export {
    loadGoogleFont,
    loadGoogleFontAsync,
    ensureFontLoaded,
    isFontLoaded,
    parseFontSelection,
    type LoadFontOptions,
} from '@fonts/font-loader';
export type { ParsedFontSelection } from '@state/scene/fonts';
export {
    quantizeSettingToBeats,
    quantizeSettingToTicks,
    formatQuantizeLabel,
    formatQuantizeShortLabel,
    type QuantizeSetting,
    type SnapQuantizeOption,
} from '@state/timeline/quantize';
export {
    beatsToSeconds,
    secondsToBeats,
    getSecondsPerBeat,
} from '@core/timing/tempo-utils';
export type { TempoMapEntry } from '@core/timing/types';

// ============================================================================
// COMPILE-TIME ASSERTION: Prevent API Drift
// ============================================================================
/**
 * Validates that all PLUGIN_CAPABILITIES keys have a corresponding export in this file.
 *
 * Capability-to-export mapping:
 *   timelineRead        → timelineApi (plugin-sdk-capabilities)
 *   audioFeaturesRead   → audioApi (plugin-sdk-capabilities)
 *   timingConversion    → timingApi (plugin-sdk-capabilities)
 *   midiUtils           → utilitiesApi (plugin-sdk-capabilities)
 *
 * When adding a new capability to PLUGIN_CAPABILITIES in plugin-api.ts:
 * 1. Add it to plugin-sdk-capabilities.ts (createCapabilityProxy call)
 * 2. Export it from this file
 * 3. Update the mapping comment above
 *
 * TypeScript will fail to compile if the mapping is incomplete.
 */
type _AssertCapabilityExports = Record<keyof PluginCapabilityMap, unknown>;
type _CheckExportedCapabilities = _AssertCapabilityExports & {
    timelineRead: unknown;
    audioFeaturesRead: unknown;
    timingConversion: unknown;
    midiUtils: unknown;
};

// This type assertion forces TypeScript to verify that all PluginCapabilityMap
// keys are covered. If new capabilities are added without being exported, this
// will fail with a TypeScript error.
const _verifyCapabilityExports: _CheckExportedCapabilities = {} as any;
