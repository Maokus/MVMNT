import { audioFeatureCalculatorRegistry } from './audioFeatureRegistry';
import {
    type AudioFeatureAnalysisParams,
    type AudioFeatureCalculator,
    type AudioFeatureCalculatorContext,
    type AudioFeatureCache,
    type AudioFeatureCalculatorTiming,
    type AudioFeatureTrack,
    type AudioFeatureTrackFormat,
} from './audioFeatureTypes';
import { createTimingContext, secondsToTicks } from '@state/timelineTime';
import { getSharedTimingManager } from '@state/timelineStore';
import type { TempoMapEntry } from '@state/timelineTypes';

type SerializedTypedArray = {
    type: 'float32' | 'uint8' | 'int16';
    values: number[] | Float32Array | Uint8Array | Int16Array;
};

type SerializedWaveform = {
    type: 'waveform-minmax';
    min: number[] | Float32Array;
    max: number[] | Float32Array;
};

export type SerializedAudioFeatureTrackDataRef =
    | {
          kind: 'typed-array';
          type: 'float32' | 'uint8' | 'int16';
          valueCount: number;
          filename: string;
      }
    | {
          kind: 'waveform-minmax';
          type: 'float32';
          minLength: number;
          maxLength: number;
          filename: string;
      };

export type SerializedAudioFeatureTrack = {
    key: string;
    calculatorId: string;
    version: number;
    frameCount: number;
    channels: number;
    hopTicks: number;
    hopSeconds: number;
    format: AudioFeatureTrackFormat;
    data?: SerializedTypedArray | SerializedWaveform;
    metadata?: Record<string, unknown>;
    analysisParams?: Record<string, unknown>;
    dataRef?: SerializedAudioFeatureTrackDataRef;
};

export interface SerializedAudioFeatureCache {
    version: number;
    audioSourceId: string;
    hopTicks: number;
    hopSeconds: number;
    frameCount: number;
    analysisParams: AudioFeatureAnalysisParams;
    featureTracks: Record<string, SerializedAudioFeatureTrack>;
}

const DEFAULT_WINDOW_SIZE = 2048;
const DEFAULT_HOP_SIZE = 512;
const WAVEFORM_OVERSAMPLE_FACTOR = 8;
const SPECTROGRAM_MIN_DECIBELS = -80;
const SPECTROGRAM_MAX_DECIBELS = 0;
const SPECTROGRAM_EPSILON = 1e-8;
const ANALYSIS_YIELD_MIN_INTERVAL_MS = 12;

type YieldCallback = () => Promise<void>;

function nowTimestamp(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

function scheduleDeferred(resolve: () => void): void {
    const globalScope = globalThis as {
        requestAnimationFrame?: (callback: FrameRequestCallback) => number;
        requestIdleCallback?: (callback: () => void) => number;
    };
    if (typeof globalScope.requestAnimationFrame === 'function') {
        globalScope.requestAnimationFrame(() => resolve());
        return;
    }
    if (typeof globalScope.requestIdleCallback === 'function') {
        globalScope.requestIdleCallback(() => resolve());
        return;
    }
    setTimeout(resolve, 0);
}

function createAnalysisAbortError(): Error {
    const error = new Error('Audio feature analysis aborted');
    (error as Error).name = 'AbortError';
    return error;
}

function assertSignalNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw createAnalysisAbortError();
    }
}

function createAnalysisYieldController(signal?: AbortSignal): YieldCallback {
    let lastYieldAt = nowTimestamp();
    return async () => {
        assertSignalNotAborted(signal);
        const now = nowTimestamp();
        if (now - lastYieldAt < ANALYSIS_YIELD_MIN_INTERVAL_MS) {
            return;
        }
        await new Promise<void>((resolve) => scheduleDeferred(resolve));
        lastYieldAt = nowTimestamp();
        assertSignalNotAborted(signal);
    };
}

function hannWindow(length: number): Float32Array {
    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    }
    return window;
}

