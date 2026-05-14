import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
    AudioFeatureTempoProjection,
} from '../audioFeatureTypes';
import type { SerializedAudioFeatureTrack } from '../audioFeatureAnalysis';

// Strict YIN threshold for selecting clean pitch candidates
const YIN_THRESHOLD = 0.12;
// Wider limit: frames with bestCmnd below this are usable even if they miss the strict threshold
const VOICED_CMND_LIMIT = 0.45;
// Even wider limit: frames below this get a candidateF0 for visual use (not trusted pitch)
const CANDIDATE_CMND_LIMIT = 0.70;
// RMS below this → silence; do not report pitch regardless of CMND
const SILENCE_RMS_THRESHOLD = 0.001;
// Gap-filling parameters: fill short f0=0 gaps between nearby voiced frames
const GAP_FILL_MAX_SEC = 0.150;
const GAP_FILL_CONFIDENCE = 0.12;
// Max pitch ratio between gap endpoints (~4 semitones); wider gaps are left unfilled
const GAP_FILL_MAX_PITCH_RATIO = 1.26;

// These match the oscilloscope UI defaults and bound the cache key
const MIN_FREQUENCY = 50;
const MAX_FREQUENCY = 2000;

const OCTAVE_RATIO_UP = 1.6;
const OCTAVE_RATIO_DOWN = 1 / OCTAVE_RATIO_UP;

// Channel indices in the interleaved float32 payload (frame * 5 + CH_*)
const CHANNEL_COUNT = 5;
const CH_F0 = 0;
const CH_CONFIDENCE = 1;
const CH_RMS = 2;
const CH_ANCHOR_SEC = 3;
const CH_CANDIDATE_F0 = 4;

interface YinResult {
    frequency: number;
    candidateFrequency: number;
    bestCmnd: number;
}

const NULL_YIN: YinResult = { frequency: 0, candidateFrequency: 0, bestCmnd: 1 };

function preprocessWindow(samples: Float32Array, start: number, length: number): Float32Array {
    const n = Math.min(length, samples.length - start);
    if (n <= 0) return new Float32Array(0);
    const buf = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += samples[start + i] ?? 0;
    const mean = sum / n;
    for (let i = 0; i < n; i++) {
        const hann = n > 1 ? 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))) : 1;
        buf[i] = ((samples[start + i] ?? 0) - mean) * hann;
    }
    return buf;
}

