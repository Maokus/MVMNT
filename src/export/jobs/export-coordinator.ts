import { createExportJob, useExportJobStore, type ExportJob } from './store';
import { resolveExportPlan } from '../planning';
import type { ExportEnvironment, ExportOutputSession, ExportRequest, ResolvedExportPlan } from '../contracts';
import { ExportPerformanceTracker } from '../diagnostics';

export interface ExportCoordinatorDependencies {
    sceneDuration(): number;
    sceneStartSeconds?(): number;
    createEnvironment(): ExportEnvironment;
    beginOutput(plan: ResolvedExportPlan): Promise<ExportOutputSession | null>;
    createManifest?(
        job: ExportJob,
        duration: number,
        metrics: Record<string, number>
    ): Promise<Record<string, unknown> | undefined>;
    onProgress?(job: ExportJob, progress: number, text: string): void;
    onCompleted?(job: ExportJob): void;
    onFailed?(job: ExportJob, error: unknown, cancelled: boolean): void;
}

export class ExportCoordinator {
    private readonly queue: ExportJob[] = [];
    private readonly plans = new Map<string, ResolvedExportPlan>();
    private readonly abortControllers = new Map<string, AbortController>();
    private draining = false;

    constructor(private readonly dependencies: ExportCoordinatorDependencies) {}

    submit(request: ExportRequest, sceneElementCount: number, trackCount: number, id?: string): ExportJob {
        const plan = resolveExportPlan(
            request,
            this.dependencies.sceneDuration(),
            this.dependencies.sceneStartSeconds?.() ?? 0
        );
        const job = createExportJob(request.kind, request.sceneName, plan.settings, sceneElementCount, trackCount, id);
        useExportJobStore.getState().enqueue(job);
        this.plans.set(job.id, plan);
        this.queue.push(job);
        void this.drain();
        return job;
    }

    cancel(jobId: string): void {
        useExportJobStore.getState().requestCancel(jobId);
        this.abortControllers.get(jobId)?.abort();
    }

    remove(jobId: string): void {
        this.cancel(jobId);
        const index = this.queue.findIndex((job) => job.id === jobId);
        if (index >= 0) this.queue.splice(index, 1);
        this.plans.delete(jobId);
        useExportJobStore.getState().remove(jobId);
    }

    reset(): void {
        for (const controller of this.abortControllers.values()) controller.abort();
        this.queue.splice(0);
        this.plans.clear();
        this.abortControllers.clear();
        this.draining = false;
    }

    private async drain(): Promise<void> {
        if (this.draining) return;
        this.draining = true;
        try {
            while (this.queue.length > 0) {
                const job = this.queue.shift()!;
                const latest = useExportJobStore.getState().jobs.find((item) => item.id === job.id);
                if (latest?.cancelRequested) {
                    useExportJobStore.getState().update(job.id, {
                        status: 'cancelled',
                        text: 'Export cancelled',
                        finishedAt: new Date().toISOString(),
                    });
                    continue;
                }
                await this.run(job);
            }
        } finally {
            this.draining = false;
        }
    }

    private async run(job: ExportJob): Promise<void> {
        const plan = this.plans.get(job.id);
        if (!plan) throw new Error(`Missing export plan for job ${job.id}.`);
        const store = useExportJobStore.getState();
        const controller = new AbortController();
        const tracker = new ExportPerformanceTracker();
        this.abortControllers.set(job.id, controller);
        let output: ExportOutputSession | null = null;
        try {
            store.update(job.id, {
                status: 'preparing',
                startedAt: new Date().toISOString(),
                text: 'Preparing export…',
            });
            output = await this.dependencies.beginOutput(plan);
            if (!output) {
                controller.abort();
                throw new DOMException('Export cancelled', 'AbortError');
            }
            store.update(job.id, { outputName: output.displayName });
            const { ExportPipeline } = await import('../pipeline/export-pipeline');
            const result = await new ExportPipeline().run(
                plan,
                this.dependencies.createEnvironment(),
                output,
                controller.signal,
                ({ progress, text, stage }) => {
                    tracker.stage(stage);
                    useExportJobStore.getState().update(job.id, { progress, text, status: stage });
                    this.dependencies.onProgress?.(job, progress, text);
                }
            );
            for (const artifact of result.artifacts) {
                if (controller.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
                await output.writeArtifact(artifact.filename, artifact.blob);
            }
            const metrics = tracker.finish({ frames: result.frameCount, artifacts: result.artifacts.length });
            metrics.averageFps =
                metrics.elapsedMs > 0 ? Math.round((result.frameCount / (metrics.elapsedMs / 1000)) * 100) / 100 : 0;
            const manifest = await this.dependencies.createManifest?.(job, result.durationSeconds, metrics);
            const completion = await output.complete(manifest, result.frameCount);
            const completedJob: ExportJob = {
                ...job,
                status: 'completed',
                progress: 100,
                text: 'Export complete',
                outputId: completion.outputId,
                outputName: completion.displayName ?? output.displayName,
                bytesWritten: completion.bytesWritten,
                metrics,
                finishedAt: new Date().toISOString(),
            };
            useExportJobStore.getState().update(job.id, completedJob);
            useExportJobStore
                .getState()
                .log(job.id, 'info', `Export completed in ${(metrics.elapsedMs / 1000).toFixed(2)} seconds.`);
            this.dependencies.onCompleted?.(completedJob);
        } catch (error) {
            await output?.abort().catch(() => undefined);
            const cancelled = controller.signal.aborted;
            if (!cancelled) console.error('Export job failed', error);
            const failedJob: ExportJob = {
                ...job,
                status: cancelled ? 'cancelled' : 'failed',
                text: cancelled ? 'Export cancelled' : 'Export failed',
                error: cancelled ? undefined : error instanceof Error ? error.message : String(error),
                finishedAt: new Date().toISOString(),
            };
            useExportJobStore.getState().update(job.id, failedJob);
            useExportJobStore
                .getState()
                .log(
                    job.id,
                    cancelled ? 'info' : 'error',
                    cancelled ? 'Export cancelled and temporary output removed.' : (failedJob.error ?? 'Export failed.')
                );
            this.dependencies.onFailed?.(failedJob, error, cancelled);
        } finally {
            this.abortControllers.delete(job.id);
            this.plans.delete(job.id);
        }
    }
}
