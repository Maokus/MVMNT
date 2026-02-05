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
        version: 2,
        featureKey: 'waveform',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, signal, tempoMapper } = context;
            const maybeYield = createAnalysisYieldController(signal);
            let channelCount = Math.max(1, audioBuffer.numberOfChannels || 1);
            const canReadChannels = typeof audioBuffer.getChannelData === 'function';
            const channelSamples: Float32Array[] = [];
            if (canReadChannels) {
                for (let channel = 0; channel < channelCount; channel += 1) {
                    try {
                        const samples = audioBuffer.getChannelData(channel);
                        if (samples) {
                            channelSamples.push(samples);
                        }
                    } catch {
                        break;
                    }
                }
            }
            if (channelSamples.length !== channelCount || channelSamples.length === 0) {
                const mono = await mixBufferToMono(audioBuffer, maybeYield);
                channelSamples.length = 0;
                channelSamples.push(mono);
                channelCount = 1;
            }
            const totalSamples =
                channelSamples.reduce((max, samples) => Math.max(max, samples.length), 0) ||
                audioBuffer.length ||
                channelSamples[0]?.length ||
                0;
            const sampleRate = audioBuffer.sampleRate || analysisParams.sampleRate || 44100;
            const baseHopSeconds = Math.max(context.hopSeconds, analysisParams.hopSize / sampleRate);
            const minHopSeconds = 1 / sampleRate;
            const waveformHopSeconds = Math.max(baseHopSeconds / WAVEFORM_OVERSAMPLE_FACTOR, minHopSeconds);
            const waveformHopSamples = Math.max(waveformHopSeconds * sampleRate, 1);
            const waveformFrameCount = Math.max(1, Math.ceil(totalSamples / waveformHopSamples));
            const frameSampleCount = Math.max(1, channelCount);
            const minValues = new Float32Array(waveformFrameCount * frameSampleCount);
            const maxValues = new Float32Array(waveformFrameCount * frameSampleCount);
            const frameYieldInterval = Math.max(1, Math.floor(waveformFrameCount / 12));
            for (let frame = 0; frame < waveformFrameCount; frame++) {
                const frameStart = Math.floor(frame * waveformHopSamples);
                const frameEnd =
                    frame === waveformFrameCount - 1 ? totalSamples : Math.ceil((frame + 1) * waveformHopSamples);
                for (let channel = 0; channel < frameSampleCount; channel += 1) {
                    const samples = channelSamples[channel] ?? channelSamples[0];
                    const channelLength = samples?.length ?? 0;
                    let min = 0;
                    let max = 0;
                    if (channelLength > 0 && samples) {
                        const start = Math.max(0, Math.min(channelLength - 1, frameStart));
                        let end = Math.min(channelLength, frameEnd);
                        if (end <= start) {
                            end = Math.min(channelLength, start + 1);
                        }
                        let channelMin = Number.POSITIVE_INFINITY;
                        let channelMax = Number.NEGATIVE_INFINITY;
                        for (let i = start; i < end; i += 1) {
                            const value = samples[i] ?? 0;
                            if (value < channelMin) channelMin = value;
                            if (value > channelMax) channelMax = value;
                        }
                        if (!Number.isFinite(channelMin)) channelMin = 0;
                        if (!Number.isFinite(channelMax)) channelMax = 0;
                        min = channelMin;
                        max = channelMax;
                    }
                    const offset = frame * frameSampleCount + channel;
                    minValues[offset] = min;
                    maxValues[offset] = max;
                }
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
            const aliases = inferChannelAliases(channelCount);
            const semantics = channelCount === 1 ? 'mono' : channelCount === 2 ? 'stereo' : undefined;
            const track: AudioFeatureTrack = {
                key: 'waveform',
                calculatorId: 'mvmnt.waveform',
                version: 2,
                frameCount: waveformFrameCount,
                channels: frameSampleCount,
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
                channelLayout: semantics ? { aliases, semantics } : { aliases },
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
