import { registerFeatureRequirements, type AudioFeatureRequirement } from '@audio/audioElementMetadata';
import type { PluginCapabilityMap } from '@core/scene/plugins/host-api/plugin-api';
import { timelineApi, audioApi, timingApi, utilitiesApi } from '@core/scene/plugins/plugin-sdk-capabilities';

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
    GlowLayer,
    CompositeLayer,
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
    selectAllNotes,
    selectDistinctNotes,
    selectNotesByPitch,
    getNoteRange,
    getTimelineDuration,
    getMidiTracks,
    groupNotesByPitch,
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
};
export { registerFeatureRequirements };
export type { AudioFeatureRequirement };
export type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
export type { FeatureDataResult, FeatureInput } from '@audio/features/sceneApi';
export type { TimelineNoteEvent, TempoMapEntry } from '@core/timing/types';
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

// ============================================================================
// COMPILE-TIME ASSERTION: Prevent API Drift
// ============================================================================
/**
 * Maps every PLUGIN_CAPABILITIES key to its exported API proxy.
 * TypeScript will error here if a new capability is added to plugin-api.ts
 * but not exported from this file and listed in this map.
 *
 * When adding a new capability:
 * 1. Add it to plugin-sdk-capabilities.ts (createCapabilityProxy call)
 * 2. Export it from this file
 * 3. Add the key → export mapping below
 */
type _CapabilityExportMap = Record<keyof PluginCapabilityMap, unknown>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _verifyCapabilityExports = {
    timelineRead: timelineApi,
    audioFeaturesRead: audioApi,
    timingConversion: timingApi,
    midiUtils: utilitiesApi,
} satisfies _CapabilityExportMap;
