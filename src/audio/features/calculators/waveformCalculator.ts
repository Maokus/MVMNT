import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
    AudioFeatureTempoProjection,
} from '../audioFeatureTypes';
import { quantizeHopTicks } from '../hopQuantization';
import type { SerializedAudioFeatureTrack } from '../audioFeatureAnalysis';

const WAVEFORM_OVERSAMPLE_FACTOR = 8;

export interface WaveformCalculatorDependencies {
    createAnalysisYieldController: (signal?: AbortSignal) => () => Promise<void>;
    mixBufferToMono: (buffer: AudioBuffer, maybeYield?: () => Promise<void>) => Promise<Float32Array>;
    cloneTempoProjection: (projection: AudioFeatureTempoProjection, hopTicks: number) => AudioFeatureTempoProjection;
    serializeTrack: (track: AudioFeatureTrack) => SerializedAudioFeatureTrack;
    deserializeTrack: (payload: SerializedAudioFeatureTrack) => AudioFeatureTrack;
    inferChannelAliases: (channelCount: number) => string[];
}

export function createWaveformCalculator({
    createAnalysisYieldController,
    mixBufferToMono,
    cloneTempoProjection,
    serializeTrack,
    deserializeTrack,
    inferChannelAliases,
}: WaveformCalculatorDependencies): AudioFeatureCalculator {
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
                    frame === waveformFrameCount - 1 ? totalSamples : Math.ceil((frame + 1) * waveformHopSamples);
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
            const aliases = inferChannelAliases(audioBuffer.numberOfChannels || 1);
            const track: AudioFeatureTrack = {
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
                channelAliases: aliases,
                channelLayout: { aliases },
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
