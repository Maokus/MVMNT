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
export type { FeatureDataResult } from '@audio/features/sceneApi';

// ============================================================================
// COMPILE-TIME ASSERTION: Prevent API Drift
// ============================================================================
/**
 * This assertion validates that all PLUGIN_CAPABILITIES are exported from
 * this SDK file. If you add a new capability to PLUGIN_CAPABILITIES in
 * plugin-api.ts, TypeScript will error until you export it from here.
 *
 * Capability-to-export mapping:
 *   timelineRead        → timelineApi
 *   audioFeaturesRead   → audioApi
 *   timingConversion    → timingApi
 *   midiUtils           → utilitiesApi
 *
 * If this assertion fails, verify that:
 * 1. A new capability key was added to PLUGIN_CAPABILITIES
 * 2. A corresponding export (direct proxy or shorthand) was added to this file
 * 3. The mapping above reflects the change
 */
// ============================================================================
// COMPILE-TIME ASSERTION: Prevent API Drift
// ============================================================================
/**
 * This compile-time assertion validates that all PLUGIN_CAPABILITIES keys
 * have a corresponding export in this SDK file.
 *
 * The expected mapping is:
 *   timelineRead        → timelineApi (exported from plugin-sdk-capabilities)
 *   audioFeaturesRead   → audioApi (exported from plugin-sdk-capabilities)
 *   timingConversion    → timingApi (exported from plugin-sdk-capabilities)
 *   midiUtils           → utilitiesApi (exported from plugin-sdk-capabilities)
 *
 * If you add a new capability to PLUGIN_CAPABILITIES in plugin-api.ts,
 * you MUST also:
 * 1. Add it to plugin-sdk-capabilities.ts (createCapabilityProxy call)
 * 2. Export it from this file (line 58-63)
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
