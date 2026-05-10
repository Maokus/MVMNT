import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
    AudioFeatureTempoProjection,
} from '../audioFeatureTypes';
import type { SerializedAudioFeatureTrack } from '../audioFeatureAnalysis';

export interface RmsCalculatorDependencies {
    createAnalysisYieldController: (signal?: AbortSignal) => () => Promise<void>;
    cloneTempoProjection: (projection: AudioFeatureTempoProjection, hopTicks: number) => AudioFeatureTempoProjection;
    serializeTrack: (track: AudioFeatureTrack) => SerializedAudioFeatureTrack;
    deserializeTrack: (payload: SerializedAudioFeatureTrack) => AudioFeatureTrack;
}

function channelAliasesForCount(count: number): string[] {
    if (count === 1) return ['Mono'];
    if (count === 2) return ['Left', 'Right'];
    return Array.from({ length: count }, (_, i) => `Ch ${i + 1}`);
}

export function createRmsCalculator({
    createAnalysisYieldController,
    cloneTempoProjection,
    serializeTrack,
    deserializeTrack,
}: RmsCalculatorDependencies): AudioFeatureCalculator {
    return {
        id: 'mvmnt.rms',
        version: 1,
        featureKey: 'rms',
        async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
            const { audioBuffer, analysisParams, hopTicks, hopSeconds, frameCount, signal } = context;
            const maybeYield = createAnalysisYieldController(signal);
            const { windowSize, hopSize } = analysisParams;
            const numChannels = audioBuffer.numberOfChannels;
            const channelDatas: Float32Array[] = [];
            for (let ch = 0; ch < numChannels; ch++) {
                channelDatas.push(audioBuffer.getChannelData(ch));
            }
            // Interleaved output: data[frame * numChannels + ch] = RMS for that frame/channel
            const output = new Float32Array(frameCount * numChannels);
            const frameYieldInterval = Math.max(1, Math.floor(frameCount / 12));
            for (let frame = 0; frame < frameCount; frame++) {
                const start = frame * hopSize;
                const bufLen = channelDatas[0]?.length ?? 0;
                const end = Math.min(start + windowSize, bufLen);
                const count = Math.max(1, end - start);
                for (let ch = 0; ch < numChannels; ch++) {
                    const data = channelDatas[ch];
                    let sumSquares = 0;
                    for (let i = start; i < end; i++) {
                        const sample = data?.[i] ?? 0;
                        sumSquares += sample * sample;
                    }
                    output[frame * numChannels + ch] = Math.sqrt(sumSquares / count);
                }
                if ((frame + 1) % frameYieldInterval === 0) {
                    await maybeYield();
                }
                context.reportProgress?.(frame + 1, frameCount);
            }
            await maybeYield();
            const aliases = channelAliasesForCount(numChannels);
            const track: AudioFeatureTrack = {
                key: 'rms',
                calculatorId: 'mvmnt.rms',
                version: 1,
                frameCount,
                channels: numChannels,
                hopTicks,
                hopSeconds,
                startTimeSeconds: 0,
                tempoProjection: cloneTempoProjection(context.tempoProjection, hopTicks),
                format: 'float32',
                data: output,
                metadata: {
                    windowSize,
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
