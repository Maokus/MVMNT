import type { TempoMapEntry } from './types';

const MICROSECONDS_PER_MINUTE = 60_000_000;

export interface TempoMapperConfig {
    ticksPerQuarter: number;
    globalBpm: number;
    tempoMap?: TempoMapEntry[] | null;
}

export type TempoMapperProfileEvent =
    | 'seconds-to-ticks'
    | 'ticks-to-seconds'
    | 'seconds-batch'
    | 'ticks-batch';

export interface TempoMapperProfiler {
    record(event: TempoMapperProfileEvent, durationNanoseconds: number): void;
}

interface TempoSegment {
    startTime: number;
    endTime: number;
    startTicks: number;
    endTicks: number;
    secondsPerBeatStart: number;
    secondsPerBeatEnd: number;
    ticksPerSecondStart: number;
    ticksPerSecondEnd: number;
    isRamp: boolean;
}

function resolveTempo(entry: TempoMapEntry | undefined, fallbackBpm: number): number {
    if (!entry) {
        return MICROSECONDS_PER_MINUTE / Math.max(1, fallbackBpm);
    }
    if (typeof entry.tempo === 'number' && entry.tempo > 0) {
        return entry.tempo;
    }
    if (typeof entry.bpm === 'number' && entry.bpm > 0) {
        return MICROSECONDS_PER_MINUTE / entry.bpm;
    }
    return MICROSECONDS_PER_MINUTE / Math.max(1, fallbackBpm);
}

function resolveCurve(entry: TempoMapEntry | undefined): 'step' | 'linear' {
    if (!entry || entry.curve !== 'linear') {
        return 'step';
    }
    return 'linear';
}

function normalizeTempoMap(
    tempoMap: TempoMapEntry[] | null | undefined,
    fallbackBpm: number,
): TempoSegment[] {
    const entries = Array.isArray(tempoMap)
        ? tempoMap
              .filter((e) => typeof e?.time === 'number' && e.time >= 0)
              .map((e) => ({ ...e }))
              .sort((a, b) => a.time - b.time)
        : [];

    if (entries.length === 0) {
        const secondsPerBeat = MICROSECONDS_PER_MINUTE / Math.max(1, fallbackBpm) / 1_000_000;
        return [
            {
                startTime: 0,
                endTime: Number.POSITIVE_INFINITY,
                startTicks: 0,
                endTicks: Number.POSITIVE_INFINITY,
                secondsPerBeatStart: secondsPerBeat,
                secondsPerBeatEnd: secondsPerBeat,
                ticksPerSecondStart: 1 / secondsPerBeat,
                ticksPerSecondEnd: 1 / secondsPerBeat,
                isRamp: false,
            },
        ];
    }

    const segments: TempoSegment[] = [];
    let cumulativeTicks = 0;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const next = entries[index + 1];
        const nextTime = next ? next.time : Number.POSITIVE_INFINITY;
        const curve = resolveCurve(entry);
        const secondsPerBeatStart = resolveTempo(entry, fallbackBpm) / 1_000_000;
        const secondsPerBeatEnd = curve === 'linear' ? resolveTempo(next, fallbackBpm) / 1_000_000 : secondsPerBeatStart;
        const durationSeconds = Math.max(0, nextTime - entry.time);
        const ticksPerSecondStart = 1 / Math.max(1e-9, secondsPerBeatStart);
        const ticksPerSecondEnd = 1 / Math.max(1e-9, secondsPerBeatEnd);
        let endTicks = Number.POSITIVE_INFINITY;
        if (Number.isFinite(durationSeconds)) {
            if (curve === 'linear' && durationSeconds > 0 && Number.isFinite(nextTime)) {
                const slope = (ticksPerSecondEnd - ticksPerSecondStart) / durationSeconds;
                endTicks = cumulativeTicks + ticksPerSecondStart * durationSeconds + 0.5 * slope * durationSeconds * durationSeconds;
            } else {
                endTicks = cumulativeTicks + ticksPerSecondStart * durationSeconds;
            }
        }
        segments.push({
            startTime: entry.time,
            endTime: nextTime,
            startTicks: cumulativeTicks,
            endTicks,
            secondsPerBeatStart,
            secondsPerBeatEnd,
            ticksPerSecondStart,
            ticksPerSecondEnd,
            isRamp: curve === 'linear' && durationSeconds > 0,
        });
        cumulativeTicks = endTicks;
        if (!Number.isFinite(nextTime)) {
            break;
        }
    }
    if (segments.length === 0) {
        const secondsPerBeat = MICROSECONDS_PER_MINUTE / Math.max(1, fallbackBpm) / 1_000_000;
        segments.push({
            startTime: 0,
            endTime: Number.POSITIVE_INFINITY,
            startTicks: 0,
            endTicks: Number.POSITIVE_INFINITY,
            secondsPerBeatStart: secondsPerBeat,
            secondsPerBeatEnd: secondsPerBeat,
            ticksPerSecondStart: 1 / secondsPerBeat,
            ticksPerSecondEnd: 1 / secondsPerBeat,
            isRamp: false,
        });
    } else {
        const last = segments[segments.length - 1];
        if (!Number.isFinite(last.endTime)) {
            last.endTicks = Number.POSITIVE_INFINITY;
        }
    }
    return segments;
}

function clampToSegmentIndex(segments: TempoSegment[], seconds: number): number {
    if (seconds <= segments[0]!.startTime) {
        return 0;
    }
    for (let i = segments.length - 1; i >= 0; i -= 1) {
        const seg = segments[i]!;
        if (seconds >= seg.startTime) {
            return i;
        }
    }
    return 0;
}

