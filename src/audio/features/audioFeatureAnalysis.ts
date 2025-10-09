import { audioFeatureCalculatorRegistry } from './audioFeatureRegistry';
import {
    type AudioFeatureAnalysisParams,
    type AudioFeatureAnalysisProfileDescriptor,
    type AudioFeatureCalculator,
    type AudioFeatureCalculatorContext,
    type AudioFeatureCache,
    type AudioFeatureCalculatorTiming,
    type AudioFeatureTempoProjection,
    type AudioFeatureTrack,
    type AudioFeatureTrackFormat,
} from './audioFeatureTypes';
import { normalizeHopTicks, quantizeHopTicks } from './hopQuantization';
import { createFftPlan, fftRadix2 } from './fft';
import { createTempoMapper, type TempoMapper } from '@core/timing';
import { getSharedTimingManager } from '@state/timelineStore';
import type { TempoMapEntry } from '@state/timelineTypes';

const DEFAULT_ANALYSIS_PROFILE_ID = 'default';

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

type SerializedTempoProjection = {
    hopTicks?: number;
    startTick?: number;
    tempoMapHash?: string;
};

export type SerializedAudioFeatureTrack = {
    key: string;
    calculatorId: string;
    version: number;
    frameCount: number;
    channels: number;
    hopTicks?: number;
    hopSeconds: number;
    startTimeSeconds: number;
    tempoProjection?: SerializedTempoProjection;
    format: AudioFeatureTrackFormat;
    data?: SerializedTypedArray | SerializedWaveform;
    metadata?: Record<string, unknown>;
    analysisParams?: Record<string, unknown>;
    channelAliases?: string[] | null;
    analysisProfileId?: string | null;
    dataRef?: SerializedAudioFeatureTrackDataRef;
};

export interface SerializedAudioFeatureCacheLegacy {
    version: 1;
    audioSourceId: string;
    hopTicks: number;
    hopSeconds: number;
    frameCount: number;
    analysisParams: AudioFeatureAnalysisParams;
    featureTracks: Record<string, SerializedAudioFeatureTrack>;
}

export interface SerializedAudioFeatureCacheV2 {
    version: 2;
    audioSourceId: string;
    hopTicks: number;
    hopSeconds: number;
    startTimeSeconds?: number;
    tempoProjection?: SerializedTempoProjection;
    frameCount: number;
    analysisParams: AudioFeatureAnalysisParams;
    featureTracks: Record<string, SerializedAudioFeatureTrack>;
    analysisProfiles?: Record<string, AudioFeatureAnalysisProfileDescriptor>;
    defaultAnalysisProfileId?: string | null;
    channelAliases?: string[] | null;
}

