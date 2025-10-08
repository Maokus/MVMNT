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
    values: number[];
};

type SerializedWaveform = {
    type: 'waveform-minmax';
    min: number[];
    max: number[];
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
    data: SerializedTypedArray | SerializedWaveform;
    metadata?: Record<string, unknown>;
    analysisParams?: Record<string, unknown>;
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
const DEFAULT_HOP_SIZE = 1024;
const DEFAULT_SPECTROGRAM_BANDS = 32;

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

function mixBufferToMono(buffer: AudioBuffer): Float32Array {
    const frameCount = buffer.length;
    const channelCount = buffer.numberOfChannels || 1;
    const mono = new Float32Array(frameCount);
    for (let channel = 0; channel < channelCount; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            mono[i] += data[i] || 0;
        }
    }
    const invChannels = 1 / Math.max(1, channelCount);
    for (let i = 0; i < frameCount; i++) {
        mono[i] *= invChannels;
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
    if (serialized.type === 'float32') {
        return Float32Array.from(serialized.values);
    }
    if (serialized.type === 'uint8') {
        return Uint8Array.from(serialized.values);
    }
    return Int16Array.from(serialized.values);
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
    };
}

function deserializeTrack(track: SerializedAudioFeatureTrack): AudioFeatureTrack {
    let payload: AudioFeatureTrack['data'];
    if (track.format === 'waveform-minmax') {
        const waveform = track.data as SerializedWaveform;
        payload = {
            min: Float32Array.from(waveform.min ?? []),
            max: Float32Array.from(waveform.max ?? []),
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
        version: 1,
        featureKey: 'spectrogram',
        label: 'Spectrogram',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount } = context;
            const mono = mixBufferToMono(audioBuffer);
            const { windowSize, hopSize } = analysisParams;
            const bands = DEFAULT_SPECTROGRAM_BANDS;
            const window = hannWindow(windowSize);
            const output = new Float32Array(frameCount * bands);
            const binCount = windowSize / 2;
            const binsPerBand = Math.max(1, Math.floor(binCount / bands));
            const sampleRate = audioBuffer.sampleRate || 44100;
            for (let frame = 0; frame < frameCount; frame++) {
                const start = frame * hopSize;
                const slice = mono.subarray(start, start + windowSize);
                const magnitudes = new Float32Array(binCount);
                for (let k = 0; k < binCount; k++) {
                    let real = 0;
                    let imag = 0;
                    for (let n = 0; n < windowSize; n++) {
                        const sample = (slice[n] ?? 0) * window[n];
                        const angle = (-2 * Math.PI * k * n) / windowSize;
                        real += sample * Math.cos(angle);
                        imag += sample * Math.sin(angle);
                    }
                    magnitudes[k] = Math.sqrt(real * real + imag * imag);
                }
                for (let band = 0; band < bands; band++) {
                    let sum = 0;
                    const startBin = band * binsPerBand;
                    const endBin = Math.min(binCount, startBin + binsPerBand);
                    for (let bin = startBin; bin < endBin; bin++) {
                        sum += magnitudes[bin];
                    }
                    const avg = endBin > startBin ? sum / (endBin - startBin) : 0;
                    output[frame * bands + band] = avg;
                }
            }
            return {
                key: 'spectrogram',
                calculatorId: 'mvmnt.spectrogram',
                version: 1,
                frameCount,
                channels: DEFAULT_SPECTROGRAM_BANDS,
                hopTicks,
                hopSeconds,
                format: 'float32',
                data: output,
                metadata: {
                    bands,
                    sampleRate,
                },
                analysisParams: { bands },
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
        calculate(context: AudioFeatureCalculatorContext): AudioFeatureTrack {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount } = context;
            const mono = mixBufferToMono(audioBuffer);
            const { windowSize, hopSize } = analysisParams;
            const output = new Float32Array(frameCount);
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
            }
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
        calculate(context: AudioFeatureCalculatorContext): AudioFeatureTrack {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount } = context;
            const mono = mixBufferToMono(audioBuffer);
            const { hopSize } = analysisParams;
            const minValues = new Float32Array(frameCount);
            const maxValues = new Float32Array(frameCount);
            for (let frame = 0; frame < frameCount; frame++) {
                const start = frame * hopSize;
                const end = Math.min(start + hopSize, mono.length);
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
            }
            return {
                key: 'waveform',
                calculatorId: 'mvmnt.waveform',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds,
                format: 'waveform-minmax',
                data: { min: minValues, max: maxValues },
                metadata: {
                    hopSize,
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
    const assertNotAborted = () => {
        if (signal?.aborted) {
            const error = new Error('Audio feature analysis aborted');
            (error as Error).name = 'AbortError';
            throw error;
        }
    };
    assertNotAborted();
    if (progress) {
        progress(0, 'start');
    }
    for (let i = 0; i < calculators.length; i++) {
        const calculator = calculators[i];
        assertNotAborted();
        const prepared = calculator.prepare ? await calculator.prepare(analysisParams) : undefined;
        const context: AudioFeatureCalculatorContext = {
            audioBuffer: options.audioBuffer,
            hopTicks,
            hopSeconds,
            frameCount,
            analysisParams,
            timing: timingSlice,
            prepared,
            signal,
        };
        const result = await calculator.calculate(context);
        assertNotAborted();
        const tracks = Array.isArray(result) ? result : [result];
        for (const track of tracks) {
            featureTracks[track.key] = track;
        }
        if (progress) {
            progress((i + 1) / calculators.length, calculator.label || calculator.featureKey);
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
