import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { VideoExporter } from '@export/video-exporter.js';
import { getSharedTimingManager } from '@state/timelineStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import type { TimelineState } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
import type { ProgressData } from './visualizer/types';
import { ExportKind, ExportSettings, DebugSettings } from './visualizer/types';
import { useVisualizerBootstrap } from './visualizer/useVisualizerBootstrap';
import { useRenderLoop } from './visualizer/useRenderLoop';
import { useTransportBridge } from './visualizer/useTransportBridge';
import {
    createExportJob,
    useExportJobStore,
    type ExportJob,
    type ExportJobKind,
} from '@export/export-job-store';
import { beginDesktopExport, blobToBytes, createDesktopStreamSink, writeDesktopFrame } from '@export/desktop-export-sink';
import { createExportManifest } from '@export/export-manifest';
import { BUILTIN_EXPORT_PRESETS, expandExportFilename } from '@export/export-presets';
import { ExportPerformanceTracker } from '@export/export-performance';
import { isPendingRenderImported, takePendingRender } from '../desktop/pending-automation';
import { exportScene } from '@persistence/index';

const BACKGROUND_EXPORT_KEY = 'mvmnt.desktop.background-export.v1';

type BackgroundExportBootstrap = {
    jobId: string;
    kind: ExportJobKind;
    sceneName: string;
    settings: Partial<ExportSettings>;
};

