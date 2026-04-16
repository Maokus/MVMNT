/**
 * Audio domain: direct API proxy, sampling shortcuts, and feature types.
 *
 * @module @mvmnt/plugin-sdk/audio
 */

// Direct capability proxy — throws descriptively if capability is missing
export { audioApi } from '@core/scene/plugins/plugin-sdk-capabilities';

// Convenience shortcuts (return safe defaults when API unavailable)
export { sampleAudio, sampleAudioRange } from '@core/scene/plugins/plugin-sdk-shortcuts';

// Feature requirement registration (used in element class bodies)
export { registerFeatureRequirements } from '@audio/audioElementMetadata';
export type { AudioFeatureRequirement } from '@audio/audioElementMetadata';

// Feature data types
export type { FeatureDataResult, FeatureInput } from '@audio/features/sceneApi';
