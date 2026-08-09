import { useCallback, useEffect, useRef } from 'react';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { exportScene } from '@persistence/index';
import { DocumentGateway } from '@persistence/document-gateway';
import { ensureSceneFontsLoaded } from '@fonts/font-loader';
import {
    BACKGROUND_EXPORT_KEY,
    ExportCoordinator,
    createExportJob,
    readBackgroundExportBootstrap,
    useExportJobStore,
    type ExportJob,
} from '@export/jobs';
import type { ExportKind, ExportRequest, ExportSettings, ProgressData, ResolvedExportPlan } from '@export/contracts';
import { resolveExportPlan } from '@export/planning';
import { beginDesktopOutput } from '@export/outputs';
import { createExportManifest } from '@export/outputs';
import { BUILTIN_EXPORT_PRESETS } from '@export/presets';
import { isPendingRenderImported, takePendingRender } from '../../desktop/pending-automation';

interface UseExportLifecycleArgs {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any | null;
    totalDuration: number;
    exportSettings: ExportSettings;
    sceneNameRef: React.MutableRefObject<string>;
    setShowProgressOverlay: React.Dispatch<React.SetStateAction<boolean>>;
    setProgressData: React.Dispatch<React.SetStateAction<ProgressData>>;
    setExportKind: React.Dispatch<React.SetStateAction<ExportKind | null>>;
}

