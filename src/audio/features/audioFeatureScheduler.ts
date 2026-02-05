import { analyzeAudioBufferFeatures, type AnalyzeAudioFeatureOptions } from './audioFeatureAnalysis';
import type { AudioFeatureCache } from './audioFeatureTypes';

export interface AudioFeatureAnalysisJob extends AnalyzeAudioFeatureOptions {
    jobId?: string;
    signal?: AbortSignal;
}

export interface AudioFeatureAnalysisHandle {
    id: string;
    promise: Promise<AudioFeatureCache>;
    cancel: () => void;
}

type InternalJob = {
    id: string;
    request: AudioFeatureAnalysisJob;
    resolve: (cache: AudioFeatureCache) => void;
    reject: (error: unknown) => void;
    cancelled: boolean;
};

function createAbortController(signal?: AbortSignal): AbortController {
    const controller = new AbortController();
    if (signal) {
        if (signal.aborted) controller.abort();
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller;
}

function createAbortError(): Error {
    const error = new Error('Audio feature analysis aborted');
    (error as Error).name = 'AbortError';
    return error;
}

export class AudioFeatureAnalysisScheduler {
    private queue: InternalJob[] = [];
    private activeJob: InternalJob | null = null;

    schedule(job: AudioFeatureAnalysisJob): AudioFeatureAnalysisHandle {
        const id = job.jobId ?? `audio-feature-job-${Math.random().toString(36).slice(2)}`;
        const abortController = createAbortController(job.signal);
        let internal: InternalJob;
        const promise = new Promise<AudioFeatureCache>((resolve, reject) => {
            internal = {
                id,
                request: { ...job, signal: abortController.signal },
                resolve,
                reject,
                cancelled: false,
            };
            this.queue.push(internal);
            this.processQueue();
        });
        const cancel = () => {
            abortController.abort();
            const wasActive = this.activeJob?.id === id;
            if (wasActive) {
                this.activeJob!.cancelled = true;
            } else {
                this.queue = this.queue.filter((entry) => entry.id !== id);
                internal?.reject(createAbortError());
            }
        };
        return { id, promise, cancel };
    }

    private async processQueue(): Promise<void> {
        if (this.activeJob || !this.queue.length) {
            return;
        }
        const job = this.queue.shift();
        if (!job) {
            return;
        }
        this.activeJob = job;
        try {
            const { cache } = await analyzeAudioBufferFeatures({
                ...job.request,
                onProgress: job.request.onProgress,
            });
            if (!job.cancelled) {
                job.resolve(cache);
            } else {
                job.reject(createAbortError());
            }
        } catch (error) {
            if (!job.cancelled) {
                job.reject(error);
            } else {
                job.reject(createAbortError());
            }
        } finally {
            this.activeJob = null;
            this.processQueue();
        }
    }
}

export const sharedAudioFeatureAnalysisScheduler = new AudioFeatureAnalysisScheduler();
