import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
    AudioFeatureTempoProjection,
} from '../audioFeatureTypes';
import type { SerializedAudioFeatureTrack } from '../audioFeatureAnalysis';

const YIN_THRESHOLD = 0.1;
const MIN_FREQUENCY = 50;
const MAX_FREQUENCY = 2000;

function detectYinPitch(
    samples: Float32Array,
    start: number,
    length: number,
    sampleRate: number,
    threshold: number,
    minFrequency: number,
    maxFrequency: number,
): number | null {
    const boundedLength = Math.max(0, Math.min(length, samples.length - start));
    if (boundedLength < 3) {
        return null;
    }

    const maxTau = Math.min(Math.floor(sampleRate / Math.max(1, minFrequency)), boundedLength - 1);
    const minTau = Math.max(1, Math.floor(sampleRate / Math.max(1, maxFrequency)));
    if (maxTau <= minTau) {
        return null;
    }

    const diff = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau += 1) {
        let sum = 0;
        for (let i = 0; i < boundedLength - tau; i += 1) {
            const delta = (samples[start + i] ?? 0) - (samples[start + i + tau] ?? 0);
            sum += delta * delta;
        }
        diff[tau] = sum;
    }

    const cmnd = new Float32Array(maxTau + 1);
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
        running += diff[tau];
        cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
    }

    let bestTau = -1;
    let bestValue = Number.POSITIVE_INFINITY;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
        const value = cmnd[tau];
        if (value < threshold) {
            bestTau = tau;
            while (tau + 1 <= maxTau && cmnd[tau + 1] <= value) {
                tau += 1;
                bestTau = tau;
            }
            break;
        }
        if (value < bestValue) {
            bestValue = value;
            bestTau = tau;
        }
    }

    if (bestTau <= 0) {
        return null;
    }

    let refined = bestTau;
    if (bestTau > 1 && bestTau < maxTau) {
        const prev = cmnd[bestTau - 1];
        const curr = cmnd[bestTau];
        const next = cmnd[bestTau + 1];
        const denom = 2 * curr - prev - next;
        if (denom !== 0) {
            refined = bestTau + (next - prev) / (2 * denom);
        }
    }

    if (!Number.isFinite(refined) || refined <= 0) {
        return null;
    }

    const frequency = sampleRate / refined;
    if (!Number.isFinite(frequency) || frequency <= 0) {
        return null;
    }

    return frequency;
}

function findNearestZeroCrossing(
    samples: Float32Array,
    centerIndex: number,
    windowStart: number,
    windowEnd: number,
    preferredLength: number,
): number | null {
    if (!samples.length) {
        return null;
    }

    const start = Math.max(0, Math.min(windowStart, samples.length - 1));
    const end = Math.max(start, Math.min(windowEnd, samples.length) - 1);
    if (end <= start) {
        return null;
    }

    const radius = Math.max(1, Math.min(samples.length, preferredLength * 2));
    const searchStart = Math.max(start, centerIndex - radius);
    const searchEnd = Math.min(end, centerIndex + radius);

    let bestPositive: { index: number; distance: number } | null = null;
    let bestAny: { index: number; distance: number } | null = null;

    for (let i = searchStart; i <= searchEnd; i += 1) {
        const a = samples[i] ?? 0;
        const b = samples[i + 1] ?? 0;
        const distance = Math.abs(i - centerIndex);

        if (a <= 0 && b > 0) {
            if (!bestPositive || distance < bestPositive.distance) {
                bestPositive = { index: i, distance };
            }
        }

        if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) {
            if (!bestAny || distance < bestAny.distance) {
                bestAny = { index: i, distance };
            }
        }
    }

    const candidate = bestPositive ?? bestAny;
    if (candidate) {
        const index = candidate.index + 1;
        return Math.max(start, Math.min(index, samples.length));
    }

    const fallbackStart = Math.max(start, Math.min(centerIndex - Math.floor(preferredLength / 2), end + 1));
    return Math.max(start, Math.min(fallbackStart, samples.length));
}

