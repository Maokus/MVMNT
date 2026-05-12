/**
 * Audio domain: direct API proxy, sampling shortcuts, feature types, and calculator registration.
 *
 * ## Which API to use
 *
 * - **`sampleAudio` / `sampleAudioRange`** — recommended for most elements. Returns safe defaults
 *   (null / []) when the audio capability is unavailable.
 * - **`audioApi`** — direct capability proxy that throws descriptively on missing capabilities.
 *   Use when you want explicit failure rather than silent null returns.
 * - **`audioCalculatorsApi`** — register custom audio feature calculators. Call `register()` at
 *   module scope so the calculator is ready before audio analysis runs.
 * - **`getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead])`** — use when you need to
 *   negotiate multiple capabilities together or inspect the `status` field before sampling.
 *
 * @module @mvmnt/plugin-sdk/audio
 */

// Direct capability proxy — throws descriptively if capability is missing
export { audioApi } from '@core/scene/plugins/plugin-sdk-capabilities';

// Raw PCM access proxy — throws descriptively if capability is missing
export { audioRawApi } from '@core/scene/plugins/plugin-sdk-capabilities';
export { MAX_RAW_SAMPLES } from '@core/scene/plugins/host-api/plugin-api';

// Calculator registration API
export { audioCalculatorsApi } from '@core/scene/plugins/plugin-sdk-capabilities';
export type {
    PluginAudioCalculator,
    PluginAudioCalculatorContext,
    PluginAudioCalculatorResult,
    PluginAudioCalculatorInfo,
    PluginAudioCalculatorApi,
} from '@core/scene/plugins/host-api/plugin-api';

// Convenience shortcuts (return safe defaults when API unavailable)
export { sampleAudio, sampleAudioRange } from '@core/scene/plugins/plugin-sdk-shortcuts';

// Lower-level range sampler: resolves descriptor+controller once, then loops sampleFeatureFrame.
// Prefer this over calling getFeatureData in a manual loop for multi-frame sampling.
export { getFeatureDataRange } from '@audio/features/sceneApi';

// Feature requirement registration (used in element class bodies)
export { registerFeatureRequirements } from '@audio/audioElementMetadata';
export type { AudioFeatureRequirement } from '@audio/audioElementMetadata';

// Feature data types
export type { FeatureDataResult, FeatureInput } from '@audio/features/sceneApi';