export function useExportLifecycle({
    canvasRef,
    visualizer,
    totalDuration,
    exportSettings,
    sceneNameRef,
    setShowProgressOverlay,
    setProgressData,
    setExportKind,
}: UseExportLifecycleArgs) {
    const latestRef = useRef({ visualizer, totalDuration, exportSettings });
    latestRef.current = { visualizer, totalDuration, exportSettings };
    const backgroundJobRef = useRef<string | null>(null);
    const automationJobRef = useRef<string | null>(null);
    const coordinatorRef = useRef<ExportCoordinator | null>(null);

    coordinatorRef.current ??= new ExportCoordinator({
        sceneDuration: () =>
            Number(latestRef.current.visualizer?.getCurrentDuration?.() ?? latestRef.current.totalDuration),
        createEnvironment: () => {
            const renderer = latestRef.current.visualizer;
            const canvas = canvasRef.current;
            if (!renderer || !canvas) throw new Error('Export engine is not ready.');
            return {
                canvas,
                renderer,
                async prepare() {
                    const document = DocumentGateway.build();
                    await ensureSceneFontsLoaded(document.scene?.elements, document.scene?.macros, {
                        strict: true,
                        automation: document.scene?.automation,
                    });
                },
                secondsToTicks(seconds: number) {
                    const timeline = useTimelineStore.getState();
                    const timing = getSharedTimingManager();
                    timing.setBPM(timeline.timeline.globalBpm || 120);
                    if (timeline.timeline.masterTempoMap)
                        timing.setTempoMap(timeline.timeline.masterTempoMap, 'seconds');
                    return Math.round(timing.secondsToBeats(seconds) * timing.ticksPerQuarter);
                },
            };
        },
        beginOutput: (plan) =>
            beginDesktopOutput({
                kind: plan.kind === 'video' ? 'video' : 'image-sequence',
                suggestedName: plan.kind === 'png' ? `${plan.outputName}_sequence` : plan.outputName,
                extension: plan.extension,
                estimatedBytes: plan.estimatedBytes,
                outputDirectory: plan.settings.outputDirectory,
                outputPath: plan.settings.outputPath,
            }),
        async createManifest(job, duration, metrics) {
            if (!job.snapshot.settings.exportManifest) return undefined;
            const version = await window.mvmntDesktop?.app.getVersion().catch(() => 'unknown');
            return createExportManifest(job, version ?? 'unknown', duration, metrics);
        },
        onProgress(job, progress, text) {
            setShowProgressOverlay(true);
            setProgressData({ progress, text });
            if (automationJobRef.current === job.id)
                window.mvmntDesktop?.automation.reportProgress({ type: 'progress', progress, message: text });
            if (backgroundJobRef.current === job.id) {
                const current = useExportJobStore.getState().jobs.find((item) => item.id === job.id);
                window.mvmntDesktop?.background.update({
                    jobId: job.id,
                    patch: { progress, text, status: current?.status },
                });
            }
        },
        onCompleted(job) {
            window.mvmntDesktop?.app.notify('MVMNT export complete', job.outputName ?? job.snapshot.sceneName);
            if (automationJobRef.current === job.id) {
                automationJobRef.current = null;
                window.mvmntDesktop?.automation.reportResult({
                    type: 'complete',
                    outputName: job.outputName,
                    bytesWritten: job.bytesWritten,
                });
            }
            if (backgroundJobRef.current === job.id)
                window.mvmntDesktop?.background.complete({
                    jobId: job.id,
                    patch: job as unknown as Record<string, unknown>,
                });
        },
        onFailed(job, error, cancelled) {
            if (!cancelled)
                window.mvmntDesktop?.app.notify(
                    'MVMNT export failed',
                    error instanceof Error ? error.message : String(error)
                );
            if (automationJobRef.current === job.id) {
                automationJobRef.current = null;
                window.mvmntDesktop?.automation.reportResult({
                    type: 'error',
                    code: 'render',
                    message: cancelled ? 'Export cancelled.' : error instanceof Error ? error.message : String(error),
                });
            }
            if (backgroundJobRef.current === job.id)
                window.mvmntDesktop?.background.complete({
                    jobId: job.id,
                    patch: job as unknown as Record<string, unknown>,
                });
        },
    });
    const coordinator = coordinatorRef.current;

    const counts = useCallback(() => {
        const scene = useSceneStore.getState() as any;
        const timeline = useTimelineStore.getState();
        return [Object.keys(scene.elements ?? {}).length, Object.keys(timeline.tracks ?? {}).length] as const;
    }, []);

    const submit = useCallback(
        (kind: ExportKind, override?: Partial<ExportSettings>, presetName?: string): ExportJob => {
            const settings = { ...latestRef.current.exportSettings, ...(override ?? {}) } as ExportSettings;
            const request: ExportRequest = { kind, sceneName: sceneNameRef.current, settings, presetName };
            const duration = Number(
                latestRef.current.visualizer?.getCurrentDuration?.() ?? latestRef.current.totalDuration
            );
            const plan: ResolvedExportPlan = resolveExportPlan(request, duration);
            const [sceneElementCount, trackCount] = counts();
            setShowProgressOverlay(true);
            setExportKind(kind);

            if (window.mvmntDesktop && !readBackgroundExportBootstrap()) {
                const job = createExportJob(kind, request.sceneName, plan.settings, sceneElementCount, trackCount);
                useExportJobStore.getState().enqueue(job);
                useExportJobStore.getState().update(job.id, {
                    status: 'preparing',
                    text: 'Packaging background export…',
                });
                setProgressData({ progress: 0, text: 'Packaging background export…' });
                void (async () => {
                    try {
                        const packaged = await exportScene(job.snapshot.sceneName, { embedPlugins: true });
                        if (!packaged.ok)
                            throw new Error(
                                packaged.errors.map((item) => item.message).join('\n') ||
                                    'Could not package the export scene.'
                            );
                        const result = await window.mvmntDesktop!.background.start({
                            jobId: job.id,
                            kind,
                            sceneName: job.snapshot.sceneName,
                            settings: structuredClone(plan.settings) as unknown as Record<string, unknown>,
                            bytes: packaged.zip,
                        });
                        if (!result.accepted) throw new Error(result.error ?? 'Could not start background export.');
                        useExportJobStore.getState().update(job.id, {
                            status: 'queued',
                            text: 'Queued in background renderer',
                        });
                    } catch (error) {
                        useExportJobStore.getState().update(job.id, {
                            status: 'failed',
                            text: 'Could not start background export',
                            error: error instanceof Error ? error.message : String(error),
                            finishedAt: new Date().toISOString(),
                        });
                    }
                })();
                return job;
            }

            return coordinator.submit(request, sceneElementCount, trackCount);
        },
        [coordinator, counts, sceneNameRef, setExportKind, setProgressData, setShowProgressOverlay]
    );

    useEffect(() => {
        const background = readBackgroundExportBootstrap();
        if (!background || backgroundJobRef.current || !visualizer || !canvasRef.current) return;
        let started = false;
        const start = () => {
            if (started || sessionStorage.getItem(`${BACKGROUND_EXPORT_KEY}.imported`) !== '1') return;
            started = true;
            backgroundJobRef.current = background.jobId;
            const [sceneElementCount, trackCount] = counts();
            coordinator.submit(
                {
                    kind: background.kind,
                    sceneName: background.sceneName,
                    settings: background.settings as ExportSettings,
                },
                sceneElementCount,
                trackCount,
                background.jobId
            );
        };
        const onImported = () => start();
        window.addEventListener('mvmnt-project-imported', onImported);
        const cancel = window.mvmntDesktop?.background.onCancel((jobId) => {
            if (jobId === background.jobId) coordinator.cancel(jobId);
        });
        const interval = window.setInterval(start, 100);
        return () => {
            window.removeEventListener('mvmnt-project-imported', onImported);
            window.clearInterval(interval);
            cancel?.();
        };
    }, [canvasRef, coordinator, counts, visualizer]);

    useEffect(() => {
        if (!window.mvmntDesktop || readBackgroundExportBootstrap()) return;
        return window.mvmntDesktop.background.onUpdate(({ jobId, patch }) => {
            useExportJobStore.getState().update(jobId, patch as Partial<ExportJob>);
            if (typeof patch.progress === 'number' || typeof patch.text === 'string') {
                const progress = typeof patch.progress === 'number' ? patch.progress : 0;
                const text = typeof patch.text === 'string' ? patch.text : 'Exporting in background…';
                setShowProgressOverlay(true);
                setProgressData({ progress, text });
                if (automationJobRef.current === jobId)
                    window.mvmntDesktop?.automation.reportProgress({ type: 'progress', progress, message: text });
            }
            if (automationJobRef.current === jobId && (patch.status === 'completed' || patch.status === 'failed')) {
                automationJobRef.current = null;
                if (patch.status === 'completed')
                    window.mvmntDesktop?.automation.reportResult({
                        type: 'complete',
                        outputName: typeof patch.outputName === 'string' ? patch.outputName : undefined,
                        bytesWritten: typeof patch.bytesWritten === 'number' ? patch.bytesWritten : undefined,
                    });
                else
                    window.mvmntDesktop?.automation.reportResult({
                        type: 'error',
                        code: 'render',
                        message: typeof patch.error === 'string' ? patch.error : 'Export failed.',
                    });
            }
        });
    }, [setProgressData, setShowProgressOverlay]);

    useEffect(() => {
        if (!window.mvmntDesktop || !visualizer || !canvasRef.current) return;
        let started = false;
        const startPendingRender = async () => {
            if (started || !isPendingRenderImported()) return;
            const request = takePendingRender();
            if (!request) return;
            started = true;
            try {
                await document.fonts?.ready;
                const preset = request.preset
                    ? BUILTIN_EXPORT_PRESETS.find((item) => item.id === request.preset)
                    : undefined;
                const settings: Partial<ExportSettings> = {
                    ...(preset?.settings ?? {}),
                    ...(request.width ? { width: request.width } : {}),
                    ...(request.height ? { height: request.height } : {}),
                    ...(request.fps ? { fps: request.fps } : {}),
                    ...(request.range
                        ? { fullDuration: false, startTime: request.range.start, endTime: request.range.end }
                        : { fullDuration: true }),
                };
                const job = submit(request.kind, settings, preset?.name);
                automationJobRef.current = job.id;
            } catch (error) {
                window.mvmntDesktop?.automation.reportResult({
                    type: 'error',
                    code: 'render',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        };
        const imported = () => void startPendingRender();
        window.addEventListener('mvmnt-project-imported', imported);
        const interval = window.setInterval(() => void startPendingRender(), 250);
        return () => {
            window.removeEventListener('mvmnt-project-imported', imported);
            window.clearInterval(interval);
        };
    }, [canvasRef, submit, visualizer]);

    useEffect(() => () => coordinator.reset(), [coordinator]);

    return {
        exportSequence: async (override?: Partial<ExportSettings>) => void submit('png', override),
        exportVideo: async (override?: Partial<ExportSettings>) => void submit('video', override),
        cancelExport(jobId: string) {
            coordinator.cancel(jobId);
            void window.mvmntDesktop?.background.cancel(jobId);
        },
        revealExport: async (outputId: string) => window.mvmntDesktop?.exports.reveal(outputId) ?? false,
        removeExport: (jobId: string) => coordinator.remove(jobId),
    };
}
