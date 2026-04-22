import type { PluginCapabilityMap } from '@core/scene/plugins/host-api/plugin-api';
import { timelineApi, audioApi, timingApi, utilitiesApi } from '@core/scene/plugins/plugin-sdk-capabilities';

// Public plugin SDK — domain-based re-exports. Keep this file intentionally narrow and stable.

export * from './sdk/scene';
export * from './sdk/render';
export * from './sdk/api';
export * from './sdk/timeline';
export * from './sdk/audio';
export * from './sdk/timing';
export * from './sdk/safety';
export * from './sdk/utils';
export * from './sdk/animation';
export * from './sdk/visual-assets';

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
 * 2. Export it from sdk/api.ts (or the relevant submodule) and ensure it re-exports here
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
