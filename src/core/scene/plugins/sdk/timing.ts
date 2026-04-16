/**
 * Timing domain: direct API proxy, conversion shortcuts, quantize helpers, and tempo utilities.
 *
 * @module @mvmnt/plugin-sdk/timing
 */

// Direct capability proxy — throws descriptively if capability is missing
export { timingApi } from '@core/scene/plugins/plugin-sdk-capabilities';

// Convenience shortcuts (return safe defaults when API unavailable)
export {
    timeToBeats,
    beatsToTime,
    timeToTicks,
    ticksToTime,
    beatToTicks,
    ticksToBeat,
} from '@core/scene/plugins/plugin-sdk-shortcuts';

// Tempo math utilities (no capability required)
export {
    beatsToSeconds,
    secondsToBeats,
    getSecondsPerBeat,
} from '@core/timing/tempo-utils';

// Quantize helpers
export {
    quantizeSettingToBeats,
    quantizeSettingToTicks,
    formatQuantizeLabel,
    formatQuantizeShortLabel,
    type QuantizeSetting,
    type SnapQuantizeOption,
} from '@state/timeline/quantize';
