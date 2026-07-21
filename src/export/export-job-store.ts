import { create } from 'zustand';
import type { ExportSettings } from '@context/visualizer/types';

export type ExportJobKind = 'video' | 'png';
export type ExportJobStatus =
    | 'queued'
    | 'preparing'
    | 'rendering'
    | 'encoding'
    | 'finalizing'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'interrupted';

export interface ExportJobLog {
    at: string;
    level: 'info' | 'warning' | 'error';
    message: string;
}

export interface ExportJobSnapshot {
    sceneName: string;
    settings: ExportSettings;
    createdAt: string;
    sceneElementCount: number;
    trackCount: number;
}

export interface ExportJob {
    id: string;
    kind: ExportJobKind;
    status: ExportJobStatus;
    progress: number;
    text: string;
    snapshot: ExportJobSnapshot;
    logs: ExportJobLog[];
    outputId?: string;
    outputName?: string;
    bytesWritten?: number;
    startedAt?: string;
    finishedAt?: string;
    cancelRequested?: boolean;
    error?: string;
    metrics?: Record<string, number>;
}

interface PersistedExportJobs {
    version: 1;
    jobs: ExportJob[];
}

interface ExportJobState {
    jobs: ExportJob[];
    enqueue(job: ExportJob): void;
    update(id: string, patch: Partial<ExportJob>): void;
    log(id: string, level: ExportJobLog['level'], message: string): void;
    requestCancel(id: string): void;
    remove(id: string): void;
    clearFinished(): void;
}

const STORAGE_KEY = 'mvmnt.desktop.export-jobs.v1';
const terminal = new Set<ExportJobStatus>(['completed', 'cancelled', 'failed', 'interrupted']);

function readPersistedJobs(): ExportJob[] {
    if (typeof localStorage === 'undefined') return [];
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as PersistedExportJobs;
        if (value.version !== 1 || !Array.isArray(value.jobs)) return [];
        return value.jobs.slice(0, 100).map((job) => terminal.has(job.status)
            ? job
            : {
                ...job,
                status: 'interrupted' as const,
                finishedAt: new Date().toISOString(),
                text: 'Interrupted when MVMNT last closed',
            });
    } catch {
        return [];
    }
}

export const useExportJobStore = create<ExportJobState>((set) => ({
    jobs: readPersistedJobs(),
    enqueue: (job) => set((state) => ({ jobs: [job, ...state.jobs].slice(0, 100) })),
    update: (id, patch) => set((state) => ({
        jobs: state.jobs.map((job) => job.id === id ? { ...job, ...patch } : job),
    })),
    log: (id, level, message) => set((state) => ({
        jobs: state.jobs.map((job) => job.id === id
            ? { ...job, logs: [...job.logs, { at: new Date().toISOString(), level, message }].slice(-200) }
            : job),
    })),
    requestCancel: (id) => set((state) => ({
        jobs: state.jobs.map((job) => job.id === id ? { ...job, cancelRequested: true, text: 'Cancelling…' } : job),
    })),
    remove: (id) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) })),
    clearFinished: () => set((state) => ({ jobs: state.jobs.filter((job) => !terminal.has(job.status)) })),
}));

if (typeof localStorage !== 'undefined') {
    useExportJobStore.subscribe((state) => {
        const persisted: PersistedExportJobs = { version: 1, jobs: state.jobs };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
        } catch {
            // Exporting remains functional when storage is unavailable or full.
        }
    });
}

export function createExportJob(
    kind: ExportJobKind,
    sceneName: string,
    settings: ExportSettings,
    sceneElementCount: number,
    trackCount: number,
    id: string = crypto.randomUUID(),
): ExportJob {
    const createdAt = new Date().toISOString();
    return {
        id,
        kind,
        status: 'queued',
        progress: 0,
        text: 'Queued',
        snapshot: {
            sceneName,
            settings: structuredClone(settings),
            createdAt,
            sceneElementCount,
            trackCount,
        },
        logs: [{ at: createdAt, level: 'info', message: 'Export queued from an immutable settings snapshot.' }],
    };
}

export function isExportJobActive(status: ExportJobStatus): boolean {
    return !terminal.has(status);
}
