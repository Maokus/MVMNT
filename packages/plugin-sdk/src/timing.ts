import type { Result } from './api.js';

export interface TimingApi {
    secondsToTicks(seconds: number): Result<number>;
    ticksToSeconds(ticks: number): Result<number>;
    secondsToBeats(seconds: number): Result<number>;
    beatsToSeconds(beats: number): Result<number>;
    beatsToTicks(beats: number): Result<number>;
    ticksToBeats(ticks: number): Result<number>;
    getTimeSignature(): Result<Readonly<{ numerator: number; denominator: number }>>;
}
