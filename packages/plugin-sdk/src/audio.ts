import type { Result } from './api.js';

export type AudioChannel = 'mono' | 'left' | 'right' | number;
export type AudioFeatureInput = string | Readonly<{ key: string; channel?: string | number }>;

export interface AudioChannelMetadata {
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly durationSeconds: number;
  readonly channelLabels: readonly string[];
}

export interface AudioFeatureFrame {
  readonly timeSeconds: number;
  readonly value: number | readonly number[] | Readonly<Record<string, number>>;
}

export interface AudioApi {
  getChannelMetadata(trackId: string): Result<AudioChannelMetadata>;
  sampleFeature(args: Readonly<{ trackId: string; feature: AudioFeatureInput; timeSeconds: number }>): Result<AudioFeatureFrame>;
  sampleFeatureRange(args: Readonly<{ trackId: string; feature: AudioFeatureInput; startSeconds: number; endSeconds: number; stepSeconds: number }>): Result<readonly AudioFeatureFrame[]>;
  /** Allocates and returns an unbounded defensive copy. Prefer features for long windows. */
  getRawSamples(args: Readonly<{ trackId: string; startSeconds: number; endSeconds: number; channel?: AudioChannel }>): Result<Float32Array>;
  getRms(args: Readonly<{ trackId: string; startSeconds: number; endSeconds: number }>): Result<Float32Array>;
}

export interface AudioCalculatorContext {
  readonly audioBuffer: AudioBuffer;
  readonly hopTicks: number;
  readonly hopSeconds: number;
  readonly frameCount: number;
  readonly signal: AbortSignal;
  reportProgress(processed: number, total: number): void;
}

export interface AudioCalculatorResult {
  readonly frameCount: number;
  readonly channels: number;
  readonly format: 'float32' | 'uint8';
  readonly data: Float32Array | Uint8Array;
}

export interface AudioCalculator {
  readonly id: string;
  readonly version: number;
  readonly featureKey: string;
  calculate(context: AudioCalculatorContext): AudioCalculatorResult | Promise<AudioCalculatorResult>;
}

export interface AudioCalculatorsApi {
  register(calculator: AudioCalculator): Result<{ dispose(): void }>;
}