function computeTempoMapHash(map: TempoMapEntry[] | undefined): string | undefined {
    if (!map || !map.length) return undefined;
    const json = JSON.stringify(map);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
        hash = (hash * 31 + json.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
}

async function mixBufferToMono(buffer: AudioBuffer, maybeYield?: YieldCallback): Promise<Float32Array> {
    const frameCount = buffer.length;
    const channelCount = buffer.numberOfChannels || 1;
    const mono = new Float32Array(frameCount);
    if (frameCount === 0) {
        return mono;
    }
    const chunkSize = Math.max(1024, Math.floor(frameCount / 24));
    for (let channel = 0; channel < channelCount; channel++) {
        const data = buffer.getChannelData(channel);
        for (let index = 0; index < frameCount; index += chunkSize) {
            const end = Math.min(frameCount, index + chunkSize);
            for (let i = index; i < end; i++) {
                mono[i] += data[i] ?? 0;
            }
            if (maybeYield) {
                await maybeYield();
            }
        }
    }
    const invChannels = 1 / Math.max(1, channelCount);
    for (let index = 0; index < frameCount; index += chunkSize) {
        const end = Math.min(frameCount, index + chunkSize);
        for (let i = index; i < end; i++) {
            mono[i] *= invChannels;
        }
        if (maybeYield) {
            await maybeYield();
        }
    }
    return mono;
}

function computeFrameCount(length: number, windowSize: number, hopSize: number): number {
    if (length <= windowSize) return 1;
    return Math.max(1, Math.floor((length - windowSize) / hopSize) + 1);
}

function createTimingSlice(
    globalBpm: number,
    beatsPerBar: number,
    tempoMap?: TempoMapEntry[],
): AudioFeatureCalculatorTiming {
    const ticksPerQuarter = getSharedTimingManager().ticksPerQuarter;
    return {
        globalBpm,
        beatsPerBar,
        tempoMap,
        ticksPerQuarter,
    };
}

function createAnalysisParams(
    sampleRate: number,
    tempoMap: TempoMapEntry[] | undefined,
    calculators: AudioFeatureCalculator[],
    windowSize: number,
    hopSize: number,
): AudioFeatureAnalysisParams {
    const versions: Record<string, number> = {};
    for (const calc of calculators) {
        versions[calc.id] = calc.version;
    }
    return {
        windowSize,
        hopSize,
        overlap: windowSize > hopSize ? windowSize / hopSize : 1,
        smoothing: undefined,
        sampleRate,
        tempoMapHash: computeTempoMapHash(tempoMap),
        calculatorVersions: versions,
    };
}

function serializeTypedArray(array: Float32Array | Uint8Array | Int16Array): SerializedTypedArray {
    if (array instanceof Float32Array) {
        return { type: 'float32', values: Array.from(array) };
    }
    if (array instanceof Uint8Array) {
        return { type: 'uint8', values: Array.from(array) };
    }
    return { type: 'int16', values: Array.from(array) };
}

function deserializeTypedArray(serialized: SerializedTypedArray): Float32Array | Uint8Array | Int16Array {
    const values = serialized.values as typeof serialized.values &
        (number[] | Float32Array | Uint8Array | Int16Array);
    const sliceView = (view: ArrayBufferView) =>
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);

    if (serialized.type === 'float32') {
        if (Array.isArray(values)) return Float32Array.from(values);
        if (ArrayBuffer.isView(values)) {
            return new Float32Array(sliceView(values as ArrayBufferView));
        }
        return new Float32Array();
    }
    if (serialized.type === 'uint8') {
        if (Array.isArray(values)) return Uint8Array.from(values);
        if (ArrayBuffer.isView(values)) {
            return new Uint8Array(sliceView(values as ArrayBufferView));
        }
        return new Uint8Array();
    }
    if (Array.isArray(values)) return Int16Array.from(values);
    if (ArrayBuffer.isView(values)) {
        return new Int16Array(sliceView(values as ArrayBufferView));
    }
    return new Int16Array();
}

function serializeTrack(track: AudioFeatureTrack): SerializedAudioFeatureTrack {
    let data: SerializedAudioFeatureTrack['data'];
    if (track.format === 'waveform-minmax') {
        const payload = track.data as { min: Float32Array; max: Float32Array };
        data = { type: 'waveform-minmax', min: Array.from(payload.min), max: Array.from(payload.max) };
    } else {
        data = serializeTypedArray(track.data as Float32Array | Uint8Array | Int16Array);
    }
    return {
        key: track.key,
        calculatorId: track.calculatorId,
        version: track.version,
        frameCount: track.frameCount,
        channels: track.channels,
        hopTicks: track.hopTicks,
        hopSeconds: track.hopSeconds,
        format: track.format,
        metadata: track.metadata,
        analysisParams: track.analysisParams,
        data,
        dataRef: undefined,
    };
}

