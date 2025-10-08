import type { TempoMapEntry } from '@state/timelineTypes';

export type AudioFeatureTrackFormat =
    | 'float32'
    | 'uint8'
    | 'int16'
    | 'waveform-minmax';

export type AudioFeatureTrackData =
    | Float32Array
    | Uint8Array
    | Int16Array
    | {
          min: Float32Array;
          max: Float32Array;
      };

export interface AudioFeatureTrack<Data = AudioFeatureTrackData> {
    /** Feature identifier (e.g., `spectrogram`). */
    key: string;
    /** Calculator source that produced the track. */
    calculatorId: string;
    /** Calculator version used to produce the track. */
    version: number;
    /** Number of frames contained in this track. */
    frameCount: number;
    /** Number of channels in the payload (e.g., stereo envelope). */
    channels: number;
    /** Quantized hop duration in timeline ticks. */
    hopTicks: number;
    /** Quantized hop duration in seconds. */
    hopSeconds: number;
    /** Raw payload for the feature. */
    data: Data;
    /** Additional calculator provided metadata. */
    metadata?: Record<string, unknown>;
    /** Optional per-track analysis parameters (window size, overlap, etc.). */
    analysisParams?: Record<string, unknown>;
    /** Data encoding hint to help downstream consumers deserialize. */
    format: AudioFeatureTrackFormat;
}

export interface AudioFeatureAnalysisParams {
    windowSize: number;
    hopSize: number;
    overlap: number;
    smoothing?: number;
    sampleRate: number;
    tempoMapHash?: string;
    calculatorVersions: Record<string, number>;
}

export interface AudioFeatureCache {
    version: number;
    audioSourceId: string;
    /** Quantized hop size shared across all feature tracks. */
    hopTicks: number;
    /** Hop duration in seconds. */
    hopSeconds: number;
    /** Total number of frames represented by the cache. */
    frameCount: number;
    /** Raw feature payloads keyed by feature name. */
    featureTracks: Record<string, AudioFeatureTrack>;
    /** Parameters used during analysis. */
    analysisParams: AudioFeatureAnalysisParams;
}

export type AudioFeatureCacheStatusState = 'idle' | 'pending' | 'ready' | 'failed' | 'stale';

export interface AudioFeatureCacheStatus {
    state: AudioFeatureCacheStatusState;
    /** Optional message describing failure or invalidation reason. */
    message?: string;
    /** Timestamp (ms) when the status last changed. */
    updatedAt: number;
    /** Hash of the source input (audio buffer + tempo map) used for this cache. */
    sourceHash?: string;
}

export interface AudioFeatureCalculatorTiming {
    globalBpm: number;
    beatsPerBar: number;
    tempoMap?: TempoMapEntry[];
    ticksPerQuarter: number;
}

export interface AudioFeatureCalculatorContext<P = unknown> {
    audioBuffer: AudioBuffer;
    /** Shared hop ticks computed for the analysis request. */
    hopTicks: number;
    hopSeconds: number;
    frameCount: number;
    analysisParams: AudioFeatureAnalysisParams;
    timing: AudioFeatureCalculatorTiming;
    prepared?: P;
    signal?: AbortSignal;
}

export type AudioFeatureCalculationResult = AudioFeatureTrack | AudioFeatureTrack[];

export interface AudioFeatureCalculator<Prepared = unknown> {
    id: string;
    version: number;
    /** Default feature key emitted by the calculator. */
    featureKey: string;
    /** Optional friendly label for UI consumption. */
    label?: string;
    /** Calculator specific default parameters. */
    defaultParams?: Record<string, unknown>;
    /** Optional pre-flight hook executed before calculate (once per job). */
    prepare?: (params: AudioFeatureAnalysisParams) => Promise<Prepared> | Prepared;
    /** Execute the calculator and return feature track(s). */
    calculate: (context: AudioFeatureCalculatorContext<Prepared>) =>
        | Promise<AudioFeatureCalculationResult>
        | AudioFeatureCalculationResult;
    /** Serialize a track into JSON-safe data. */
    serializeResult?: (track: AudioFeatureTrack) => Record<string, unknown>;
    /** Hydrate a serialized payload back into a runtime track. */
    deserializeResult?: (payload: Record<string, unknown>) => AudioFeatureTrack | null;
}

export type AudioFeatureCalculatorRegistry = {
    register: (calculator: AudioFeatureCalculator) => void;
    unregister: (id: string) => void;
    get: (id: string) => AudioFeatureCalculator | undefined;
    list: () => AudioFeatureCalculator[];
};
