import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
    AudioFeatureTempoProjection,
} from '../audioFeatureTypes';
import type { SerializedAudioFeatureTrack } from '../audioFeatureAnalysis';

const YIN_THRESHOLD = 0.12;
const MIN_FREQUENCY = 50;
const MAX_FREQUENCY = 2000;
const SMOOTHING_RADIUS = 1; // neighbors on each side for median smoothing
const OCTAVE_RATIO_UP = 1.6; // f0[i]/f0[i-1] above this → suspect octave jump up
const OCTAVE_RATIO_DOWN = 1 / OCTAVE_RATIO_UP;

// Channel indices in the interleaved float32 payload (frame * 4 + CH_*)
const CHANNEL_COUNT = 4;
const CH_F0 = 0;
const CH_CONFIDENCE = 1;
const CH_RMS = 2;
const CH_ANCHOR_SEC = 3;

interface YinResult {
    frequency: number;
    confidence: number;
    voiced: boolean;
}

const UNVOICED: YinResult = { frequency: 0, confidence: 0, voiced: false };

function detectYin(
    samples: Float32Array,
    start: number,
    length: number,
    sampleRate: number,
    minFrequency: number,
    maxFrequency: number
): YinResult {
    const bounded = Math.min(length, samples.length - start);
    if (bounded < 3) return UNVOICED;

    const maxTau = Math.min(Math.floor(sampleRate / Math.max(1, minFrequency)), bounded - 1);
    const minTau = Math.max(1, Math.floor(sampleRate / Math.max(1, maxFrequency)));
    if (maxTau <= minTau) return UNVOICED;

    const diff = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
        let sum = 0;
        for (let i = 0; i < bounded - tau; i++) {
            const delta = (samples[start + i] ?? 0) - (samples[start + i + tau] ?? 0);
            sum += delta * delta;
        }
        diff[tau] = sum;
    }

    const cmnd = new Float32Array(maxTau + 1);
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
        running += diff[tau];
        cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
    }

    let bestTau = -1;
    let bestCmnd = Number.POSITIVE_INFINITY;
    let voiced = false;
    for (let tau = minTau; tau <= maxTau; tau++) {
        const c = cmnd[tau] ?? 1;
        if (c < YIN_THRESHOLD) {
            bestTau = tau;
            bestCmnd = c;
            voiced = true;
            // Walk to local minimum
            while (tau + 1 <= maxTau && (cmnd[tau + 1] ?? 1) <= (cmnd[tau] ?? 1)) {
                tau++;
                bestTau = tau;
                bestCmnd = cmnd[tau] ?? 1;
            }
            break;
        }
        if (c < bestCmnd) {
            bestCmnd = c;
            bestTau = tau;
        }
    }

    if (bestTau <= 0) return UNVOICED;

    let refined = bestTau;
    if (bestTau > 1 && bestTau < maxTau) {
        const prev = cmnd[bestTau - 1] ?? 1;
        const curr = cmnd[bestTau] ?? 1;
        const next = cmnd[bestTau + 1] ?? 1;
        const denom = 2 * curr - prev - next;
        if (denom !== 0) refined = bestTau + (next - prev) / (2 * denom);
    }

    if (!Number.isFinite(refined) || refined <= 0) return UNVOICED;
    const frequency = sampleRate / refined;
    if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) return UNVOICED;

    const confidence = voiced ? Math.max(0, Math.min(1, 1 - bestCmnd / YIN_THRESHOLD)) : 0;
    return { frequency, confidence, voiced };
}

function computeRms(samples: Float32Array, start: number, length: number): number {
    const n = Math.min(length, samples.length - start);
    if (n <= 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const s = samples[start + i] ?? 0;
        sum += s * s;
    }
    return Math.sqrt(sum / n);
}

function findPositiveZeroCrossing(
    samples: Float32Array,
    centerIndex: number,
    winStart: number,
    winEnd: number
): number | null {
    const start = Math.max(0, winStart);
    const end = Math.min(winEnd - 1, samples.length - 2);
    if (end <= start) return null;

    let bestIndex: number | null = null;
    let bestDistance = Infinity;
    for (let i = start; i <= end; i++) {
        const a = samples[i] ?? 0;
        const b = samples[i + 1] ?? 0;
        if (a <= 0 && b > 0) {
            const distance = Math.abs(i - centerIndex);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i + 1;
            }
        }
    }
    return bestIndex;
}

function medianOf3(a: number, b: number, c: number): number {
    if (a > b) {
        if (b > c) return b;
        if (a > c) return c;
        return a;
    }
    if (a > c) return a;
    if (b > c) return c;
    return b;
}

export interface PitchGuideCalculatorDependencies {
    createAnalysisYieldController: (signal?: AbortSignal) => () => Promise<void>;
    mixBufferToMono: (buffer: AudioBuffer, maybeYield?: () => Promise<void>) => Promise<Float32Array>;
    cloneTempoProjection: (projection: AudioFeatureTempoProjection, hopTicks: number) => AudioFeatureTempoProjection;
    serializeTrack: (track: AudioFeatureTrack) => SerializedAudioFeatureTrack;
    deserializeTrack: (payload: SerializedAudioFeatureTrack) => AudioFeatureTrack;
}

