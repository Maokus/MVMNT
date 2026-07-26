import type { Result } from './api.js';

export type AudioChannel = 'mono' | 'left' | 'right' | number;
export type AudioFeatureInput = string | Readonly<{ key: string; channel?: string | number }>;

export interface AudioFeatureRequirement {
    readonly feature: string;
    readonly bandIndex?: number;
    readonly calculatorId?: string;
    readonly profile?: string;
    readonly profileParams?: Readonly<Record<string, number | string | boolean | null>>;
}

export interface ScopedFeatureRequirements {
    dispose(): void;
}

export interface AudioChannelMetadata {
    readonly sampleRate: number;
    readonly channelCount: number;
    readonly durationSeconds: number;
    readonly channelLabels: readonly string[];
}

export interface AudioFeatureFrame {
    readonly timeSeconds: number;
    readonly value: number | readonly number[] | Readonly<Record<string, number>>;
    /** Optional calculator channel payload for multi-channel feature frames. */
    readonly channelValues?: readonly (readonly number[])[];
    readonly sampleRate?: number;
}

export interface AudioFeatureMatrix {
    /** Opaque, session-local content revision suitable for generated-resource keys. */
    readonly revision: string;
    readonly startSeconds: number;
    readonly stepSeconds: number;
    readonly frameCount: number;
    readonly valuesPerFrame: number;
    /** Row-major values: frame * valuesPerFrame + channel. */
    readonly data: Float32Array;
    /** One when an enabled clip covers the frame, zero for a timeline gap. */
    readonly coverage: Uint8Array;
    readonly format: 'float32' | 'uint8' | 'int16';
    readonly sampleRate?: number;
}

export interface AudioApi {
    /** Registers analysis requirements for this element instance and is automatically disposed with its lifecycle scope. */
    requireFeatures(requirements: readonly AudioFeatureRequirement[]): Result<ScopedFeatureRequirements>;
    getChannelMetadata(trackId: string): Result<AudioChannelMetadata>;
    sampleFeature(
        args: Readonly<{ trackId: string; feature: AudioFeatureInput; timeSeconds: number }>
    ): Result<AudioFeatureFrame>;
    sampleFeatureRange(
        args: Readonly<{
            trackId: string;
            feature: AudioFeatureInput;
            startSeconds: number;
            endSeconds: number;
            stepSeconds: number;
        }>
    ): Result<readonly AudioFeatureFrame[]>;
    /**
     * Samples a packed feature window in one host call. The host resolves clip
     * placement once and caps the result at 1,048,576 scalar values.
     */
    sampleFeatureMatrix(
        args: Readonly<{
            trackId: string;
            feature: AudioFeatureInput;
            startSeconds: number;
            stepSeconds: number;
            frameCount: number;
            interpolation?: 'linear' | 'nearest';
        }>
    ): Result<AudioFeatureMatrix>;
    /** Allocates and returns an unbounded defensive copy. Prefer features for long windows. */
    getRawSamples(
        args: Readonly<{ trackId: string; startSeconds: number; endSeconds: number; channel?: AudioChannel }>
    ): Result<Float32Array>;
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
    readonly channelLayout?: Readonly<{
        aliases?: readonly string[];
        semantics?: string;
    }>;
}

export interface AudioCalculator {
    readonly id: string;
    readonly version: number;
    readonly featureKey: string;
    calculate(context: AudioCalculatorContext): AudioCalculatorResult | Promise<AudioCalculatorResult>;
}
export type PluginAudioCalculator = AudioCalculator;

export interface AudioCalculatorsApi {
    register(calculator: AudioCalculator): Result<{ dispose(): void }>;
}

/** Standalone adapters for every audio capability operation. */
export const requireAudioFeatures = (
    audio: AudioApi,
    requirements: readonly AudioFeatureRequirement[]
): ReturnType<AudioApi['requireFeatures']> => audio.requireFeatures(requirements);

export const getAudioChannelMetadata = (
    audio: AudioApi,
    trackId: string
): ReturnType<AudioApi['getChannelMetadata']> => audio.getChannelMetadata(trackId);

export const sampleAudioFeature = (
    audio: AudioApi,
    args: Parameters<AudioApi['sampleFeature']>[0]
): ReturnType<AudioApi['sampleFeature']> => audio.sampleFeature(args);

export const sampleAudioFeatureRange = (
    audio: AudioApi,
    args: Parameters<AudioApi['sampleFeatureRange']>[0]
): ReturnType<AudioApi['sampleFeatureRange']> => audio.sampleFeatureRange(args);

export const sampleAudioFeatureMatrix = (
    audio: AudioApi,
    args: Parameters<AudioApi['sampleFeatureMatrix']>[0]
): ReturnType<AudioApi['sampleFeatureMatrix']> => audio.sampleFeatureMatrix(args);

export const getRawAudioSamples = (
    audio: AudioApi,
    args: Parameters<AudioApi['getRawSamples']>[0]
): ReturnType<AudioApi['getRawSamples']> => audio.getRawSamples(args);

export const getAudioRms = (
    audio: AudioApi,
    args: Parameters<AudioApi['getRms']>[0]
): ReturnType<AudioApi['getRms']> => audio.getRms(args);

export const registerAudioCalculator = (
    calculators: AudioCalculatorsApi,
    calculator: AudioCalculator
): ReturnType<AudioCalculatorsApi['register']> => calculators.register(calculator);
