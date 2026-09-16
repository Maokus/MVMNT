import { CANONICAL_PPQ } from './ppq';

export interface TimeSignature {
    numerator: number;
    denominator: number;
}

export const DEFAULT_TIME_SIGNATURE: TimeSignature = Object.freeze({ numerator: 4, denominator: 4 });

export function normalizeTimeSignature(value?: Partial<TimeSignature> | null): TimeSignature {
    const numerator = Number.isFinite(value?.numerator) ? Math.max(1, Math.min(64, Math.floor(value!.numerator!))) : 4;
    const rawDenominator = Number.isFinite(value?.denominator) ? Math.floor(value!.denominator!) : 4;
    const denominator =
        rawDenominator > 0 && rawDenominator <= 64 && Number.isInteger(Math.log2(rawDenominator)) ? rawDenominator : 4;
    return { numerator, denominator };
}

export function quarterNotesPerBar(signature: TimeSignature): number {
    const meter = normalizeTimeSignature(signature);
    return (meter.numerator * 4) / meter.denominator;
}

export function ticksPerMeterBeat(signature: TimeSignature, ppq: number = CANONICAL_PPQ): number {
    return (ppq * 4) / normalizeTimeSignature(signature).denominator;
}

export function ticksPerBar(signature: TimeSignature, ppq: number = CANONICAL_PPQ): number {
    return normalizeTimeSignature(signature).numerator * ticksPerMeterBeat(signature, ppq);
}

export function isTimeSignature(value: unknown): value is TimeSignature {
    if (!value || typeof value !== 'object') return false;
    const signature = value as TimeSignature;
    return (
        Number.isFinite(signature.numerator) &&
        signature.numerator > 0 &&
        Number.isFinite(signature.denominator) &&
        signature.denominator > 0 &&
        signature.denominator <= 64 &&
        Number.isInteger(Math.log2(signature.denominator))
    );
}
