/**
 * Direct capability API imports for plugins.
 *
 * These allow plugins to import specific capabilities directly:
 *   import { timelineApi, audioApi } from '@mvmnt/plugin-sdk';
 *
 * This approach:
 * - Makes dependencies explicit at import time
 * - Enables better tree-shaking
 * - Provides clear error messages if capabilities are missing
 *
 * Error handling: throws PluginApiError if the capability is not available
 */

import { getPluginHostApi } from './host-api/get-plugin-host-api';
import {
    PLUGIN_CAPABILITIES,
    type PluginHostApi,
    type PluginTimelineApi,
    type PluginAudioApi,
    type PluginTimingApi,
    type PluginUtilityApi,
    type PluginAudioCalculatorApi,
} from './host-api/plugin-api';

/**
 * Create a lazy proxy that calls getPluginHostApi() on first access
 * and throws if the required capability is missing
 */
function createCapabilityProxy<T extends object>(
    capabilityKey: keyof typeof PLUGIN_CAPABILITIES,
    getter: (api: PluginHostApi) => T
): T {
    return new Proxy({} as T, {
        get(target, prop) {
            const { api, status } = getPluginHostApi();

            if (status !== 'ok' || !api) {
                const capability = PLUGIN_CAPABILITIES[capabilityKey];
                const error = new Error(
                    `[PluginApi] Cannot access ${String(prop)} on ${capabilityKey}: ` +
                        `capability "${capability}" is not available. ` +
                        `Status: ${status}`
                );
                if (api) {
                    api.emitError(error, capability);
                }
                throw error;
            }

            const apiSection = getter(api);
            const value = (apiSection as any)[prop];

            if (typeof value === 'function') {
                return function (...args: any[]) {
                    return value.apply(apiSection, args);
                };
            }

            return value;
        },
    }) as T;
}

/**
 * Direct access to the timeline API
 * Throws if timeline.read capability is missing
 *
 * @example
 *   import { timelineApi } from '@mvmnt/plugin-sdk';
 *   const notes = timelineApi.selectNotesInWindow({...});
 */
export const timelineApi: PluginTimelineApi = createCapabilityProxy('timelineRead', (api) => api.timeline);

/**
 * Direct access to the audio API
 * Throws if audio.features.read capability is missing
 *
 * @example
 *   import { audioApi } from '@mvmnt/plugin-sdk';
 *   const rms = audioApi.sampleFeatureAtTime({...});
 */
export const audioApi: PluginAudioApi = createCapabilityProxy('audioFeaturesRead', (api) => api.audio);

/**
 * Direct access to the timing conversion API
 * Throws if timing.conversion capability is missing
 *
 * @example
 *   import { timingApi } from '@mvmnt/plugin-sdk';
 *   const beats = timingApi.secondsToBeats(10);
 */
export const timingApi: PluginTimingApi = createCapabilityProxy('timingConversion', (api) => api.timing);

/**
 * Direct access to utility APIs
 * Throws if midi.utils capability is missing
 *
 * @example
 *   import { utilitiesApi } from '@mvmnt/plugin-sdk';
 *   const noteName = utilitiesApi.midiNoteToName(60);
 */
export const utilitiesApi: PluginUtilityApi = createCapabilityProxy('midiUtils', (api) => api.utilities);

/**
 * Direct access to the audio calculator registration API.
 * Always available — the calculator registry is a module-level singleton.
 *
 * Call `register()` at module scope so the calculator is ready before analysis runs.
 *
 * @example
 *   import { audioCalculatorsApi, registerFeatureRequirements } from '@mvmnt/plugin-sdk';
 *   audioCalculatorsApi.register({ id: 'myplugin.loudness', version: 1, featureKey: 'loudness', calculate: ... });
 *   registerFeatureRequirements('myElement', [{ feature: 'loudness' }]);
 */
export const audioCalculatorsApi: PluginAudioCalculatorApi = createCapabilityProxy(
    'audioCalculatorsRegister',
    (api) => api.audioCalculators
);