function deserializeTrack(track: SerializedAudioFeatureTrack): AudioFeatureTrack {
    if (!track.data) {
        throw new Error(`Serialized audio feature track ${track.key} missing data payload`);
    }
    let payload: AudioFeatureTrack['data'];
    if (track.format === 'waveform-minmax') {
        const waveform = track.data as SerializedWaveform;
        const minValues = waveform.min;
        const maxValues = waveform.max;
        const toFloat32 = (values: typeof minValues) => {
            if (Array.isArray(values)) {
                return Float32Array.from(values);
            }
            if (ArrayBuffer.isView(values)) {
                const view = values as ArrayBufferView;
                return new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
            }
            return new Float32Array();
        };
        payload = {
            min: toFloat32(minValues),
            max: toFloat32(maxValues),
        };
    } else {
        payload = deserializeTypedArray(track.data as SerializedTypedArray);
    }
    return {
        key: track.key,
        calculatorId: track.calculatorId,
        version: track.version,
        frameCount: track.frameCount,
        channels: track.channels,
        hopTicks: track.hopTicks,
        hopSeconds: track.hopSeconds,
        format: track.format,
        metadata: track.metadata,
        analysisParams: track.analysisParams,
        data: payload,
    };
}

export function serializeAudioFeatureCache(cache: AudioFeatureCache): SerializedAudioFeatureCache {
    const featureTracks: Record<string, SerializedAudioFeatureTrack> = {};
    for (const [key, track] of Object.entries(cache.featureTracks)) {
        featureTracks[key] = serializeTrack(track);
    }
    return {
        version: cache.version,
        audioSourceId: cache.audioSourceId,
        hopTicks: cache.hopTicks,
        hopSeconds: cache.hopSeconds,
        frameCount: cache.frameCount,
        analysisParams: cache.analysisParams,
        featureTracks,
    };
}

export function deserializeAudioFeatureCache(serialized: SerializedAudioFeatureCache): AudioFeatureCache {
    const featureTracks: Record<string, AudioFeatureTrack> = {};
    for (const [key, track] of Object.entries(serialized.featureTracks || {})) {
        featureTracks[key] = deserializeTrack(track);
    }
    return {
        version: serialized.version,
        audioSourceId: serialized.audioSourceId,
        hopTicks: serialized.hopTicks,
        hopSeconds: serialized.hopSeconds,
        frameCount: serialized.frameCount,
        analysisParams: serialized.analysisParams,
        featureTracks,
    };
}

function ensureCalculatorsRegistered(): AudioFeatureCalculator[] {
    const calculators = audioFeatureCalculatorRegistry.list();
    if (calculators.length) {
        return calculators;
    }
    const builtins: AudioFeatureCalculator[] = [
        createSpectrogramCalculator(),
        createRmsCalculator(),
        createWaveformCalculator(),
    ];
    for (const calc of builtins) {
        audioFeatureCalculatorRegistry.register(calc);
    }
    return audioFeatureCalculatorRegistry.list();
}

function createSpectrogramCalculator(): AudioFeatureCalculator {
    return {
        id: 'mvmnt.spectrogram',
        version: 2,
        featureKey: 'spectrogram',
        label: 'Spectrogram',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const { windowSize, hopSize } = analysisParams;
            const fftSize = Math.max(32, windowSize);
            const binCount = Math.floor(fftSize / 2) + 1;
            const window = hannWindow(windowSize);
            const output = new Float32Array(frameCount * binCount);
            const sampleRate = audioBuffer.sampleRate || 44100;
            const magnitudeScale = 2 / Math.max(1, windowSize);
            const binYieldInterval = Math.max(1, Math.floor(binCount / 8));
            const frameYieldInterval = Math.max(1, Math.floor(frameCount / 4));

            for (let frame = 0; frame < frameCount; frame++) {
                const start = frame * hopSize;
                for (let bin = 0; bin < binCount; bin++) {
                    let real = 0;
                    let imag = 0;
                    for (let n = 0; n < windowSize; n++) {
                        const sample = (mono[start + n] ?? 0) * window[n];
                        const angle = (-2 * Math.PI * bin * n) / fftSize;
                        real += sample * Math.cos(angle);
                        imag += sample * Math.sin(angle);
                    }
                    const magnitude = Math.sqrt(real * real + imag * imag) * magnitudeScale;
                    const decibels = 20 * Math.log10(magnitude + SPECTROGRAM_EPSILON);
                    const clamped = Math.max(SPECTROGRAM_MIN_DECIBELS, Math.min(SPECTROGRAM_MAX_DECIBELS, decibels));
                    output[frame * binCount + bin] = clamped;
                    if ((bin + 1) % binYieldInterval === 0) {
                        await maybeYield();
                    }
                }
                if ((frame + 1) % frameYieldInterval === 0) {
                    await maybeYield();
                }
                context.reportProgress?.(frame + 1, frameCount);
            }
            await maybeYield();

            return {
                key: 'spectrogram',
                calculatorId: 'mvmnt.spectrogram',
                version: 2,
                frameCount,
                channels: binCount,
                hopTicks,
                hopSeconds,
                format: 'float32',
                data: output,
                metadata: {
                    fftSize,
                    hopSize,
                    sampleRate,
                    window: 'hann',
                    minDecibels: SPECTROGRAM_MIN_DECIBELS,
                    maxDecibels: SPECTROGRAM_MAX_DECIBELS,
                },
                analysisParams: {
                    fftSize,
                    windowSize,
                    hopSize,
                    minDecibels: SPECTROGRAM_MIN_DECIBELS,
                    maxDecibels: SPECTROGRAM_MAX_DECIBELS,
                    window: 'hann',
                },
            };
        },
        serializeResult(track: AudioFeatureTrack) {
            return serializeTrack(track);
        },
        deserializeResult(payload: Record<string, unknown>) {
            const track = deserializeTrack(payload as SerializedAudioFeatureTrack);
            return track;
        },
    };
}

