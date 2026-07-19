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

/** Standalone adapters for every timing conversion operation. */
export const secondsToTicks = (timing: TimingApi, seconds: number): ReturnType<TimingApi['secondsToTicks']> =>
  timing.secondsToTicks(seconds);
export const ticksToSeconds = (timing: TimingApi, ticks: number): ReturnType<TimingApi['ticksToSeconds']> =>
  timing.ticksToSeconds(ticks);
export const secondsToBeats = (timing: TimingApi, seconds: number): ReturnType<TimingApi['secondsToBeats']> =>
  timing.secondsToBeats(seconds);
export const beatsToSeconds = (timing: TimingApi, beats: number): ReturnType<TimingApi['beatsToSeconds']> =>
  timing.beatsToSeconds(beats);
export const beatsToTicks = (timing: TimingApi, beats: number): ReturnType<TimingApi['beatsToTicks']> =>
  timing.beatsToTicks(beats);
export const ticksToBeats = (timing: TimingApi, ticks: number): ReturnType<TimingApi['ticksToBeats']> =>
  timing.ticksToBeats(ticks);
export const getTimeSignature = (timing: TimingApi): ReturnType<TimingApi['getTimeSignature']> =>
  timing.getTimeSignature();
