import type { ExportJob } from './export-job-store';

export interface ExportManifest extends Record<string, unknown> {
    schemaVersion: 1;
    application: 'MVMNT';
    applicationVersion: string;
    jobId: string;
    sceneName: string;
    kind: ExportJob['kind'];
    settings: ExportJob['snapshot']['settings'];
    createdAt: string;
    completedAt: string;
    frameCount: number;
    durationSeconds: number;
    warnings: string[];
    metrics: Record<string, number>;
}

export function createExportManifest(
    job: ExportJob,
    applicationVersion: string,
    durationSeconds: number,
    metrics: Record<string, number>
): ExportManifest {
    const settings = job.snapshot.settings;
    const exportDuration = settings.fullDuration ? durationSeconds : Math.max(0, settings.endTime - settings.startTime);
    return {
        schemaVersion: 1,
        application: 'MVMNT',
        applicationVersion,
        jobId: job.id,
        sceneName: job.snapshot.sceneName,
        kind: job.kind,
        settings,
        createdAt: job.snapshot.createdAt,
        completedAt: new Date().toISOString(),
        frameCount: Math.ceil(exportDuration * settings.fps),
        durationSeconds: exportDuration,
        warnings: job.logs.filter((entry) => entry.level === 'warning').map((entry) => entry.message),
        metrics,
    };
}