function detectYin(
    buf: Float32Array,
    sampleRate: number,
    minFrequency: number,
    maxFrequency: number
): YinResult {
    const length = buf.length;
    if (length < 3) return NULL_YIN;

    const maxTau = Math.min(Math.floor(sampleRate / Math.max(1, minFrequency)), length - 1);
    const minTau = Math.max(1, Math.floor(sampleRate / Math.max(1, maxFrequency)));
    if (maxTau <= minTau) return NULL_YIN;

    const diff = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
        let sum = 0;
        for (let i = 0; i < length - tau; i++) {
            const delta = (buf[i] ?? 0) - (buf[i + tau] ?? 0);
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
    for (let tau = minTau; tau <= maxTau; tau++) {
        const c = cmnd[tau] ?? 1;
        if (c < YIN_THRESHOLD) {
            // Walk to local minimum then stop
            bestTau = tau;
            bestCmnd = c;
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

    // Compute refined frequency for bestTau (shared by voiced and candidate paths)
    let refinedFrequency = 0;
    if (bestTau > 0 && bestCmnd < CANDIDATE_CMND_LIMIT) {
        let refined = bestTau;
        if (bestTau > 1 && bestTau < maxTau) {
            const prev = cmnd[bestTau - 1] ?? 1;
            const curr = cmnd[bestTau] ?? 1;
            const next = cmnd[bestTau + 1] ?? 1;
            const denom = 2 * curr - prev - next;
            if (denom !== 0) refined = bestTau + (next - prev) / (2 * denom);
        }
        if (Number.isFinite(refined) && refined > 0) {
            const freq = sampleRate / refined;
            if (Number.isFinite(freq) && freq >= minFrequency && freq <= maxFrequency) {
                refinedFrequency = freq;
            }
        }
    }

    // candidateFrequency: best-effort pitch, even when not cleanly voiced
    const candidateFrequency = refinedFrequency;

    // Strict voiced frequency: only when bestCmnd is within the tighter VOICED_CMND_LIMIT
    if (bestTau <= 0 || bestCmnd >= VOICED_CMND_LIMIT || refinedFrequency === 0) {
        return { frequency: 0, candidateFrequency, bestCmnd };
    }

    return { frequency: refinedFrequency, candidateFrequency, bestCmnd };
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
        version: 2,
        featureKey: 'pitchGuide',
        label: 'Pitch Guide',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const mono = await mixBufferToMono(audioBuffer, maybeYield);
            const sampleRate = audioBuffer.sampleRate || analysisParams.sampleRate || 44100;
            const { windowSize, hopSize } = analysisParams;
            const minFrequency = MIN_FREQUENCY;
            const maxFrequency = Math.min(sampleRate / 2 - 1, MAX_FREQUENCY);

            // Require at least 4 periods of minFrequency so bass notes get reliable CMND
            const minYinSize = Math.ceil((sampleRate / minFrequency) * 4);
            const yinWindowSize = Math.max(windowSize, minYinSize);

            const frameYieldInterval = Math.max(1, Math.floor(frameCount / 16));
            const data = new Float32Array(frameCount * CHANNEL_COUNT);

            // Pass 1: per-frame pitch, confidence, RMS, anchor
            for (let frame = 0; frame < frameCount; frame++) {
                const frameCenter = frame * hopSize + Math.floor(hopSize / 2);

                // RMS uses the standard analysis window (amplitude tracking)
                const rmsHalf = Math.floor(windowSize / 2);
                const rmsStart = Math.max(0, frameCenter - rmsHalf);
                const rmsEnd = Math.min(mono.length, frameCenter + rmsHalf);
                const rms = computeRms(mono, rmsStart, rmsEnd - rmsStart);

                // YIN uses the extended window to ensure enough periods for bass
                const yinHalf = Math.floor(yinWindowSize / 2);
                const yinStart = Math.max(0, frameCenter - yinHalf);
                const yinEnd = Math.min(mono.length, frameCenter + yinHalf);

                const yin =
                    yinEnd - yinStart >= 3
                        ? detectYin(
                              preprocessWindow(mono, yinStart, yinEnd - yinStart),
                              sampleRate,
                              minFrequency,
                              maxFrequency
                          )
                        : NULL_YIN;

                // Silence detection is independent of CMND quality
                const voiced = rms >= SILENCE_RMS_THRESHOLD && yin.frequency > 0;
                const confidence = voiced
                    ? Math.max(0, Math.min(1, (VOICED_CMND_LIMIT - yin.bestCmnd) / VOICED_CMND_LIMIT))
                    : 0;

                let anchorSec = frameCenter / sampleRate;
                if (voiced) {
                    const zeroCross = findPositiveZeroCrossing(mono, frameCenter, rmsStart, rmsEnd);
                    if (zeroCross != null) {
                        anchorSec = zeroCross / sampleRate;
                    }
                }

                const offset = frame * CHANNEL_COUNT;
                data[offset + CH_F0] = voiced ? yin.frequency : 0;
                data[offset + CH_CONFIDENCE] = confidence;
                data[offset + CH_RMS] = Math.min(1, rms);
                data[offset + CH_ANCHOR_SEC] = anchorSec;
                data[offset + CH_CANDIDATE_F0] = rms >= SILENCE_RMS_THRESHOLD ? yin.candidateFrequency : 0;

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
                if (ratio > OCTAVE_RATIO_UP && cur / 2 >= minFrequency) {
                    data[frame * CHANNEL_COUNT + CH_F0] = cur / 2;
                } else if (ratio < OCTAVE_RATIO_DOWN && cur * 2 <= maxFrequency) {
                    data[frame * CHANNEL_COUNT + CH_F0] = cur * 2;
                }
                const curCand = data[frame * CHANNEL_COUNT + CH_CANDIDATE_F0];
                const prevCand = data[(frame - 1) * CHANNEL_COUNT + CH_CANDIDATE_F0];
                if (curCand > 0 && prevCand > 0) {
                    const ratioC = curCand / prevCand;
                    if (ratioC > OCTAVE_RATIO_UP && curCand / 2 >= minFrequency) {
                        data[frame * CHANNEL_COUNT + CH_CANDIDATE_F0] = curCand / 2;
                    } else if (ratioC < OCTAVE_RATIO_DOWN && curCand * 2 <= maxFrequency) {
                        data[frame * CHANNEL_COUNT + CH_CANDIDATE_F0] = curCand * 2;
                    }
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
                const prev = frame > 0 ? data[(frame - 1) * CHANNEL_COUNT + CH_F0] : cur;
                const next = frame < frameCount - 1 ? data[(frame + 1) * CHANNEL_COUNT + CH_F0] : cur;
                smoothedF0[frame] = medianOf3(prev > 0 ? prev : cur, cur, next > 0 ? next : cur);
            }
            for (let frame = 0; frame < frameCount; frame++) {
                if (data[frame * CHANNEL_COUNT + CH_F0] > 0) {
                    data[frame * CHANNEL_COUNT + CH_F0] = smoothedF0[frame];
                }
            }

            // Pass 4: confidence smoothing ([0.25, 0.5, 0.25] weighted average)
            // + small boost when neighboring voiced frames have stable, close pitch
            const smoothedConf = new Float32Array(frameCount);
            for (let frame = 0; frame < frameCount; frame++) {
                const conf = data[frame * CHANNEL_COUNT + CH_CONFIDENCE];
                if (conf <= 0) {
                    smoothedConf[frame] = 0;
                    continue;
                }
                const prevConf = frame > 0 ? data[(frame - 1) * CHANNEL_COUNT + CH_CONFIDENCE] : conf;
                const nextConf =
                    frame < frameCount - 1 ? data[(frame + 1) * CHANNEL_COUNT + CH_CONFIDENCE] : conf;
                let smoothed = 0.25 * prevConf + 0.5 * conf + 0.25 * nextConf;

                const f0 = data[frame * CHANNEL_COUNT + CH_F0];
                if (f0 > 0) {
                    const prevF0 = frame > 0 ? data[(frame - 1) * CHANNEL_COUNT + CH_F0] : 0;
                    const nextF0 = frame < frameCount - 1 ? data[(frame + 1) * CHANNEL_COUNT + CH_F0] : 0;
                    if (
                        prevF0 > 0 &&
                        nextF0 > 0 &&
                        Math.abs(prevF0 / f0 - 1) < 0.05 &&
                        Math.abs(nextF0 / f0 - 1) < 0.05
                    ) {
                        smoothed = Math.min(1, smoothed + 0.05);
                    }
                }

                smoothedConf[frame] = Math.max(0, Math.min(1, smoothed));
            }
            for (let frame = 0; frame < frameCount; frame++) {
                data[frame * CHANNEL_COUNT + CH_CONFIDENCE] = smoothedConf[frame];
            }

            // Pass 5: short-gap f0 filling (log-frequency interpolation)
            {
                const maxGapFrames = Math.max(1, Math.round(GAP_FILL_MAX_SEC / hopSeconds));
                let gapStart = -1;
                for (let frame = 0; frame <= frameCount; frame++) {
                    const cur = frame < frameCount ? data[frame * CHANNEL_COUNT + CH_F0] : 0;
                    if (cur > 0) {
                        if (gapStart > 0) {
                            const gapLen = frame - gapStart;
                            if (gapLen <= maxGapFrames) {
                                const prevF0 = data[(gapStart - 1) * CHANNEL_COUNT + CH_F0];
                                const nextF0 = data[frame * CHANNEL_COUNT + CH_F0];
                                const pitchRatio = Math.max(prevF0, nextF0) / Math.min(prevF0, nextF0);
                                if (pitchRatio <= GAP_FILL_MAX_PITCH_RATIO) {
                                    const logPrev = Math.log2(prevF0);
                                    const logNext = Math.log2(nextF0);
                                    for (let g = 0; g < gapLen; g++) {
                                        const t = (g + 1) / (gapLen + 1);
                                        const filled = Math.pow(2, logPrev + (logNext - logPrev) * t);
                                        const gf = gapStart + g;
                                        data[gf * CHANNEL_COUNT + CH_F0] = filled;
                                        data[gf * CHANNEL_COUNT + CH_CONFIDENCE] = GAP_FILL_CONFIDENCE;
                                        data[gf * CHANNEL_COUNT + CH_CANDIDATE_F0] = filled;
                                    }
                                }
                            }
                        }
                        gapStart = -1;
                    } else if (gapStart < 0 && frame > 0) {
                        gapStart = frame;
                    }
                }
            }

            await maybeYield();

            const track: AudioFeatureTrack = {
                key: 'pitchGuide',
                calculatorId: 'mvmnt.pitchGuide',
                version: 2,
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
                    voicedCmndLimit: VOICED_CMND_LIMIT,
                    silenceRmsThreshold: SILENCE_RMS_THRESHOLD,
                    minFrequency,
                    maxFrequency,
                    yinWindowSize,
                    sampleRate,
                },
                channelAliases: ['f0', 'confidence', 'rms', 'anchorSec', 'candidateF0'],
                channelLayout: { aliases: ['f0', 'confidence', 'rms', 'anchorSec', 'candidateF0'] },
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