export function createPitchGuideCalculator({
    createAnalysisYieldController,
    mixBufferToMono,
    cloneTempoProjection,
    serializeTrack,
    deserializeTrack,
}: PitchGuideCalculatorDependencies): AudioFeatureCalculator {
    return {
        id: 'mvmnt.pitchGuide',
        version: 1,
        featureKey: 'pitchGuide',
        label: 'Pitch Guide',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const sampleRate = audioBuffer.sampleRate || analysisParams.sampleRate || 44100;
            const { windowSize, hopSize } = analysisParams;
            const maxFrequency = Math.min(sampleRate / 2 - 1, MAX_FREQUENCY);
            const frameYieldInterval = Math.max(1, Math.floor(frameCount / 16));

            const data = new Float32Array(frameCount * CHANNEL_COUNT);

            // Pass 1: per-frame pitch, confidence, RMS, anchor
            for (let frame = 0; frame < frameCount; frame++) {
                const frameCenter = frame * hopSize + Math.floor(hopSize / 2);
                const windowHalf = Math.floor(windowSize / 2);
                const winStart = Math.max(0, frameCenter - windowHalf);
                const winEnd = Math.min(mono.length, frameCenter + windowHalf);
                const winLength = winEnd - winStart;

                const yin =
                    winLength >= 3
                        ? detectYin(mono, winStart, winLength, sampleRate, MIN_FREQUENCY, maxFrequency)
                        : UNVOICED;

                const rms = computeRms(mono, winStart, winLength);

                let anchorSec = frameCenter / sampleRate;
                if (yin.voiced && yin.frequency > 0) {
                    const zeroCross = findPositiveZeroCrossing(mono, frameCenter, winStart, winEnd);
                    if (zeroCross != null) {
                        anchorSec = zeroCross / sampleRate;
                    }
                }

                const offset = frame * CHANNEL_COUNT;
                data[offset + CH_F0] = yin.frequency;
                data[offset + CH_CONFIDENCE] = yin.confidence;
                data[offset + CH_RMS] = Math.min(1, rms);
                data[offset + CH_ANCHOR_SEC] = anchorSec;

                if ((frame + 1) % frameYieldInterval === 0) {
                    await maybeYield();
                }
                context.reportProgress?.(frame + 1, frameCount);
            }

            // Pass 2: octave-jump correction (single forward pass)
            for (let frame = 1; frame < frameCount; frame++) {
                const cur = data[frame * CHANNEL_COUNT + CH_F0];
                const prev = data[(frame - 1) * CHANNEL_COUNT + CH_F0];
                if (cur <= 0 || prev <= 0) continue;
                const ratio = cur / prev;
                if (ratio > OCTAVE_RATIO_UP && cur / 2 >= MIN_FREQUENCY) {
                    data[frame * CHANNEL_COUNT + CH_F0] = cur / 2;
                } else if (ratio < OCTAVE_RATIO_DOWN && cur * 2 <= maxFrequency) {
                    data[frame * CHANNEL_COUNT + CH_F0] = cur * 2;
                }
            }

            // Pass 3: 3-frame median smoothing for f0 (voiced frames only)
            const smoothedF0 = new Float32Array(frameCount);
            for (let frame = 0; frame < frameCount; frame++) {
                const cur = data[frame * CHANNEL_COUNT + CH_F0];
                if (cur <= 0) {
                    smoothedF0[frame] = 0;
                    continue;
                }
                const prev = frame > SMOOTHING_RADIUS - 1 ? data[(frame - 1) * CHANNEL_COUNT + CH_F0] : cur;
                const next = frame < frameCount - SMOOTHING_RADIUS ? data[(frame + 1) * CHANNEL_COUNT + CH_F0] : cur;
                smoothedF0[frame] = medianOf3(prev > 0 ? prev : cur, cur, next > 0 ? next : cur);
            }
            for (let frame = 0; frame < frameCount; frame++) {
                if (data[frame * CHANNEL_COUNT + CH_F0] > 0) {
                    data[frame * CHANNEL_COUNT + CH_F0] = smoothedF0[frame];
                }
            }

            await maybeYield();

            const track: AudioFeatureTrack = {
                key: 'pitchGuide',
                calculatorId: 'mvmnt.pitchGuide',
                version: 1,
                frameCount,
                channels: CHANNEL_COUNT,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: cloneTempoProjection(context.tempoProjection, hopTicks),
                format: 'float32',
                data,
                metadata: {
                    windowSize,
                    hopSize,
                    yinThreshold: YIN_THRESHOLD,
                    minFrequency: MIN_FREQUENCY,
                    maxFrequency,
                    sampleRate,
                },
                channelAliases: ['f0', 'confidence', 'rms', 'anchorSec'],
                channelLayout: { aliases: ['f0', 'confidence', 'rms', 'anchorSec'] },
                analysisProfileId: context.analysisProfileId,
            };

            return track;
        },
        serializeResult(track: AudioFeatureTrack) {
            return serializeTrack(track);
        },
        deserializeResult(payload: Record<string, unknown>) {
            return deserializeTrack(payload as SerializedAudioFeatureTrack);
        },
    };
}
