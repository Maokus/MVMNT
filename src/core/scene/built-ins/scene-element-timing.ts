import type { CapabilityContext } from '../../../../packages/plugin-sdk/src/scene';
import type { TimingApi } from '../../../../packages/plugin-sdk/src/timing';
import { TimingManager, type TimingConversions } from '@core/timing/timing-manager';

const conversionsByApi = new WeakMap<TimingApi, TimingConversions>();

function conversionsFor(api: TimingApi): TimingConversions {
    const cached = conversionsByApi.get(api);
    if (cached) return cached;
    const conversions: TimingConversions = {
        secondsToBeats(seconds) {
            const result = api.secondsToBeats(seconds);
            if (!result.ok) throw new Error(result.error.message);
            return result.value;
        },
        beatsToSeconds(beats) {
            const result = api.beatsToSeconds(beats);
            if (!result.ok) throw new Error(result.error.message);
            return result.value;
        },
    };
    conversionsByApi.set(api, conversions);
    return conversions;
}

/** Keep an adapted built-in's musical helpers on the host project timeline. */
export function syncSceneElementTiming(
    manager: TimingManager,
    context: CapabilityContext,
    fallbackBpm: number,
    fallbackTimeSignature: Readonly<{ numerator: number; denominator: number }>
): void {
    manager.setBPM(fallbackBpm);
    manager.setTimeSignature(fallbackTimeSignature);
    manager.setConversions(context.timing ? conversionsFor(context.timing) : null);
}
