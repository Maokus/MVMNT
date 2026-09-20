import type { Result } from './api.js';

export interface TimingApi {
    /** Converts through the project's complete tempo map. */
    secondsToTicks(seconds: number): Result<number>;
    /** Converts through the project's complete tempo map. */
    ticksToSeconds(ticks: number): Result<number>;
    /** Converts through the project's complete tempo map. */
    secondsToBeats(seconds: number): Result<number>;
    /** Converts through the project's complete tempo map. */
    beatsToSeconds(beats: number): Result<number>;
    beatsToTicks(beats: number): Result<number>;
    ticksToBeats(ticks: number): Result<number>;
    getTimeSignature(): Result<Readonly<{ numerator: number; denominator: number }>>;
}