export interface SerializedAudioFeatureCache {
    version: 3;
    audioSourceId: string;
    hopSeconds: number;
    startTimeSeconds: number;
    frameCount: number;
    analysisParams: AudioFeatureAnalysisParams;
    featureTracks: Record<string, SerializedAudioFeatureTrack>;
    tempoProjection?: SerializedTempoProjection;
    legacyTempoCache?: SerializedAudioFeatureCacheLegacy;
    analysisProfiles: Record<string, AudioFeatureAnalysisProfileDescriptor>;
    defaultAnalysisProfileId: string;
    channelAliases?: string[];
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

function toSerializedTempoProjection(
    projection: AudioFeatureTempoProjection | undefined,
): SerializedTempoProjection | undefined {
    if (!projection) {
        return undefined;
    }
    return {
        hopTicks: projection.hopTicks,
        startTick: projection.startTick,
        tempoMapHash: projection.tempoMapHash,
    };
}

function fromSerializedTempoProjection(
    projection: SerializedTempoProjection | undefined,
): AudioFeatureTempoProjection | undefined {
    if (!projection) {
        return undefined;
    }
    const hopTicks = Math.max(1, Math.round(projection.hopTicks ?? 1));
    return {
        hopTicks,
        startTick: projection.startTick ?? 0,
        tempoMapHash: projection.tempoMapHash,
    };
}

function resolveHopTicks(
    track: Pick<AudioFeatureTrack, 'hopTicks' | 'tempoProjection' | 'hopSeconds'>,
    fallbackProjection?: AudioFeatureTempoProjection,
    tempoMapper?: TempoMapper,
): number {
    const direct = normalizeHopTicks(track.hopTicks);
    if (direct != null) {
        return direct;
    }
    const projectionCandidate =
        normalizeHopTicks(track.tempoProjection?.hopTicks) != null
            ? track.tempoProjection
            : fallbackProjection;
    if (tempoMapper) {
        return quantizeHopTicks({
            hopSeconds: track.hopSeconds,
            tempoMapper,
            tempoProjection: projectionCandidate,
        });
    }
    const projectionHop = normalizeHopTicks(projectionCandidate?.hopTicks);
    if (projectionHop != null) {
        return projectionHop;
    }
    const hopSeconds = track.hopSeconds;
    if (Number.isFinite(hopSeconds) && hopSeconds > 0) {
        const fallbackTicks = getSharedTimingManager().secondsToTicks(hopSeconds);
        const normalized = normalizeHopTicks(fallbackTicks);
        if (normalized != null) {
            return normalized;
        }
    }
    return 1;
}

function clonePlainObject<T>(value: T): T {
    if (value == null) {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return value;
    }
}

function inferChannelAliases(channelCount: number): string[] {
    const count = Math.max(1, Math.round(channelCount || 1));
    if (count === 1) {
        return ['Mono'];
    }
    if (count === 2) {
        return ['Left', 'Right'];
    }
    if (count === 3) {
        return ['Left', 'Right', 'Center'];
    }
    if (count === 4) {
        return ['Front Left', 'Front Right', 'Rear Left', 'Rear Right'];
    }
    return Array.from({ length: count }, (_, index) => `Channel ${index + 1}`);
}

function buildDefaultProfile(
    params: AudioFeatureAnalysisParams,
    id: string = DEFAULT_ANALYSIS_PROFILE_ID,
): Record<string, AudioFeatureAnalysisProfileDescriptor> {
    const descriptor: AudioFeatureAnalysisProfileDescriptor = {
        id,
        windowSize: params.windowSize,
        hopSize: params.hopSize,
        overlap: params.overlap,
        smoothing: params.smoothing,
        sampleRate: params.sampleRate,
        fftSize: params.fftSize,
        minDecibels: params.minDecibels,
        maxDecibels: params.maxDecibels,
        window: params.window,
    };
    return { [id]: descriptor };
}

function cloneSerializedTrackData(
    data: SerializedAudioFeatureTrack['data'],
): SerializedAudioFeatureTrack['data'] {
    if (!data) {
        return undefined;
    }
    if (data.type === 'waveform-minmax') {
        const cloneValues = (values: SerializedWaveform['min']) => {
            if (Array.isArray(values)) {
                return values.slice();
            }
            if (ArrayBuffer.isView(values)) {
                return Array.from(values as ArrayLike<number>);
            }
            return [];
        };
        return {
            type: 'waveform-minmax',
            min: cloneValues(data.min),
            max: cloneValues(data.max),
        };
    }
    const values = data.values as SerializedTypedArray['values'];
    if (Array.isArray(values)) {
        return { type: data.type, values: values.slice() };
    }
    if (ArrayBuffer.isView(values)) {
        return { type: data.type, values: Array.from(values as ArrayLike<number>) };
    }
    return { type: data.type, values: [] };
}

function buildLegacyCache(
    cache: AudioFeatureCache,
    serializedTracks: Record<string, SerializedAudioFeatureTrack>,
): SerializedAudioFeatureCacheLegacy {
    const legacyTracks: Record<string, SerializedAudioFeatureTrack> = {};
    for (const [key, serialized] of Object.entries(serializedTracks)) {
        const source = cache.featureTracks[key];
        const hopTicks = source ? resolveHopTicks(source) : Math.max(1, Math.round(serialized.hopTicks ?? 1));
        legacyTracks[key] = {
            key: serialized.key,
            calculatorId: serialized.calculatorId,
            version: serialized.version,
            frameCount: serialized.frameCount,
            channels: serialized.channels,
            hopTicks,
            hopSeconds: serialized.hopSeconds,
            startTimeSeconds: serialized.startTimeSeconds ?? 0,
            format: serialized.format,
            metadata: clonePlainObject(serialized.metadata),
            analysisParams: clonePlainObject(serialized.analysisParams),
            data: cloneSerializedTrackData(serialized.data),
            dataRef: serialized.dataRef ? { ...serialized.dataRef } : undefined,
        };
    }
    return {
        version: 1,
        audioSourceId: cache.audioSourceId,
        hopTicks: resolveHopTicks({
            hopTicks: cache.hopTicks,
            tempoProjection: cache.tempoProjection,
            hopSeconds: cache.hopSeconds,
        }),
        hopSeconds: cache.hopSeconds,
        frameCount: cache.frameCount,
        analysisParams: clonePlainObject(cache.analysisParams),
        featureTracks: legacyTracks,
    };
}

function cloneTempoProjection(
    projection: AudioFeatureTempoProjection,
    hopTicks: number,
): AudioFeatureTempoProjection {
    return {
        hopTicks,
        startTick: projection.startTick,
        tempoMapHash: projection.tempoMapHash,
    };
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
        hopSeconds: track.hopSeconds,
        hopTicks: track.hopTicks,
        startTimeSeconds: track.startTimeSeconds ?? 0,
        tempoProjection: toSerializedTempoProjection(track.tempoProjection),
        format: track.format,
        metadata: track.metadata,
        analysisParams: track.analysisParams,
        channelAliases: track.channelAliases ?? undefined,
        analysisProfileId: track.analysisProfileId ?? undefined,
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
    const hopTicks = Math.max(1, Math.round(track.hopTicks ?? track.tempoProjection?.hopTicks ?? 1));
    return {
        key: track.key,
        calculatorId: track.calculatorId,
        version: track.version,
        frameCount: track.frameCount,
        channels: track.channels,
        hopSeconds: track.hopSeconds,
        hopTicks,
        startTimeSeconds: track.startTimeSeconds ?? 0,
        tempoProjection: fromSerializedTempoProjection(track.tempoProjection) ?? {
            hopTicks,
            startTick: 0,
            tempoMapHash: undefined,
        },
        format: track.format,
        metadata: track.metadata,
        analysisParams: track.analysisParams,
        channelAliases: track.channelAliases ?? null,
        analysisProfileId: track.analysisProfileId ?? null,
        data: payload,
    };
}

export function serializeAudioFeatureCache(cache: AudioFeatureCache): SerializedAudioFeatureCache {
    const featureTracks: Record<string, SerializedAudioFeatureTrack> = {};
    for (const [key, track] of Object.entries(cache.featureTracks)) {
        featureTracks[key] = serializeTrack(track);
    }
    const normalizedProfiles =
        cache.analysisProfiles && Object.keys(cache.analysisProfiles).length > 0
            ? clonePlainObject(cache.analysisProfiles)
            : buildDefaultProfile(cache.analysisParams);
    const defaultProfileId =
        typeof cache.defaultAnalysisProfileId === 'string' && cache.defaultAnalysisProfileId.trim().length > 0
            ? cache.defaultAnalysisProfileId
            : DEFAULT_ANALYSIS_PROFILE_ID;
    const channelAliases =
        Array.isArray(cache.channelAliases) && cache.channelAliases.length > 0
            ? cache.channelAliases.slice()
            : undefined;
    const serialized: SerializedAudioFeatureCache = {
        version: 3,
        audioSourceId: cache.audioSourceId,
        hopSeconds: cache.hopSeconds,
        startTimeSeconds: cache.startTimeSeconds ?? 0,
        frameCount: cache.frameCount,
        analysisParams: cache.analysisParams,
        featureTracks,
        tempoProjection: toSerializedTempoProjection(cache.tempoProjection),
        legacyTempoCache: buildLegacyCache(cache, featureTracks),
        analysisProfiles: normalizedProfiles,
        defaultAnalysisProfileId: defaultProfileId,
        channelAliases,
    };
    return serialized;
}

export function deserializeAudioFeatureCache(
    serialized:
        | SerializedAudioFeatureCache
        | SerializedAudioFeatureCacheV2
        | SerializedAudioFeatureCacheLegacy,
): AudioFeatureCache {
    if (!serialized || typeof serialized !== 'object') {
        throw new Error('Invalid audio feature cache payload');
    }
    if (serialized.version === 3) {
        const featureTracks: Record<string, AudioFeatureTrack> = {};
        for (const [key, track] of Object.entries(serialized.featureTracks || {})) {
            featureTracks[key] = deserializeTrack(track);
        }
        const tempoProjection = fromSerializedTempoProjection(serialized.tempoProjection);
        const hopTicks = resolveHopTicks({
            hopTicks: serialized.tempoProjection?.hopTicks,
            tempoProjection,
            hopSeconds: serialized.hopSeconds,
        });
        return {
            version: 3,
            audioSourceId: serialized.audioSourceId,
            hopTicks,
            hopSeconds: serialized.hopSeconds,
            startTimeSeconds: serialized.startTimeSeconds ?? 0,
            tempoProjection,
            frameCount: serialized.frameCount,
            analysisParams: serialized.analysisParams,
            featureTracks,
            analysisProfiles:
                Object.keys(serialized.analysisProfiles || {}).length > 0
                    ? clonePlainObject(serialized.analysisProfiles)
                    : buildDefaultProfile(serialized.analysisParams),
            defaultAnalysisProfileId: serialized.defaultAnalysisProfileId || DEFAULT_ANALYSIS_PROFILE_ID,
            channelAliases: serialized.channelAliases ? serialized.channelAliases.slice() : undefined,
        };
    }
    if (serialized.version === 2) {
        const featureTracks: Record<string, AudioFeatureTrack> = {};
        for (const [key, track] of Object.entries(serialized.featureTracks || {})) {
            const hydrated = deserializeTrack(track);
            featureTracks[key] = {
                ...hydrated,
                analysisProfileId: hydrated.analysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID,
                channelAliases: hydrated.channelAliases ?? null,
            };
        }
        const tempoProjection = fromSerializedTempoProjection(serialized.tempoProjection);
        const hopTicks = resolveHopTicks({
            hopTicks: serialized.tempoProjection?.hopTicks,
            tempoProjection,
            hopSeconds: serialized.hopSeconds,
        });
        return {
            version: 3,
            audioSourceId: serialized.audioSourceId,
            hopTicks,
            hopSeconds: serialized.hopSeconds,
            startTimeSeconds: serialized.startTimeSeconds ?? 0,
            tempoProjection,
            frameCount: serialized.frameCount,
            analysisParams: serialized.analysisParams,
            featureTracks,
            analysisProfiles: buildDefaultProfile(serialized.analysisParams),
            defaultAnalysisProfileId: DEFAULT_ANALYSIS_PROFILE_ID,
            channelAliases: undefined,
        };
    }
    const legacy = serialized as SerializedAudioFeatureCacheLegacy;
    const featureTracks: Record<string, AudioFeatureTrack> = {};
    const defaultProfileId = DEFAULT_ANALYSIS_PROFILE_ID;
    const tempoProjection: AudioFeatureTempoProjection = {
        hopTicks: Math.max(1, Math.round(legacy.hopTicks)),
        startTick: 0,
        tempoMapHash: legacy.analysisParams?.tempoMapHash,
    };
    for (const [key, track] of Object.entries(legacy.featureTracks || {})) {
        const hopTicks = Math.max(1, Math.round(track.hopTicks ?? legacy.hopTicks));
        featureTracks[key] = {
            key: track.key,
            calculatorId: track.calculatorId,
            version: track.version,
            frameCount: track.frameCount,
            channels: track.channels,
            hopSeconds: track.hopSeconds,
            hopTicks,
            startTimeSeconds: track.startTimeSeconds ?? 0,
            tempoProjection: {
                hopTicks,
                startTick: 0,
                tempoMapHash: legacy.analysisParams?.tempoMapHash,
            },
            format: track.format,
            metadata: track.metadata,
            analysisParams: track.analysisParams,
            data: deserializeTrack(track).data,
            analysisProfileId: DEFAULT_ANALYSIS_PROFILE_ID,
            channelAliases: null,
        };
    }
    return {
        version: 3,
        audioSourceId: legacy.audioSourceId,
        hopTicks: tempoProjection.hopTicks,
        hopSeconds: legacy.hopSeconds,
        startTimeSeconds: 0,
        tempoProjection,
        frameCount: legacy.frameCount,
        analysisParams: legacy.analysisParams,
        featureTracks,
        analysisProfiles: buildDefaultProfile(legacy.analysisParams),
        defaultAnalysisProfileId: DEFAULT_ANALYSIS_PROFILE_ID,
        channelAliases: undefined,
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
        version: 3,
        featureKey: 'spectrogram',
        label: 'Spectrogram',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const { windowSize, hopSize } = analysisParams;
            const fftSize = Math.pow(2, Math.ceil(Math.log2(Math.max(32, windowSize))));
            const binCount = Math.floor(fftSize / 2) + 1;
            const window = hannWindow(windowSize);
            const output = new Float32Array(frameCount * binCount);
            const sampleRate = audioBuffer.sampleRate || 44100;
            const magnitudeScale = 2 / Math.max(1, windowSize);
            const binYieldInterval = Math.max(1, Math.floor(binCount / 8));
            const frameYieldInterval = Math.max(1, Math.floor(frameCount / 4));
            const fftPlan = createFftPlan(fftSize);
            const real = new Float32Array(fftSize);
            const imag = new Float32Array(fftSize);

            for (let frame = 0; frame < frameCount; frame++) {
                const start = frame * hopSize;
                real.fill(0);
                imag.fill(0);
                for (let n = 0; n < windowSize; n++) {
                    real[n] = (mono[start + n] ?? 0) * window[n];
                }
                fftRadix2(real, imag, fftPlan);
                for (let bin = 0; bin < binCount; bin++) {
                    const realValue = real[bin];
                    const imagValue = imag[bin];
                    const magnitude = Math.sqrt(realValue * realValue + imagValue * imagValue) * magnitudeScale;
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
                version: 3,
                frameCount,
                channels: binCount,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: cloneTempoProjection(context.tempoProjection, hopTicks),
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
                analysisProfileId: 'default',
                channelAliases: null,
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
                startTimeSeconds: 0,
                tempoProjection: cloneTempoProjection(context.tempoProjection, hopTicks),
                format: 'float32',
                data: output,
                metadata: {
                    windowSize,
                },
                channelAliases: inferChannelAliases(audioBuffer.numberOfChannels || 1),
                analysisProfileId: 'default',
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
            const { audioBuffer, analysisParams, signal, tempoMapper } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const totalSamples = mono.length;
            const sampleRate = audioBuffer.sampleRate || analysisParams.sampleRate || 44100;
            const baseHopSeconds = Math.max(context.hopSeconds, analysisParams.hopSize / sampleRate);
            const minHopSeconds = 1 / sampleRate;
            const waveformHopSeconds = Math.max(baseHopSeconds / WAVEFORM_OVERSAMPLE_FACTOR, minHopSeconds);
            const waveformHopSamples = Math.max(waveformHopSeconds * sampleRate, 1);
            const waveformFrameCount = Math.max(1, Math.ceil(totalSamples / waveformHopSamples));
            const minValues = new Float32Array(waveformFrameCount);
            const maxValues = new Float32Array(waveformFrameCount);
            const frameYieldInterval = Math.max(1, Math.floor(waveformFrameCount / 12));
            for (let frame = 0; frame < waveformFrameCount; frame++) {
                const frameStart = Math.floor(frame * waveformHopSamples);
                const frameEnd =
                    frame === waveformFrameCount - 1
                        ? totalSamples
                        : Math.ceil((frame + 1) * waveformHopSamples);
                const start = Math.max(0, Math.min(totalSamples - 1, frameStart));
                let end = Math.min(totalSamples, frameEnd);
                if (end <= start) {
                    end = Math.min(totalSamples, start + 1);
                }
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
            const waveformHopTicks = quantizeHopTicks({
                hopSeconds: waveformHopSeconds,
                tempoMapper,
            });
            return {
                key: 'waveform',
                calculatorId: 'mvmnt.waveform',
                version: 1,
                frameCount: waveformFrameCount,
                channels: 1,
                hopTicks: waveformHopTicks,
                hopSeconds: waveformHopSeconds,
                startTimeSeconds: 0,
                tempoProjection: cloneTempoProjection(context.tempoProjection, waveformHopTicks),
                format: 'waveform-minmax',
                data: { min: minValues, max: maxValues },
                metadata: {
                    hopSize: waveformHopSamples,
                    oversampleFactor: WAVEFORM_OVERSAMPLE_FACTOR,
                },
                channelAliases: inferChannelAliases(audioBuffer.numberOfChannels || 1),
                analysisProfileId: 'default',
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
    const tempoMapper = createTempoMapper({
        ticksPerQuarter: timingSlice.ticksPerQuarter,
        globalBpm: timingSlice.globalBpm,
        tempoMap: options.tempoMap,
    });
    const hopSeconds = hopSize / options.audioBuffer.sampleRate;
    const analysisParams = createAnalysisParams(
        options.audioBuffer.sampleRate,
        options.tempoMap,
        calculators,
        windowSize,
        hopSize,
    );
    const hopTicks = quantizeHopTicks({
        hopSeconds,
        tempoMapper,
    });
    const tempoProjection: AudioFeatureTempoProjection = {
        hopTicks,
        startTick: 0,
        tempoMapHash: analysisParams.tempoMapHash,
    };
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
            tempoProjection,
            tempoMapper,
            prepared,
            reportProgress,
            signal,
        };
        const result = await calculator.calculate(context);
        assertSignalNotAborted(signal);
        const tracks = Array.isArray(result) ? result : [result];
        for (const track of tracks) {
            const projectedHopTicks = resolveHopTicks(track, tempoProjection, tempoMapper);
            track.hopTicks = projectedHopTicks;
            track.startTimeSeconds = track.startTimeSeconds ?? 0;
            track.tempoProjection = track.tempoProjection
                ? cloneTempoProjection(track.tempoProjection, projectedHopTicks)
                : cloneTempoProjection(tempoProjection, projectedHopTicks);
            track.analysisProfileId = track.analysisProfileId ?? DEFAULT_ANALYSIS_PROFILE_ID;
            if (track.channelAliases === undefined) {
                if (track.channels > 1 && track.channels <= 8) {
                    track.channelAliases = inferChannelAliases(track.channels);
                } else if (track.channels <= 1) {
                    track.channelAliases = inferChannelAliases(options.audioBuffer.numberOfChannels || 1);
                } else {
                    track.channelAliases = null;
                }
            }
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
    const analysisProfiles = buildDefaultProfile(analysisParams, DEFAULT_ANALYSIS_PROFILE_ID);
    const channelAliases = inferChannelAliases(options.audioBuffer.numberOfChannels || 1);
    return {
        cache: {
            version: 3,
            audioSourceId: options.audioSourceId,
            hopTicks,
            hopSeconds,
            startTimeSeconds: 0,
            tempoProjection,
            frameCount,
            featureTracks,
            analysisParams,
            analysisProfiles,
            defaultAnalysisProfileId: DEFAULT_ANALYSIS_PROFILE_ID,
            channelAliases,
        },
    };
}
