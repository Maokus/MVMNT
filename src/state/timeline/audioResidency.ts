import type { TimelineState } from './storeTypes';
import { decodeAudioSource } from '@audio/decode-audio-source';
import { prepareSourceWaveform } from './audioWaveform';

type Setter = (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void;

export async function rehydrateAudioSource(
    id: string,
    get: () => TimelineState,
    set: Setter,
    generation: () => number,
    priority = 1
): Promise<boolean> {
    const entry = get().audioCache[id];
    if (!entry) return false;
    if (entry.audioBuffer) return true;
    const expectedGeneration = generation();
    const isCurrent = () =>
        generation() === expectedGeneration &&
        get().audioCache[id]?.originalFile === entry.originalFile &&
        !!get().audioCache[id];
    set((state) =>
        isCurrent()
            ? {
                  audioCache: {
                      ...state.audioCache,
                      [id]: { ...state.audioCache[id], decodedState: 'decoding', decodedFailureReason: undefined },
                  },
              }
            : state
    );
    try {
        const audioBuffer = await decodeAudioSource(entry, isCurrent, priority);
        if (!isCurrent()) return false;
        if (get().audioCache[id]?.audioBuffer === audioBuffer) return true;
        set((state) => ({
            audioCache: {
                ...state.audioCache,
                [id]: {
                    ...state.audioCache[id],
                    audioBuffer,
                    sampleRate: audioBuffer.sampleRate,
                    channels: audioBuffer.numberOfChannels,
                    durationSeconds: audioBuffer.duration,
                    durationSamples: audioBuffer.length,
                    decodedState: 'ready',
                    decodedLastUsedAt: Date.now(),
                    decodedFailureReason: undefined,
                },
            },
        }));
        prepareSourceWaveform(id, audioBuffer, get, set);
        return true;
    } catch (error) {
        if (!isCurrent()) return false;
        set((state) => ({
            audioCache: {
                ...state.audioCache,
                [id]: {
                    ...state.audioCache[id],
                    decodedState: 'failed',
                    decodedFailureReason: error instanceof Error ? error.message : String(error),
                },
            },
        }));
        return false;
    }
}
