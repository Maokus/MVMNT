import type { TempoKeyframe, TempoMapEntry } from './types';

const MIN_BPM = 1;
const MAX_BPM = 999;
const DEFAULT_PPQ = 960;

function clampBpm(bpm: number): number {
    if (!Number.isFinite(bpm) || bpm < MIN_BPM) return MIN_BPM;
    if (bpm > MAX_BPM) return MAX_BPM;
    return bpm;
}

/**
 * Convert tick-domain hold-only tempo keyframes into a TempoMapEntry[] suitable
 * for TimingManager / TempoMapper. O(n) forward pass.
 *
 * @param keyframes  Sorted ascending by tick. Must not be empty.
 * @param globalBpm  Fallback BPM before the first keyframe.
 * @param ppq        Ticks per quarter note (from SharedTimingManager).
 */
export function resolveTempoKeyframes(
    keyframes: readonly TempoKeyframe[],
    globalBpm: number,
    ppq: number,
): TempoMapEntry[] {
    const safePpq = ppq > 0 ? ppq : DEFAULT_PPQ;
    const safeGlobalBpm = clampBpm(globalBpm);

    const result: TempoMapEntry[] = [{ time: 0, bpm: safeGlobalBpm, curve: 'step' }];

    if (keyframes.length === 0) return result;

    let prevTick = 0;
    let prevTimeSec = 0;
    let prevBpm = safeGlobalBpm;

    for (const kf of keyframes) {
        const safeBpm = clampBpm(kf.bpm);
        const deltaTicks = Math.max(0, kf.tick - prevTick);
        const durationSec = (deltaTicks / safePpq) * (60 / prevBpm);
        const timeSec = prevTimeSec + durationSec;

        if (kf.tick <= 0) {
            // Keyframe at tick 0 (or before) replaces the initial globalBpm entry
            result[0] = { time: 0, bpm: safeBpm, curve: 'step' };
        } else {
            result.push({ time: timeSec, bpm: safeBpm, curve: 'step' });
        }

        prevTick = Math.max(0, kf.tick);
        prevTimeSec = kf.tick <= 0 ? 0 : timeSec;
        prevBpm = safeBpm;
    }

    return result;
}
