import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
    AudioFeatureTempoProjection,
} from '../audioFeatureTypes';
import type { SerializedAudioFeatureTrack } from '../audioFeatureAnalysis';

export interface RmsCalculatorDependencies {
    createAnalysisYieldController: (signal?: AbortSignal) => () => Promise<void>;
    mixBufferToMono: (buffer: AudioBuffer, maybeYield?: () => Promise<void>) => Promise<Float32Array>;
    cloneTempoProjection: (projection: AudioFeatureTempoProjection, hopTicks: number) => AudioFeatureTempoProjection;
    serializeTrack: (track: AudioFeatureTrack) => SerializedAudioFeatureTrack;
    deserializeTrack: (payload: SerializedAudioFeatureTrack) => AudioFeatureTrack;
    inferChannelAliases: (channelCount: number) => string[];
}

export function createRmsCalculator({
    createAnalysisYieldController,
    mixBufferToMono,
    cloneTempoProjection,
    serializeTrack,
    deserializeTrack,
    inferChannelAliases,
}: RmsCalculatorDependencies): AudioFeatureCalculator {
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
            const aliases = inferChannelAliases(audioBuffer.numberOfChannels || 1);
            const track: AudioFeatureTrack = {
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
