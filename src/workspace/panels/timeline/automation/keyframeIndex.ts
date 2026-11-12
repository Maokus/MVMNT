import type { AutomationChannel, AutomationKeyframe } from '@automation/types';

export function lowerBoundTick<T extends { tick: number }>(values: readonly T[], tick: number): number {
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (values[mid].tick < tick) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

export function keyframeTickAtPlayhead(keyframes: readonly AutomationKeyframe[], tick: number): number | null {
    const index = lowerBoundTick(keyframes, tick - 0.5);
    for (let i = index; i < keyframes.length && keyframes[i].tick < tick + 0.5; i++) {
        if (Math.abs(keyframes[i].tick - tick) < 0.5) return keyframes[i].tick;
    }
    return null;
}

/** Index header diamonds once per channel edit, including the existing half-tick hit tolerance. */
export function indexHeaderKeyframes(channels: readonly AutomationChannel[]) {
    const exact = new Map<number, Set<string>>();
    for (const channel of channels) {
        for (const keyframe of channel.keyframes) {
            const ids = exact.get(keyframe.tick) ?? new Set<string>();
            ids.add(channel.id);
            exact.set(keyframe.tick, ids);
        }
    }
    const ticks = [...exact.keys()].sort((a, b) => a - b).map((tick) => ({ tick }));
    const owners = new Map<number, Set<string>>();
    for (const { tick } of ticks) {
        const ids = new Set<string>();
        const first = lowerBoundTick(ticks, tick - 0.5);
        for (let i = first; i < ticks.length && ticks[i].tick < tick + 0.5; i++) {
            if (Math.abs(ticks[i].tick - tick) >= 0.5) continue;
            for (const id of exact.get(ticks[i].tick)!) ids.add(id);
        }
        owners.set(tick, ids);
    }
    return { ticks, owners };
}