function readBackgroundExportBootstrap(): BackgroundExportBootstrap | null {
    try {
        const raw = sessionStorage.getItem(BACKGROUND_EXPORT_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<BackgroundExportBootstrap>;
        if (typeof value.jobId !== 'string' || (value.kind !== 'video' && value.kind !== 'png') ||
            typeof value.sceneName !== 'string' || !value.settings || typeof value.settings !== 'object') return null;
        return value as BackgroundExportBootstrap;
    } catch {
        return null;
    }
}

interface VisualizerContextValue {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any | null;
    isPlaying: boolean;
    currentTimeLabel: string;
    numericCurrentTime: number;
    totalDuration: number;
    sceneName: string;
    exportSettings: ExportSettings;
    setExportSettings: React.Dispatch<React.SetStateAction<ExportSettings>>;
    debugSettings: DebugSettings;
    setDebugSettings: React.Dispatch<React.SetStateAction<DebugSettings>>;
    forceRender: () => void;
    playPause: () => void;
    stop: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    seekPercent: (percent: number) => void;
    exportSequence: (override?: Partial<ExportSettings>) => Promise<void>;
    exportVideo: (override?: Partial<ExportSettings>) => Promise<void>;
    cancelExport: (jobId: string) => void;
    revealExport: (outputId: string) => Promise<boolean>;
    removeExport: (jobId: string) => void;
    showProgressOverlay: boolean;
    progressData: ProgressData;
    closeProgress: () => void;
    exportKind: ExportKind;
    // TimelineService removed from context; use timeline store + note-query utilities instead.
    // Expose convenience store hooks
    useTimeline: () => TimelineState['timeline'];
    useTransport: () => { transport: TimelineState['transport']; actions: { play: () => void; pause: () => void; togglePlay: () => void; scrubTick: (to: number) => void; setCurrentTick: (t: number) => void } };
}

const VisualizerContext = createContext<VisualizerContextValue | undefined>(undefined);

// Converted to named function declaration to ensure React Fast Refresh correctly
// identifies this module as a refresh boundary (some heuristics can fail on
// certain arrow function exports in edge cases with swc + TS + React 19).
export function VisualizerProvider({ children }: { children: React.ReactNode }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visualizer, setVisualizer] = useState<any | null>(null);
    const [imageSequenceGenerator, setImageSequenceGenerator] = useState<any | null>(null);
    const [videoExporter, setVideoExporter] = useState<VideoExporter | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTimeLabel, setCurrentTimeLabel] = useState('00:00 / 00:00');
    const [numericCurrentTime, setNumericCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [exportSettings, setExportSettings] = useState<ExportSettings>({
        // Default framerate updated to 60fps
        fps: 60,
        width: 1500,
        height: 1500,
        fullDuration: true,
        startTime: 0,
        endTime: 0,
        includeAudio: true,
        videoCodec: 'h264',
        audioCodec: 'mp3',
        videoBitrateMode: 'auto',
        qualityPreset: 'high',
        audioBitrate: 192_000,
        audioSampleRate: 'auto',
        audioChannels: 2,
        container: 'mp4',
    });
    const isBetaMode = import.meta.env.VITE_APP_MODE === 'beta';
    const defaultDebugSettings: DebugSettings = {
        showAnchorPoints: false,
        showDevelopmentOverlay: import.meta.env.DEV && !isBetaMode,
    };
    const [debugSettings, setDebugSettings] = useState<DebugSettings>(defaultDebugSettings);
    const [showProgressOverlay, setShowProgressOverlay] = useState(false);
    const [progressData, setProgressData] = useState<ProgressData>({ progress: 0, text: 'Generating images...' });
    const [exportKind, setExportKind] = useState<ExportKind>(null);
    const sceneNameRef = useRef<string>('scene');
    const pendingExportsRef = useRef<ExportJob[]>([]);
    const drainingExportsRef = useRef(false);
    const exportAbortControllersRef = useRef(new Map<string, AbortController>());
    const automationJobRef = useRef<string | null>(null);
    const backgroundJobRef = useRef<string | null>(null);
    // Keep a reactive scene name so consumers (like Render / Export modal) get live updates.
    const [sceneNameState, setSceneNameState] = useState<string>('scene');
    // Keep export settings aligned with the currently loaded scene resolution.
    const sceneSettings = useSceneStore((state) => state.settings);
    // TimelineService removed: all track/timeline operations flow through Zustand store.

    useVisualizerBootstrap({
        canvasRef,
        visualizer,
        setVisualizer,
        setImageSequenceGenerator,
        setVideoExporter,
        setExportSettings,
        sceneNameRef,
        setSceneNameState,
    });

    useRenderLoop({ visualizer, setCurrentTimeLabel, setNumericCurrentTime, setTotalDuration });

    const { playPause, stop, stepForward, stepBackward, forceRender, seekPercent } = useTransportBridge({
        visualizer,
        setIsPlaying,
    });

    // (Removed duplicate view sync; see effect near bottom that also clamps current time)

    // Removed listener for auto-binding newly added tracks; user chooses explicitly now.
    useEffect(() => { return () => { /* cleanup only */ }; }, []);

    useEffect(() => {
        if (!sceneSettings) return;
        setExportSettings((prev) => {
            let changed = false;
            const next: ExportSettings = { ...prev };
            const syncKeys: Array<'fps' | 'width' | 'height'> = ['fps', 'width', 'height'];
            for (const key of syncKeys) {
                const value = sceneSettings[key];
                if (typeof value === 'number' && value > 0 && value !== prev[key]) {
                    next[key] = value;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [sceneSettings.fps, sceneSettings.width, sceneSettings.height, setExportSettings]);

    // Apply export settings size changes
    useEffect(() => {
        if (!visualizer || !canvasRef.current) return;
        const sceneSettings = useSceneStore.getState().settings;
        if (
            sceneSettings.fps !== exportSettings.fps ||
            sceneSettings.width !== exportSettings.width ||
            sceneSettings.height !== exportSettings.height
        ) {
            visualizer.updateExportSettings?.(exportSettings);
        } else if ('fullDuration' in exportSettings) {
            // Still propagate export-only flags if necessary
            visualizer.updateExportSettings?.({ fullDuration: exportSettings.fullDuration });
        }
    }, [visualizer, exportSettings]);

    // Listen for scene-imported event to sync export settings from loaded scene
    useEffect(() => {
        if (!visualizer || !visualizer.canvas) return;
        const handler = (e: any) => {
            const es = e?.detail?.exportSettings;
            if (es) {
                setExportSettings((prev) => ({
                    ...prev,
                    ...['fps', 'width', 'height'].reduce((acc: any, key) => {
                        if (es[key] != null) acc[key] = es[key];
                        return acc;
                    }, {}),
                }));
            }
        };
        visualizer.canvas.addEventListener('scene-imported', handler as EventListener);
        return () => visualizer.canvas?.removeEventListener('scene-imported', handler as EventListener);
    }, [visualizer]);

    // Apply debug settings
    useEffect(() => {
        if (!visualizer) return;
        visualizer.updateDebugSettings?.(debugSettings);
    }, [visualizer, debugSettings]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            (window as any).__mvmntDebugSettings = debugSettings;
            const event = new CustomEvent<DebugSettings>('mvmnt-debug-settings-changed', { detail: debugSettings });
            window.dispatchEvent(event);
        } catch {
            /* noop: custom event dispatch may fail in non-browser contexts */
        }
    }, [debugSettings]);

    // Re-render canvas when fonts finish loading so text bounds recalc
    useEffect(() => {
        if (!visualizer) return;
        const handler = () => visualizer.invalidateRender?.();
        window.addEventListener('font-loaded', handler as EventListener);
        return () => window.removeEventListener('font-loaded', handler as EventListener);
    }, [visualizer]);

    // Re-render canvas after undo/redo so restored elements appear immediately
    useEffect(() => {
        if (!visualizer) return;
        const handler = () => visualizer.invalidateRender?.();
        window.addEventListener('mvmnt-undo-applied', handler);
        return () => window.removeEventListener('mvmnt-undo-applied', handler);
    }, [visualizer]);

    const tView = useTimelineStore((s) => s.timelineView);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const globalBpm = useTimelineStore((s) => s.timeline.globalBpm);
    const masterTempoMap = useTimelineStore((s) => s.timeline.masterTempoMap);
    // Tick-based setters
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const setPlaybackRangeTicks = useTimelineStore((s) => s.setPlaybackRangeTicks);
    // Updated: Only apply an explicit play range if user defined playbackRange braces. The timeline view no longer
    // constrains or clamps playback; view panning/zooming is purely visual and must not modify playhead.
    useEffect(() => {
        if (!visualizer) return;
        const hasUserRange = typeof playbackRange?.startTick === 'number' && typeof playbackRange?.endTick === 'number';
        if (!hasUserRange) {
            try { visualizer.clearPlayRange?.(); } catch { }
            return;
        }
        const st = useTimelineStore.getState();
        const tm = getSharedTimingManager();
        tm.setBPM(st.timeline.globalBpm || 120);
        if (st.timeline.masterTempoMap) tm.setTempoMap(st.timeline.masterTempoMap, 'seconds');
        const startSec = tm.beatsToSeconds((playbackRange!.startTick as number) / tm.ticksPerQuarter);
        const endSec = tm.beatsToSeconds((playbackRange!.endTick as number) / tm.ticksPerQuarter);
        visualizer.setPlayRange?.(startSec, endSec);
        if (visualizer.currentTime < startSec || visualizer.currentTime > endSec) {
            const clamped = Math.min(Math.max(visualizer.currentTime, startSec), endSec);
            visualizer.seek?.(clamped);
        }
    }, [visualizer, playbackRange?.startTick, playbackRange?.endTick, globalBpm, masterTempoMap]);

    // Initialize playbackRange once from current view so it's decoupled from pan/zoom until user changes it
    useEffect(() => {
        if (typeof playbackRange?.startTick === 'number' && typeof playbackRange?.endTick === 'number') return;
        const st = useTimelineStore.getState();
        setPlaybackRangeTicks(tView.startTick, tView.endTick);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-fit timeline view to scene duration only once when first available and the view is at default width.
    const didAutoFitRef = useRef(false);
    useEffect(() => {
        if (didAutoFitRef.current) return;
        const duration = totalDuration;
        if (!isFinite(duration) || duration <= 0) return;
        const st2 = useTimelineStore.getState();
        const tm2 = getSharedTimingManager();
        tm2.setBPM(st2.timeline.globalBpm || 120);
        const secStart = tm2.beatsToSeconds(tView.startTick / tm2.ticksPerQuarter);
        const secEnd = tm2.beatsToSeconds(tView.endTick / tm2.ticksPerQuarter);
        const widthSec = secEnd - secStart;
        const isExactlyDefault = Math.abs(widthSec - 60) < 1e-6 || widthSec === 0;
        if (isExactlyDefault) {
            const endTick = Math.max(1, duration * tm2.ticksPerQuarter * (st2.timeline.globalBpm || 120) / 60); // approximate ticks for duration
            setTimelineViewTicks(0, endTick);
            if (!(typeof playbackRange?.startTick === 'number' && typeof playbackRange?.endTick === 'number')) {
                setPlaybackRangeTicks(0, endTick);
            }
            didAutoFitRef.current = true;
        }
    }, [totalDuration, tView.startTick, tView.endTick, setTimelineViewTicks, playbackRange?.startTick, playbackRange?.endTick, setPlaybackRangeTicks]);

    const runExportJob = useCallback(async (job: ExportJob) => {
        if (!visualizer || !imageSequenceGenerator || !videoExporter) throw new Error('Export engine is not ready.');
        const store = useExportJobStore.getState();
        const settings = job.snapshot.settings;
        const controller = new AbortController();
        exportAbortControllersRef.current.set(job.id, controller);
        const tracker = new ExportPerformanceTracker();
        const duration = Number(visualizer.getCurrentDuration?.() ?? totalDuration ?? 0);
        const exportDuration = settings.fullDuration
            ? duration
            : Math.max(0, Math.min(duration, settings.endTime) - Math.max(0, settings.startTime));
        let startFrame = 0;
        let maxFrames: number | null = null;
        if (!settings.fullDuration) {
            startFrame = Math.floor(Math.max(0, settings.startTime) * settings.fps);
            maxFrames = Math.ceil(exportDuration * settings.fps);
        }
        const updateProgress = (progress: number, text = 'Exporting…') => {
            const status = progress >= 95 ? 'finalizing' : progress > 5 ? 'rendering' : 'preparing';
            tracker.stage(status);
            useExportJobStore.getState().update(job.id, { progress, text, status });
            setProgressData({ progress, text });
            if (automationJobRef.current === job.id) {
                window.mvmntDesktop?.automation.reportProgress({ type: 'progress', progress, message: text });
            }
            if (backgroundJobRef.current === job.id) {
                window.mvmntDesktop?.background.update({ jobId: job.id, patch: { progress, text, status } });
            }
        };
        let desktopSink: ReturnType<typeof createDesktopStreamSink> | null = null;
        let desktopSessionId: string | null = null;
        const artifacts: Array<{ filename: string; blob: Blob }> = [];
        try {
            store.update(job.id, { status: 'preparing', startedAt: new Date().toISOString(), text: 'Choosing destination…' });
            setShowProgressOverlay(true);
            setExportKind(job.kind);
            const rangeLabel = settings.fullDuration ? 'full' : `${settings.startTime}-${settings.endTime}s`;
            const filename = expandExportFilename(settings.filename, {
                scene: job.snapshot.sceneName,
                width: settings.width,
                height: settings.height,
                fps: settings.fps,
                range: rangeLabel,
            });
            const desktop = window.mvmntDesktop;
            if (!desktop) throw new Error('MVMNT desktop export services are unavailable.');
            const extension = job.kind === 'video'
                ? (settings.transparentBackground || settings.container === 'webm' ? '.webm' : '.mp4')
                : undefined;
            const expectedFrameCount = Math.ceil(exportDuration * settings.fps);
            const estimatedBytes = job.kind === 'video'
                ? Math.ceil(((settings.videoBitrate ?? settings.bitrate ?? 8_000_000) / 8) * exportDuration * 1.15)
                : Math.ceil(settings.width * settings.height * 0.35 * expectedFrameCount);
            const begin = await beginDesktopExport({
                kind: job.kind === 'video' ? 'video' : 'image-sequence',
                suggestedName: job.kind === 'png' ? `${filename}_sequence` : filename,
                extension,
                estimatedBytes,
                outputDirectory: settings.outputDirectory,
                outputPath: settings.outputPath,
            });
            if (begin.status === 'canceled') throw new DOMException('Export cancelled', 'AbortError');
            if (begin.status !== 'ready' || !begin.sessionId) throw new Error(begin.error ?? 'Could not create export destination.');
            desktopSessionId = begin.sessionId;
            store.update(job.id, { outputName: begin.displayName });
            if (job.kind === 'video') desktopSink = createDesktopStreamSink(begin.sessionId, begin.displayName ?? filename);
            if (controller.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
            if (job.kind === 'png') {
                await imageSequenceGenerator.generateImageSequence({
                    fps: settings.fps,
                    width: settings.width,
                    height: settings.height,
                    sceneName: job.snapshot.sceneName,
                    maxFrames,
                    _startFrame: startFrame,
                    transparent: settings.transparentBackground ?? false,
                    signal: controller.signal,
                    frameSink: (frameName: string, blob: Blob) => writeDesktopFrame(desktopSessionId!, frameName, blob),
                    onProgress: updateProgress,
                });
            } else {
                let startTick: number | undefined;
                let endTick: number | undefined;
                if (settings.includeAudio) {
                    const timeline = useTimelineStore.getState();
                    const timing = getSharedTimingManager();
                    timing.setBPM(timeline.timeline.globalBpm || 120);
                    if (timeline.timeline.masterTempoMap) timing.setTempoMap(timeline.timeline.masterTempoMap, 'seconds');
                    const startSeconds = settings.fullDuration ? 0 : settings.startTime;
                    const endSeconds = settings.fullDuration ? duration : settings.endTime;
                    startTick = Math.floor(timing.secondsToBeats(startSeconds) * timing.ticksPerQuarter);
                    endTick = Math.ceil(timing.secondsToBeats(endSeconds) * timing.ticksPerQuarter);
                }
                await videoExporter.exportVideo({
                    fps: settings.fps,
                    width: settings.width,
                    height: settings.height,
                    sceneName: job.snapshot.sceneName,
                    maxFrames,
                    _startFrame: startFrame,
                    qualityPreset: settings.qualityPreset,
                    includeAudio: settings.includeAudio,
                    videoCodec: settings.videoCodec,
                    videoBitrateMode: settings.videoBitrateMode,
                    videoBitrate: settings.videoBitrate,
                    audioCodec: settings.audioCodec,
                    audioBitrate: settings.audioBitrate,
                    audioSampleRate: settings.audioSampleRate,
                    audioChannels: settings.audioChannels,
                    container: settings.container,
                    startTick,
                    endTick,
                    outputTarget: desktopSink?.target,
                    signal: controller.signal,
                    exportAudioMaster: settings.exportAudioMaster,
                    exportAudioStems: settings.exportAudioStems,
                    onArtifacts: (items) => { artifacts.push(...items); },
                    audioWavBitDepth: settings.audioWavBitDepth,
                    normalizeAudio: settings.normalizeAudio,
                    transparentBackground: settings.transparentBackground,
                    onProgress: updateProgress,
                });
            }
            if (artifacts.length > 0) {
                updateProgress(96, 'Writing audio masters and stems…');
                for (const artifact of artifacts) {
                    if (controller.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
                    await desktop.exports.writeArtifact({
                        sessionId: desktopSessionId!,
                        filename: artifact.filename,
                        bytes: await blobToBytes(artifact.blob),
                    });
                }
            }
            const frameCount = Math.ceil(exportDuration * settings.fps);
            const metrics = tracker.finish({
                frames: Math.ceil(exportDuration * settings.fps),
                artifacts: artifacts.length,
            });
            metrics.averageFps = metrics.elapsedMs > 0 ? Math.round((frameCount / (metrics.elapsedMs / 1000)) * 100) / 100 : 0;
            let completion: Awaited<ReturnType<NonNullable<typeof window.mvmntDesktop>['exports']['complete']>> | undefined;
            if (desktopSessionId) {
                const version = await window.mvmntDesktop!.app.getVersion().catch(() => 'unknown');
                const manifest = settings.exportManifest ? createExportManifest(job, version, duration, metrics) : undefined;
                completion = desktopSink
                    ? await desktopSink.complete(manifest)
                    : await window.mvmntDesktop!.exports.complete({ sessionId: desktopSessionId, manifest, expectedFrames: frameCount });
                if (completion.status !== 'completed') throw new Error(completion.error ?? 'Export finalization failed.');
            }
            useExportJobStore.getState().update(job.id, {
                status: 'completed',
                progress: 100,
                text: 'Export complete',
                outputId: completion?.outputId,
                outputName: completion?.displayName ?? useExportJobStore.getState().jobs.find((item) => item.id === job.id)?.outputName,
                bytesWritten: completion?.bytesWritten,
                metrics,
                finishedAt: new Date().toISOString(),
            });
            useExportJobStore.getState().log(job.id, 'info', `Export completed in ${(metrics.elapsedMs / 1000).toFixed(2)} seconds.`);
            window.mvmntDesktop?.app.notify('MVMNT export complete', completion?.displayName ?? filename);
            if (automationJobRef.current === job.id) {
                automationJobRef.current = null;
                window.mvmntDesktop?.automation.reportResult({
                    type: 'complete',
                    outputName: completion?.displayName ?? filename,
                    bytesWritten: completion?.bytesWritten,
                });
            }
            if (backgroundJobRef.current === job.id) {
                window.mvmntDesktop?.background.complete({
                    jobId: job.id,
                    patch: {
                        status: 'completed', progress: 100, text: 'Export complete', outputId: completion?.outputId,
                        outputName: completion?.displayName ?? filename, bytesWritten: completion?.bytesWritten,
                        metrics, finishedAt: new Date().toISOString(),
                    },
                });
            }
        } catch (error) {
            if (desktopSink) await desktopSink.abort().catch(() => undefined);
            else if (desktopSessionId) await window.mvmntDesktop?.exports.abort(desktopSessionId).catch(() => undefined);
            const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
            useExportJobStore.getState().update(job.id, {
                status: cancelled ? 'cancelled' : 'failed',
                text: cancelled ? 'Export cancelled' : 'Export failed',
                error: cancelled ? undefined : error instanceof Error ? error.message : String(error),
                finishedAt: new Date().toISOString(),
            });
            useExportJobStore.getState().log(job.id, cancelled ? 'info' : 'error', cancelled
                ? 'Export cancelled and temporary output removed.'
                : error instanceof Error ? error.message : String(error));
            if (!cancelled) window.mvmntDesktop?.app.notify('MVMNT export failed', error instanceof Error ? error.message : String(error));
            if (automationJobRef.current === job.id) {
                automationJobRef.current = null;
                window.mvmntDesktop?.automation.reportResult({
                    type: 'error',
                    code: desktopSessionId ? 'render' : 'output',
                    message: cancelled ? 'Export cancelled.' : error instanceof Error ? error.message : String(error),
                });
            }
            if (backgroundJobRef.current === job.id) {
                window.mvmntDesktop?.background.complete({
                    jobId: job.id,
                    patch: {
                        status: cancelled ? 'cancelled' : 'failed',
                        text: cancelled ? 'Export cancelled' : 'Export failed',
                        error: cancelled ? undefined : error instanceof Error ? error.message : String(error),
                        finishedAt: new Date().toISOString(),
                    },
                });
            }
        } finally {
            exportAbortControllersRef.current.delete(job.id);
        }
    }, [imageSequenceGenerator, totalDuration, videoExporter, visualizer]);

    const drainExportQueue = useCallback(async () => {
        if (drainingExportsRef.current) return;
        drainingExportsRef.current = true;
        try {
            while (pendingExportsRef.current.length > 0) {
                const job = pendingExportsRef.current.shift()!;
                const latest = useExportJobStore.getState().jobs.find((item) => item.id === job.id);
                if (latest?.cancelRequested) {
                    useExportJobStore.getState().update(job.id, { status: 'cancelled', text: 'Export cancelled', finishedAt: new Date().toISOString() });
                    continue;
                }
                await runExportJob(job);
            }
        } finally {
            drainingExportsRef.current = false;
            setProgressData((previous) => ({ ...previous, progress: 100 }));
        }
    }, [runExportJob]);

    const enqueueExport = useCallback((kind: ExportJobKind, override?: Partial<ExportSettings>, presetName?: string) => {
        const settings = { ...exportSettings, ...(override ?? {}) } as ExportSettings;
        if (!settings.fullDuration && (settings.startTime == null || settings.endTime == null || settings.startTime >= settings.endTime)) {
            throw new Error('Invalid start/end time for export.');
        }
        if (presetName) settings.filename = settings.filename
            ? `${settings.filename}_{preset}`.replace('{preset}', presetName)
            : `{scene}_${presetName}_{width}x{height}`;
        const sceneState = useSceneStore.getState() as any;
        const timelineState = useTimelineStore.getState();
        const job = createExportJob(
            kind,
            sceneNameRef.current,
            settings,
            Object.keys(sceneState.elements ?? {}).length,
            Object.keys(timelineState.tracks ?? {}).length,
        );
        useExportJobStore.getState().enqueue(job);
        // Desktop exports are rendered in an isolated hidden renderer. The
        // package is built after the job snapshot is made, so later edits in
        // this workspace cannot affect the running export.
        if (window.mvmntDesktop && !readBackgroundExportBootstrap()) {
            setShowProgressOverlay(true);
            setExportKind(kind);
            setProgressData({ progress: 0, text: 'Packaging background export…' });
            useExportJobStore.getState().update(job.id, { status: 'preparing', text: 'Packaging background export…' });
            void (async () => {
                try {
                    const packaged = await exportScene(job.snapshot.sceneName);
                    if (!packaged.ok) throw new Error(packaged.errors.map((item) => item.message).join('\n') || 'Could not package the export scene.');
                    const result = await window.mvmntDesktop!.background.start({
                        jobId: job.id,
                        kind,
                        sceneName: job.snapshot.sceneName,
                        settings: structuredClone(settings) as unknown as Record<string, unknown>,
                        bytes: packaged.zip,
                    });
                    if (!result.accepted) throw new Error(result.error ?? 'Could not start background export.');
                    useExportJobStore.getState().update(job.id, { status: 'queued', text: 'Queued in background renderer' });
                } catch (error) {
                    useExportJobStore.getState().update(job.id, {
                        status: 'failed', text: 'Could not start background export',
                        error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString(),
                    });
                }
            })();
            return job;
        }
        pendingExportsRef.current.push(job);
        void drainExportQueue();
        return job;
    }, [drainExportQueue, exportSettings]);

    // The hidden renderer starts only after its packaged scene has imported.
    // It creates the same job ID as the editor so IPC progress can be merged.
    useEffect(() => {
        const background = readBackgroundExportBootstrap();
        if (!background || backgroundJobRef.current) return;
        let started = false;
        const start = () => {
            if (started || sessionStorage.getItem(`${BACKGROUND_EXPORT_KEY}.imported`) !== '1' ||
                !visualizer || !imageSequenceGenerator || !videoExporter) return;
            started = true;
            backgroundJobRef.current = background.jobId;
            const scene = useSceneStore.getState();
            const timeline = useTimelineStore.getState();
            const job = createExportJob(
                background.kind,
                background.sceneName,
                background.settings as ExportSettings,
                Object.keys(scene.elements ?? {}).length,
                Object.keys(timeline.tracks ?? {}).length,
                background.jobId,
            );
            useExportJobStore.getState().enqueue(job);
            pendingExportsRef.current.push(job);
            void drainExportQueue();
        };
        const onImported = () => start();
        window.addEventListener('mvmnt-project-imported', onImported);
        const cancel = window.mvmntDesktop?.background.onCancel((jobId) => {
            if (jobId === background.jobId) exportAbortControllersRef.current.get(jobId)?.abort();
        });
        const interval = window.setInterval(start, 100);
        return () => {
            window.removeEventListener('mvmnt-project-imported', onImported);
            window.clearInterval(interval);
            cancel?.();
        };
    }, [drainExportQueue, imageSequenceGenerator, videoExporter, visualizer]);

    // The visible editor is authoritative for job presentation. Background
    // updates never mutate the scene; they only merge lifecycle metadata.
    useEffect(() => {
        if (!window.mvmntDesktop || readBackgroundExportBootstrap()) return;
        return window.mvmntDesktop.background.onUpdate(({ jobId, patch }) => {
            useExportJobStore.getState().update(jobId, patch as Partial<ExportJob>);
            if (typeof patch.progress === 'number' || typeof patch.text === 'string') {
                setShowProgressOverlay(true);
                setProgressData({
                    progress: typeof patch.progress === 'number' ? patch.progress : 0,
                    text: typeof patch.text === 'string' ? patch.text : 'Exporting in background…',
                });
            }
        });
    }, []);

    const exportSequence = useCallback(async (override?: Partial<ExportSettings>) => {
        enqueueExport('png', override);
    }, [enqueueExport]);

    const exportVideo = useCallback(async (override?: Partial<ExportSettings>) => {
        enqueueExport('video', override);
    }, [enqueueExport]);

    useEffect(() => {
        if (!window.mvmntDesktop || !visualizer || !imageSequenceGenerator || !videoExporter) return;
        let started = false;
        const startPendingRender = async () => {
            if (started) return;
            if (!isPendingRenderImported()) return;
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
                    ...(request.range ? {
                        fullDuration: false,
                        startTime: request.range.start,
                        endTime: request.range.end,
                    } : { fullDuration: true }),
                };
                const job = enqueueExport(request.kind, settings, preset?.name);
                automationJobRef.current = job.id;
            } catch (error) {
                window.mvmntDesktop?.automation.reportResult({
                    type: 'error', code: 'render', message: error instanceof Error ? error.message : String(error),
                });
            }
        };
        const handleImported = () => void startPendingRender();
        window.addEventListener('mvmnt-project-imported', handleImported);
        // The import may complete before this provider subscribes. Poll only
        // the ready marker; never start against the prior scene on a timer.
        const fallback = window.setInterval(() => void startPendingRender(), 250);
        return () => {
            window.clearInterval(fallback);
            window.removeEventListener('mvmnt-project-imported', handleImported);
        };
    }, [enqueueExport, imageSequenceGenerator, videoExporter, visualizer]);

    const cancelExport = useCallback((jobId: string) => {
        useExportJobStore.getState().requestCancel(jobId);
        exportAbortControllersRef.current.get(jobId)?.abort();
        void window.mvmntDesktop?.background.cancel(jobId);
    }, []);

    const revealExport = useCallback(async (outputId: string) => {
        return window.mvmntDesktop?.exports.reveal(outputId) ?? false;
    }, []);

    const removeExport = useCallback((jobId: string) => {
        pendingExportsRef.current = pendingExportsRef.current.filter((job) => job.id !== jobId);
        useExportJobStore.getState().remove(jobId);
    }, []);

    const value: VisualizerContextValue = {
        canvasRef,
        visualizer,
        isPlaying,
        currentTimeLabel,
        numericCurrentTime,
        totalDuration,
        // Expose reactive scene name so UI defaults (e.g., filename field) follow latest scene title.
        sceneName: sceneNameState,
        exportSettings,
        setExportSettings,
        debugSettings,
        setDebugSettings,
        forceRender,
        playPause,
        stop,
        stepForward,
        stepBackward,
        seekPercent,
        exportSequence,
        exportVideo,
        cancelExport,
        revealExport,
        removeExport,
        showProgressOverlay,
        progressData,
        exportKind,
        closeProgress: () => setShowProgressOverlay(false),
        useTimeline: () => useTimelineStore(selectTimeline),
        useTransport: () => {
            const transport = useTimelineStore((s) => s.transport);
            const play = useTimelineStore((s) => s.play);
            const pause = useTimelineStore((s) => s.pause);
            const togglePlay = useTimelineStore((s) => s.togglePlay);
            const scrubTick = useTimelineStore((s) => s.scrubTick);
            const setCurrentTick = useTimelineStore((s) => s.setCurrentTick);
            return { transport, actions: { play, pause, togglePlay, scrubTick, setCurrentTick } };
        },
    };

    return <VisualizerContext.Provider value={value}>{children}</VisualizerContext.Provider>;
}

export const useVisualizer = () => {
    const ctx = useContext(VisualizerContext);
    if (!ctx) throw new Error('useVisualizer must be used within VisualizerProvider');
    return ctx;
};
