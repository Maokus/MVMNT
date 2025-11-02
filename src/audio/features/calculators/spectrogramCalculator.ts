import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
    AudioFeatureTempoProjection,
} from '../audioFeatureTypes';
import { createFftPlan, fftRadix2 } from '../fft';
import type { SerializedAudioFeatureTrack } from '../audioFeatureAnalysis';

const SPECTROGRAM_MIN_DECIBELS = -80;
const SPECTROGRAM_MAX_DECIBELS = 0;
const SPECTROGRAM_EPSILON = 1e-8;

export interface SpectrogramCalculatorDependencies {
    createAnalysisYieldController: (signal?: AbortSignal) => () => Promise<void>;
    mixBufferToMono: (buffer: AudioBuffer, maybeYield?: () => Promise<void>) => Promise<Float32Array>;
    hannWindow: (length: number) => Float32Array;
    cloneTempoProjection: (projection: AudioFeatureTempoProjection, hopTicks: number) => AudioFeatureTempoProjection;
    serializeTrack: (track: AudioFeatureTrack) => SerializedAudioFeatureTrack;
    deserializeTrack: (payload: SerializedAudioFeatureTrack) => AudioFeatureTrack;
}

export function createSpectrogramCalculator({
    createAnalysisYieldController,
    mixBufferToMono,
    hannWindow,
    cloneTempoProjection,
    serializeTrack,
    deserializeTrack,
}: SpectrogramCalculatorDependencies): AudioFeatureCalculator {
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

            const track: AudioFeatureTrack = {
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
                analysisProfileId: context.analysisProfileId,
                channelAliases: null,
                channelLayout: null,
            };

            return track;
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