function clampToSegmentIndexTicks(segments: TempoSegment[], ticks: number): number {
    if (ticks <= segments[0]!.startTicks) {
        return 0;
    }
    for (let i = segments.length - 1; i >= 0; i -= 1) {
        const seg = segments[i]!;
        if (ticks >= seg.startTicks) {
            return i;
        }
    }
    return 0;
}

function integrateRampTicks(seg: TempoSegment, seconds: number): number {
    const dt = seconds - seg.startTime;
    const duration = Math.max(0, Math.min(dt, seg.endTime - seg.startTime));
    if (duration <= 0) {
        return seg.startTicks;
    }
    const slope = (seg.ticksPerSecondEnd - seg.ticksPerSecondStart) / Math.max(1e-9, seg.endTime - seg.startTime);
    return seg.startTicks + seg.ticksPerSecondStart * duration + 0.5 * slope * duration * duration;
}

function invertRampTicks(seg: TempoSegment, ticks: number): number {
    const localTicks = ticks - seg.startTicks;
    if (localTicks <= 0) {
        return seg.startTime;
    }
    const duration = seg.endTime - seg.startTime;
    const slope = (seg.ticksPerSecondEnd - seg.ticksPerSecondStart) / Math.max(1e-9, duration);
    if (Math.abs(slope) < 1e-9) {
        const seconds = localTicks / seg.ticksPerSecondStart;
        return seg.startTime + Math.min(duration, Math.max(0, seconds));
    }
    const a = 0.5 * slope;
    const b = seg.ticksPerSecondStart;
    const c = -localTicks;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return seg.startTime;
    }
    const root = (-b + Math.sqrt(discriminant)) / (2 * a);
    const clamped = Math.min(duration, Math.max(0, root));
    return seg.startTime + clamped;
}

function now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

export class TempoMapper {
    private readonly ticksPerQuarter: number;
    private readonly segments: TempoSegment[];
    private readonly profiler?: TempoMapperProfiler;

    constructor(config: TempoMapperConfig, profiler?: TempoMapperProfiler) {
        this.ticksPerQuarter = Math.max(1, config.ticksPerQuarter || 1);
        const fallbackBpm = Math.max(1, config.globalBpm || 120);
        this.segments = normalizeTempoMap(config.tempoMap, fallbackBpm).map((segment) => {
            return {
                ...segment,
                startTicks: segment.startTicks * this.ticksPerQuarter,
                endTicks: Number.isFinite(segment.endTicks)
                    ? segment.endTicks * this.ticksPerQuarter
                    : Number.POSITIVE_INFINITY,
                ticksPerSecondStart: segment.ticksPerSecondStart * this.ticksPerQuarter,
                ticksPerSecondEnd: segment.ticksPerSecondEnd * this.ticksPerQuarter,
            };
        });
        this.profiler = profiler;
    }

    private profile<T>(event: TempoMapperProfileEvent, fn: () => T): T {
        if (!this.profiler) {
            return fn();
        }
        const start = now();
        const result = fn();
        const durationMs = now() - start;
        this.profiler.record(event, durationMs * 1_000_000);
        return result;
    }

    private secondsToTicksInternal(seconds: number): number {
        if (!Number.isFinite(seconds) || seconds <= 0) {
            return 0;
        }
        const seg = this.segments[clampToSegmentIndex(this.segments, seconds)];
        if (!seg) {
            return seconds * this.segments[0]!.ticksPerSecondStart;
        }
        if (!seg.isRamp || !Number.isFinite(seg.endTime)) {
            const dt = seconds - seg.startTime;
            const ticks = seg.startTicks + seg.ticksPerSecondStart * dt;
            return ticks;
        }
        return integrateRampTicks(seg, seconds);
    }

    private ticksToSecondsInternal(ticks: number): number {
        if (!Number.isFinite(ticks) || ticks <= 0) {
            return 0;
        }
        const seg = this.segments[clampToSegmentIndexTicks(this.segments, ticks)];
        if (!seg) {
            return ticks / this.segments[0]!.ticksPerSecondStart;
        }
        if (!seg.isRamp || !Number.isFinite(seg.endTicks)) {
            const dt = ticks - seg.startTicks;
            const seconds = seg.startTime + dt / seg.ticksPerSecondStart;
            return seconds;
        }
        return invertRampTicks(seg, ticks);
    }

    secondsToTicks(seconds: number): number {
        return this.profile('seconds-to-ticks', () => this.secondsToTicksInternal(seconds));
    }

    ticksToSeconds(ticks: number): number {
        return this.profile('ticks-to-seconds', () => this.ticksToSecondsInternal(ticks));
    }

    secondsToTicksBatch(values: ArrayLike<number>): Float64Array {
        return this.profile('seconds-batch', () => {
            const result = new Float64Array(values.length);
            for (let i = 0; i < values.length; i += 1) {
                result[i] = this.secondsToTicksInternal(values[i] ?? 0);
            }
            return result;
        });
    }

    ticksToSecondsBatch(values: ArrayLike<number>): Float64Array {
        return this.profile('ticks-batch', () => {
            const result = new Float64Array(values.length);
            for (let i = 0; i < values.length; i += 1) {
                result[i] = this.ticksToSecondsInternal(values[i] ?? 0);
            }
            return result;
        });
    }

    projectFrameCentersToTicks(startSeconds: number, hopSeconds: number, frameCount: number): Float64Array {
        const values = new Float64Array(frameCount);
        const halfHop = hopSeconds / 2;
        for (let i = 0; i < frameCount; i += 1) {
            const frameSeconds = startSeconds + i * hopSeconds + halfHop;
            values[i] = this.secondsToTicks(frameSeconds);
        }
        return values;
    }
}

export function createTempoMapper(config: TempoMapperConfig, profiler?: TempoMapperProfiler): TempoMapper {
    return new TempoMapper(config, profiler);
}
