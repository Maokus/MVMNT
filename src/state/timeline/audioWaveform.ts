import type { TimelineState } from './storeTypes';
import { extractPeaksInBackground } from '@audio/background-audio';

const jobs = new Map<string, { buffer: AudioBuffer; controller: AbortController }>();

export function prepareSourceWaveform(
    id: string,
    buffer: AudioBuffer,
    get: () => TimelineState,
    set: (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void
): void {
    const previous = jobs.get(id);
    if (previous?.buffer === buffer) return;
    previous?.controller.abort();
    if (get().audioCache[id]?.waveform?.channelPeaks?.length) return;
    const controller = new AbortController();
    const job = { buffer, controller };
    jobs.set(id, job);
    void extractPeaksInBackground(buffer, { binSize: 1024, maxBins: 5000 }, controller.signal)
        .then((result) => {
            if (get().audioCache[id]?.audioBuffer !== buffer) return;
            set((state) => ({
                audioCache: {
                    ...state.audioCache,
                    [id]: {
                        ...state.audioCache[id],
                        waveform: { version: 1, channelPeaks: result.peaks, sampleStep: result.binSize },
                    },
                },
            }));
        })
        .catch((error) => {
            if (error?.name !== 'AbortError') console.warn(`[audio] Waveform preparation failed for ${id}`, error);
        })
        .finally(() => {
            if (jobs.get(id) === job) jobs.delete(id);
        });
}

export function cancelObsoleteWaveforms(cache: TimelineState['audioCache']): void {
    for (const [id, job] of jobs) {
        if (cache[id]?.audioBuffer !== job.buffer) {
            job.controller.abort();
            jobs.delete(id);
        }
    }
}