function createRmsCalculator(): AudioFeatureCalculator {
    return {
        id: 'mvmnt.rms',
        version: 1,
        featureKey: 'rms',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const { windowSize, hopSize } = analysisParams;
            const output = new Float32Array(frameCount);
            const frameYieldInterval = Math.max(1, Math.floor(frameCount / 12));
            for (let frame = 0; frame < frameCount; frame++) {
                const start = frame * hopSize;
                let sumSquares = 0;
                const end = Math.min(start + windowSize, mono.length);
                for (let i = start; i < end; i++) {
                    const sample = mono[i] ?? 0;
                    sumSquares += sample * sample;
                }
                const count = Math.max(1, end - start);
                output[frame] = Math.sqrt(sumSquares / count);
                if ((frame + 1) % frameYieldInterval === 0) {
                    await maybeYield();
                }
                context.reportProgress?.(frame + 1, frameCount);
            }
            await maybeYield();
            return {
                key: 'rms',
                calculatorId: 'mvmnt.rms',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds,
                format: 'float32',
                data: output,
                metadata: {
                    windowSize,
                },
            };
        },
        serializeResult(track: AudioFeatureTrack) {
            return serializeTrack(track);
        },
        deserializeResult(payload: Record<string, unknown>) {
            return deserializeTrack(payload as SerializedAudioFeatureTrack);
        },
    };
}

function createWaveformCalculator(): AudioFeatureCalculator {
    return {
        id: 'mvmnt.waveform',
        version: 1,
        featureKey: 'waveform',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const baseHopSize = Math.max(1, analysisParams.hopSize);
            const waveformHopSize = Math.max(1, Math.round(baseHopSize / WAVEFORM_OVERSAMPLE_FACTOR));
            const waveformFrameCount = computeFrameCount(mono.length, waveformHopSize, waveformHopSize);
            const minValues = new Float32Array(waveformFrameCount);
            const maxValues = new Float32Array(waveformFrameCount);
            const frameYieldInterval = Math.max(1, Math.floor(waveformFrameCount / 12));
            for (let frame = 0; frame < waveformFrameCount; frame++) {
                const start = frame * waveformHopSize;
                const end = Math.min(start + waveformHopSize, mono.length);
                let min = Number.POSITIVE_INFINITY;
                let max = Number.NEGATIVE_INFINITY;
                for (let i = start; i < end; i++) {
                    const value = mono[i] ?? 0;
                    if (value < min) min = value;
                    if (value > max) max = value;
                }
                if (!isFinite(min)) min = 0;
                if (!isFinite(max)) max = 0;
                minValues[frame] = min;
                maxValues[frame] = max;
                if ((frame + 1) % frameYieldInterval === 0) {
                    await maybeYield();
                }
                context.reportProgress?.(frame + 1, waveformFrameCount);
            }
            await maybeYield();
            const timingContext = createTimingContext(
                {
                    globalBpm: context.timing.globalBpm,
                    beatsPerBar: context.timing.beatsPerBar,
                    masterTempoMap: context.timing.tempoMap,
                },
                context.timing.ticksPerQuarter,
            );
            const waveformHopSeconds = waveformHopSize / audioBuffer.sampleRate;
            const waveformHopTicks = Math.max(
                1,
                Math.round(secondsToTicks(timingContext, waveformHopSeconds)),
            );
            return {
                key: 'waveform',
                calculatorId: 'mvmnt.waveform',
                version: 1,
                frameCount: waveformFrameCount,
                channels: 1,
                hopTicks: waveformHopTicks,
                hopSeconds: waveformHopSeconds,
                format: 'waveform-minmax',
                data: { min: minValues, max: maxValues },
                metadata: {
                    hopSize: waveformHopSize,
                    oversampleFactor: WAVEFORM_OVERSAMPLE_FACTOR,
                },
            };
        },
        serializeResult(track: AudioFeatureTrack) {
            return serializeTrack(track);
        },
        deserializeResult(payload: Record<string, unknown>) {
            return deserializeTrack(payload as SerializedAudioFeatureTrack);
        },
    };
}

