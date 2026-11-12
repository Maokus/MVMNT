import { measureProjectLoadWork } from '@utils/projectLoadDiagnostics';
import type { AnalyzeAudioFeatureOptions, AnalyzeAudioFeatureResult } from './features/audioFeatureAnalysis';
import { canAnalyzeInWorker, analyzeAudioBufferFeatures } from './features/audioFeatureAnalysis';
import { extractPeaksAsync, type PeakExtractionOptions, type PeakExtractionResult } from './waveform/peak-extractor';
import { AudioWorkQueue } from './work-queue';
import { getSharedTimingManager } from '@state/timeline/timelineShared';

export type BackgroundAnalysisOptions = Omit<AnalyzeAudioFeatureOptions, 'audioBuffer' | 'signal' | 'onProgress'>;
export type AudioTask =
    | { kind: 'peaks'; options: PeakExtractionOptions }
    | { kind: 'features'; options: BackgroundAnalysisOptions; ticksPerQuarter: number };
const queue = new AudioWorkQueue();
export const getBackgroundAudioWorkStats = () => queue.getStats();
const COPY_SAMPLES = 256 * 1024;

function abortError() {
    return new DOMException('Audio preparation aborted', 'AbortError');
}

/** One worker at a time. PCM belongs to the renderer; only bounded scratch copies are transferred. */
async function runWorker<T>(
    buffer: AudioBuffer,
    task: AudioTask,
    signal?: AbortSignal,
    onProgress?: (value: number, label?: string) => void
): Promise<T> {
    if (signal?.aborted) throw abortError();
    const worker = new Worker(new URL('./background-audio.worker.ts', import.meta.url), { type: 'module' });
    return new Promise<T>((resolve, reject) => {
        let channel = 0;
        let offset = 0;
        let settled = false;
        const cleanup = () => {
            settled = true;
            signal?.removeEventListener('abort', abort);
            worker.terminate();
        };
        const abort = () => {
            cleanup();
            reject(abortError());
        };
        const sendNext = () => {
            if (settled) return;
            try {
                if (channel >= buffer.numberOfChannels) {
                    worker.postMessage({ kind: 'run' });
                    return;
                }
                const count = Math.min(COPY_SAMPLES, buffer.length - offset);
                const samples = buffer.getChannelData(channel).slice(offset, offset + count);
                worker.postMessage({ kind: 'chunk', channel, offset, samples }, [samples.buffer]);
                offset += count;
                if (offset >= buffer.length) {
                    channel++;
                    offset = 0;
                }
            } catch (error) {
                cleanup();
                reject(error);
            }
        };
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
            if (settled) return;
            if (data.kind === 'ready') {
                // Worker acknowledgments are separate tasks; each bounds one PCM copy.
                sendNext();
                return;
            }
            if (data.kind === 'progress') {
                onProgress?.(data.value, data.label);
                return;
            }
            cleanup();
            if (data.error) reject(new Error(data.error));
            else resolve(data.result);
        };
        worker.onerror = (event) => {
            cleanup();
            reject(new Error(event.message || 'Audio worker failed'));
        };
        try {
            worker.postMessage({
                kind: 'init',
                length: buffer.length,
                channels: buffer.numberOfChannels,
                sampleRate: buffer.sampleRate,
                task,
            });
        } catch (error) {
            cleanup();
            reject(error);
        }
    });
}

export function extractPeaksInBackground(
    buffer: AudioBuffer,
    options: PeakExtractionOptions = {},
    signal?: AbortSignal
): Promise<PeakExtractionResult> {
    return queue.schedule({}, async () => {
        if (signal?.aborted) throw abortError();
        if (typeof Worker === 'undefined') return extractPeaksAsync(buffer, options, 4, signal);
        return measureProjectLoadWork('Waveform extraction', () =>
            runWorker<PeakExtractionResult>(buffer, { kind: 'peaks', options }, signal)
        );
    });
}

export function analyzeAudioInBackground(options: AnalyzeAudioFeatureOptions): Promise<AnalyzeAudioFeatureResult> {
    return queue.schedule(
        {},
        async () => {
            if (options.signal?.aborted) throw abortError();
            if (typeof Worker === 'undefined' || !canAnalyzeInWorker(options.calculators))
                return analyzeAudioBufferFeatures(options);
            const { audioBuffer, signal, onProgress, ...settings } = options;
            return measureProjectLoadWork('Feature analysis', () =>
                runWorker<AnalyzeAudioFeatureResult>(
                    audioBuffer,
                    { kind: 'features', options: settings, ticksPerQuarter: getSharedTimingManager().ticksPerQuarter },
                    signal,
                    onProgress
                )
            );
        },
        1
    );
}
