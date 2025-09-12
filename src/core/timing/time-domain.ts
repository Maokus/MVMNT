/**
 * Time Domain Foundations (Phase 1)
 * Canonical musical timing primitives & helpers.
 * Ticks are the base integer resolution; beats and seconds are derived views.
 */

// Nominal (branded) primitive wrappers to distinguish domains at type level
// Usage: function f(pos: Tick) { ... } prevents passing raw seconds accidentally.

export type Tick = number & { readonly __brand: 'Tick' };
export type Beats = number & { readonly __brand: 'Beats' };
export type Seconds = number & { readonly __brand: 'Seconds' };

// Canonical internal PPQ (can be revisited; MIDI ingestion will scale into this space later)
export const CANONICAL_PPQ = 960; // High enough for fine subdivisions (1/960 quarter note)

// Factory helpers (runtime no‑op, compile-time brand attach)
export const tick = (n: number): Tick => n as Tick;
export const beats = (n: number): Beats => n as Beats;
export const seconds = (n: number): Seconds => n as Seconds;

// Type guards (best-effort; at runtime these are just number checks)
export function isTick(v: any): v is Tick {
    return typeof v === 'number' && Number.isFinite(v);
}
export function isBeats(v: any): v is Beats {
    return typeof v === 'number' && Number.isFinite(v);
}
export function isSeconds(v: any): v is Seconds {
    return typeof v === 'number' && Number.isFinite(v);
}

// Conversion interfaces (pure math, no tempo map). For tempo-aware conversions use TimingManager.
export interface TimeDomainConverters {
    ticksToBeats(t: Tick, ticksPerQuarter: number): Beats;
    beatsToTicks(b: Beats, ticksPerQuarter: number): Tick;
}

export const basicConverters: TimeDomainConverters = {
    ticksToBeats(t: Tick, tpq: number): Beats {
        return beats((t as number) / tpq);
    },
    beatsToTicks(b: Beats, tpq: number): Tick {
        return tick(Math.round((b as number) * tpq));
    },
};

// Formatting helpers (BBT string). These are lightweight and may be replaced later with richer formatting.
export function formatBeatsAsBBT(b: Beats, beatsPerBar: number, ticksPerQuarter: number): string {
    const totalBeats = b as number;
    const barIndex = Math.floor(totalBeats / beatsPerBar); // 0-based
    const beatInBar = Math.floor(totalBeats % beatsPerBar); // 0-based
    const fractional = totalBeats - Math.floor(totalBeats);
    const tickWithinBeat = Math.round(fractional * ticksPerQuarter);
    return `${barIndex + 1}.${beatInBar + 1}.${tickWithinBeat}`; // Bar.Beat.Tick
}

export function parseBBT(input: string, beatsPerBar: number, ticksPerQuarter: number): Beats | null {
    if (!input) return null;
    const parts = input
        .trim()
        .split(/[.:]/)
        .map((p) => p.trim());
    if (parts.length < 2 || parts.length > 3) return null;
    const bar = parseInt(parts[0], 10);
    const beat = parseInt(parts[1], 10);
    const tickPart = parts.length === 3 ? parseInt(parts[2], 10) : 0;
    if ([bar, beat, tickPart].some((n) => !Number.isFinite(n) || n < 0)) return null;
    const totalBeats = (bar - 1) * beatsPerBar + (beat - 1) + tickPart / ticksPerQuarter;
    return beats(totalBeats);
}

// Delta helpers
export const addBeats = (a: Beats, b: Beats): Beats => beats((a as number) + (b as number));
export const subBeats = (a: Beats, b: Beats): Beats => beats((a as number) - (b as number));
export const addTicks = (a: Tick, b: Tick): Tick => tick((a as number) + (b as number));
export const subTicks = (a: Tick, b: Tick): Tick => tick((a as number) - (b as number));

// Safe clamp helpers (applied in musical domain)
export function clampTick(t: Tick, min: Tick, max: Tick): Tick {
    return tick(Math.min(max as number, Math.max(min as number, t as number)));
}
export function clampBeats(b: Beats, min: Beats, max: Beats): Beats {
    return beats(Math.min(max as number, Math.max(min as number, b as number)));
}

// Future: vectorized conversions (arrays) can live here for batch note processing.

export type { TempoMapEntry } from './types';