export interface AnalyzeAudioFeatureOptions {
    audioSourceId: string;
    audioBuffer: AudioBuffer;
    globalBpm: number;
    beatsPerBar: number;
    tempoMap?: TempoMapEntry[];
    windowSize?: number;
    hopSize?: number;
    calculators?: string[];
    onProgress?: (value: number, label?: string) => void;
    signal?: AbortSignal;
}

export interface AnalyzeAudioFeatureResult {
    cache: AudioFeatureCache;
}

export async function analyzeAudioBufferFeatures(
    options: AnalyzeAudioFeatureOptions,
): Promise<AnalyzeAudioFeatureResult> {
    const calculators = ensureCalculatorsRegistered().filter((calc) =>
        options.calculators?.length ? options.calculators.includes(calc.id) : true,
    );
    if (!calculators.length) {
        throw new Error('No audio feature calculators registered');
    }
    const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
    const hopSize = options.hopSize ?? DEFAULT_HOP_SIZE;
    const frameCount = computeFrameCount(options.audioBuffer.length, windowSize, hopSize);
    const timingSlice = createTimingSlice(options.globalBpm, options.beatsPerBar, options.tempoMap);
    const timingContext = createTimingContext(
        {
            globalBpm: timingSlice.globalBpm,
            beatsPerBar: timingSlice.beatsPerBar,
            masterTempoMap: timingSlice.tempoMap,
        },
        timingSlice.ticksPerQuarter,
    );
    const hopSeconds = hopSize / options.audioBuffer.sampleRate;
    const hopTicks = Math.max(1, Math.round(secondsToTicks(timingContext, hopSeconds)));
    const analysisParams = createAnalysisParams(
        options.audioBuffer.sampleRate,
        options.tempoMap,
        calculators,
        windowSize,
        hopSize,
    );
    const featureTracks: Record<string, AudioFeatureTrack> = {};
    const progress = options.onProgress;
    const signal = options.signal;
    assertSignalNotAborted(signal);
    if (progress) {
        progress(0, 'start');
    }
    const totalCalculators = calculators.length;
    let completedCalculators = 0;
    const createCalculatorProgressReporter = (label: string) => {
        if (!progress || !totalCalculators) {
            return undefined;
        }
        let lastRatio = 0;
        return (processed: number, total: number) => {
            if (!progress || total <= 0) {
                return;
            }
            const bounded = Math.max(0, Math.min(processed, total));
            const ratio = Math.max(0, Math.min(1, bounded / total));
            if (ratio < lastRatio) {
                return;
            }
            lastRatio = ratio;
            const normalized = (completedCalculators + ratio) / totalCalculators;
            progress(normalized, label);
        };
    };
    for (let i = 0; i < calculators.length; i++) {
        const calculator = calculators[i];
        assertSignalNotAborted(signal);
        const prepared = calculator.prepare ? await calculator.prepare(analysisParams) : undefined;
        const label = calculator.label || calculator.featureKey;
        const reportProgress = createCalculatorProgressReporter(label);
        const context: AudioFeatureCalculatorContext = {
            audioBuffer: options.audioBuffer,
            hopTicks,
            hopSeconds,
            frameCount,
            analysisParams,
            timing: timingSlice,
            prepared,
            reportProgress,
            signal,
        };
        const result = await calculator.calculate(context);
        assertSignalNotAborted(signal);
        const tracks = Array.isArray(result) ? result : [result];
        for (const track of tracks) {
            featureTracks[track.key] = track;
        }
        completedCalculators += 1;
        if (progress) {
            progress(completedCalculators / totalCalculators, label);
        }
    }
    if (progress) {
        progress(1, 'complete');
    }
    return {
        cache: {
            version: 1,
            audioSourceId: options.audioSourceId,
            hopTicks,
            hopSeconds,
            frameCount,
            featureTracks,
            analysisParams,
        },
    };
}
