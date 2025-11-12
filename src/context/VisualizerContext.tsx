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
        audioCodec: 'pcm-s16',
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

    const tView = useTimelineStore((s) => s.timelineView);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
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
    }, [visualizer, playbackRange?.startTick, playbackRange?.endTick]);

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

    const exportSequence = useCallback(async (override?: Partial<ExportSettings>) => {
        if (!visualizer || !imageSequenceGenerator) return;
        const settings: ExportSettings = { ...exportSettings, ...(override || {}) } as ExportSettings;
        if (!settings.fullDuration) {
            if (settings.startTime == null || settings.endTime == null || settings.startTime >= settings.endTime) {
                alert('Invalid start/end time for export');
                return;
            }
        }
        setShowProgressOverlay(true);
        setExportKind('png');
        setProgressData({ progress: 0, text: 'Generating images...' });
        try {
            let maxFrames: number | null = null; let startFrame = 0;
            if (!settings.fullDuration) {
                const duration = visualizer.getCurrentDuration();
                const clampedStart = Math.max(0, Math.min(settings.startTime, duration));
                const clampedEnd = Math.max(clampedStart, Math.min(settings.endTime, duration));
                const totalFrames = Math.ceil((clampedEnd - clampedStart) * settings.fps);
                maxFrames = totalFrames; startFrame = Math.floor(clampedStart * settings.fps);
            }
            await imageSequenceGenerator.generateImageSequence({
                fps: settings.fps,
                width: settings.width,
                height: settings.height,
                sceneName: sceneNameRef.current,
                filename: settings.filename,
                maxFrames,
                _startFrame: startFrame,
                onProgress: (progress: number, text: string = 'Generating images...') => setProgressData({ progress, text }),
            });
        } catch (e) {
            console.error('Export error', e);
            alert('Export failed: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setShowProgressOverlay(false);
        }
    }, [visualizer, imageSequenceGenerator, exportSettings]);

    const exportVideo = useCallback(async (override?: Partial<ExportSettings>) => {
        if (!visualizer || !videoExporter) return;
        const settings: ExportSettings = { ...exportSettings, ...(override || {}) } as ExportSettings;
        if (!settings.fullDuration) {
            if (settings.startTime == null || settings.endTime == null || settings.startTime >= settings.endTime) {
                alert('Invalid start/end time for export');
                return;
            }
        }
        setShowProgressOverlay(true);
        setExportKind('video');
        setProgressData({ progress: 0, text: 'Rendering & encoding video...' });
        try {
            let maxFrames: number | null = null; let startFrame = 0;
            if (!settings.fullDuration) {
                const duration = visualizer.getCurrentDuration();
                const clampedStart = Math.max(0, Math.min(settings.startTime, duration));
                const clampedEnd = Math.max(clampedStart, Math.min(settings.endTime, duration));
                const totalFrames = Math.ceil((clampedEnd - clampedStart) * settings.fps);
                maxFrames = totalFrames; startFrame = Math.floor(clampedStart * settings.fps);
            }
            // If including audio we prefer to delegate by providing tick range so VideoExporter can hand off to AVExporter.
            let startTick: number | undefined;
            let endTick: number | undefined;
            if (settings.includeAudio) {
                try {
                    const st = useTimelineStore.getState();
                    const tm = getSharedTimingManager();
                    tm.setBPM(st.timeline.globalBpm || 120);
                    if (st.timeline.masterTempoMap) tm.setTempoMap(st.timeline.masterTempoMap, 'seconds');
                    // Determine tick range: use playbackRange if defined, else entire timeline view, else current duration
                    const pr = st.playbackRange;
                    if (pr && typeof pr.startTick === 'number' && typeof pr.endTick === 'number') {
                        startTick = pr.startTick;
                        endTick = pr.endTick;
                    } else {
                        // Approximate using duration seconds -> beats -> ticks
                        const durationSec = visualizer.getCurrentDuration();
                        const beats = tm.secondsToBeats ? tm.secondsToBeats(durationSec) : (durationSec * (st.timeline.globalBpm || 120)) / 60;
                        endTick = Math.floor(beats * tm.ticksPerQuarter);
                        startTick = 0;
                    }
                } catch { /* ignore tick derivation errors */ }
            }
            await videoExporter.exportVideo({
                fps: settings.fps,
                width: settings.width,
                height: settings.height,
                sceneName: sceneNameRef.current,
                filename: settings.filename,
                maxFrames,
                _startFrame: startFrame,
                // Pass through new optional settings
                qualityPreset: settings.qualityPreset,
                includeAudio: settings.includeAudio,
                videoCodec: settings.videoCodec,
                videoBitrateMode: settings.videoBitrateMode,
                videoBitrate: settings.videoBitrate,
                audioCodec: settings.audioCodec,
                audioBitrate: settings.audioBitrate,
                audioSampleRate: settings.audioSampleRate,
                audioChannels: settings.audioChannels,
                startTick,
                endTick,
                onProgress: (progress: number, text: string = 'Exporting video...') => setProgressData({ progress, text }),
            });
        } catch (e) {
            console.error('Video export error', e);
            alert('Video export failed: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setShowProgressOverlay(false);
        }
    }, [visualizer, videoExporter, exportSettings]);

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
        // Expose video exporter via any cast to keep interface stable (could extend later)
        // @ts-ignore
        exportVideo,
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
