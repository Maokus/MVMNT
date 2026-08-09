import type { ExportJob } from '../jobs/store';

type PerformanceWithMemory = Performance & { memory?: { usedJSHeapSize?: number } };

export class ExportPerformanceTracker {
    private readonly startedAt = performance.now();
    private stageStartedAt = this.startedAt;
    private currentStage = 'preparing';
    private readonly stages: Record<string, number> = {};
    private peakHeapBytes = this.readHeap();

    stage(name: string): void {
        if (name === this.currentStage) return;
        const now = performance.now();
        this.stages[`${this.currentStage}Ms`] =
            (this.stages[`${this.currentStage}Ms`] ?? 0) + now - this.stageStartedAt;
        this.currentStage = name;
        this.stageStartedAt = now;
        this.peakHeapBytes = Math.max(this.peakHeapBytes, this.readHeap());
    }

    finish(extra: Record<string, number> = {}): Record<string, number> {
        this.stage('complete');
        const finishedAt = performance.now();
        return {
            elapsedMs: Math.round(finishedAt - this.startedAt),
            ...Object.fromEntries(Object.entries(this.stages).map(([key, value]) => [key, Math.round(value)])),
            ...(this.peakHeapBytes > 0 ? { peakHeapBytes: this.peakHeapBytes } : {}),
            ...extra,
        };
    }

    private readHeap(): number {
        return Number((performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0);
    }
}

export function createExportDiagnostics(jobs: ExportJob[], appVersion: string): Record<string, unknown> {
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        appVersion,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        jobs: jobs.map((job) => ({
            id: job.id,
            kind: job.kind,
            status: job.status,
            settings: job.snapshot.settings,
            sceneElementCount: job.snapshot.sceneElementCount,
            trackCount: job.snapshot.trackCount,
            metrics: job.metrics,
            logs: job.logs,
            error: job.error,
        })),
    };
}