export interface PitchWaveformCalculatorDependencies {
    createAnalysisYieldController: (signal?: AbortSignal) => () => Promise<void>;
    mixBufferToMono: (buffer: AudioBuffer, maybeYield?: () => Promise<void>) => Promise<Float32Array>;
    cloneTempoProjection: (
        projection: AudioFeatureTempoProjection,
        hopTicks: number,
    ) => AudioFeatureTempoProjection;
    serializeTrack: (track: AudioFeatureTrack) => SerializedAudioFeatureTrack;
    deserializeTrack: (payload: SerializedAudioFeatureTrack) => AudioFeatureTrack;
    inferChannelAliases: (channelCount: number) => string[];
}

export function createPitchWaveformCalculator({
    createAnalysisYieldController,
    mixBufferToMono,
    cloneTempoProjection,
    serializeTrack,
    deserializeTrack,
    inferChannelAliases,
}: PitchWaveformCalculatorDependencies): AudioFeatureCalculator {
    return {
        id: 'mvmnt.pitchWaveform',
        version: 1,
        featureKey: 'pitchWaveform',
        label: 'Pitch Waveform',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const sampleRate = audioBuffer.sampleRate || analysisParams.sampleRate || 44100;
            const { windowSize, hopSize } = analysisParams;

            const offsets = new Array<number>(frameCount).fill(0);
            const lengths = new Array<number>(frameCount).fill(0);
            const collected: number[] = [];
            let totalLength = 0;
            let maxFrameLength = 0;
            const maxFrequency = Math.min(sampleRate / 2 - 1, MAX_FREQUENCY);
            const frameYieldInterval = Math.max(1, Math.floor(frameCount / 16));

            for (let frame = 0; frame < frameCount; frame += 1) {
                const start = Math.min(frame * hopSize, mono.length);
                const windowEnd = Math.min(start + windowSize, mono.length);
                const segmentLength = Math.max(0, windowEnd - start);

                offsets[frame] = totalLength;

                let cycleLength = 0;
                if (segmentLength > 3) {
                    const pitch = detectYinPitch(
                        mono,
                        start,
                        segmentLength,
                        sampleRate,
                        YIN_THRESHOLD,
                        MIN_FREQUENCY,
                        maxFrequency,
                    );

                    if (pitch != null) {
                        const period = Math.max(2, Math.round(sampleRate / pitch));
                        const center = Math.min(mono.length - 1, start + Math.floor(segmentLength / 2));
                        const zeroCross = findNearestZeroCrossing(mono, center, start, windowEnd, period);

                        if (zeroCross != null) {
                            const cycleEnd = Math.min(mono.length, zeroCross + period);
                            cycleLength = Math.max(0, cycleEnd - zeroCross);

                            for (let i = 0; i < cycleLength; i += 1) {
                                collected.push(mono[zeroCross + i] ?? 0);
                            }
                        }
                    }
                }

                lengths[frame] = cycleLength;
                maxFrameLength = Math.max(maxFrameLength, cycleLength);
                totalLength += cycleLength;

                if ((frame + 1) % frameYieldInterval === 0) {
                    await maybeYield();
                }
                context.reportProgress?.(frame + 1, frameCount);
            }

            await maybeYield();

            const payload = Float32Array.from(collected);
            const aliases = inferChannelAliases(audioBuffer.numberOfChannels || 1);

            const track: AudioFeatureTrack = {
                key: 'pitchWaveform',
                calculatorId: 'mvmnt.pitchWaveform',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: cloneTempoProjection(context.tempoProjection, hopTicks),
                format: 'waveform-periodic',
                data: payload,
                metadata: {
                    windowSize,
                    hopSize,
                    frameOffsets: offsets,
                    frameLengths: lengths,
                    maxFrameLength,
                    yinThreshold: YIN_THRESHOLD,
                    minFrequency: MIN_FREQUENCY,
                    maxFrequency,
                    sampleRate,
                },
                channelAliases: aliases,
                channelLayout: { aliases },
                analysisProfileId: 'default',
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
