import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore
import { MIDIVisualizerCore } from '@core/visualizer-core.js';
// @ts-ignore
import { ImageSequenceGenerator } from '@export/image-sequence-generator.js';
import { VideoExporter } from '@export/video-exporter.js';
import { secondsToBeats, TimelineService, TimingManager } from '@core/timing';
import { useTimelineStore } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
import { PlaybackClock } from '@core/playback-clock';
import * as tu from '@core/timing/tempo-utils';

export interface ExportSettings {
    fps: number;
    width: number;
    height: number;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
    prePadding?: number;
    postPadding?: number;
    // Optional per-export (render modal) video settings. Kept here so override typing is easy.
    bitrate?: number; // target video bitrate (bps)
    qualityPreset?: 'low' | 'medium' | 'high';
}

export interface DebugSettings {
    showAnchorPoints: boolean;
}

interface ProgressData { progress: number; text: string; }

interface VisualizerContextValue {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any | null;
    isPlaying: boolean;
    currentTimeLabel: string;
    numericCurrentTime: number;
    totalDuration: number;
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
    // Phase 4: expose timeline service to UI
    timelineService: TimelineService;
    // Phase 2: expose convenience store hooks
    useTimeline: () => TimelineState['timeline'];
    useTransport: () => { transport: TimelineState['transport']; actions: { play: () => void; pause: () => void; togglePlay: () => void; scrub: (to: number) => void; setCurrentTimeSec: (t: number) => void } };
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
        prePadding: 0,
        postPadding: 0,
    });
    const [debugSettings, setDebugSettings] = useState<DebugSettings>({ showAnchorPoints: false });
    const [showProgressOverlay, setShowProgressOverlay] = useState(false);
    const [progressData, setProgressData] = useState<ProgressData>({ progress: 0, text: 'Generating images...' });
    const sceneNameRef = useRef<string>('scene');
    // Singleton TimelineService
    const [timelineService] = useState(() => new TimelineService('Main Timeline'));

    // Listen for scene name changes broadcast by SceneContext
    useEffect(() => {
        const handler = (e: any) => {
            if (e?.detail?.sceneName) sceneNameRef.current = e.detail.sceneName;
        };
        window.addEventListener('scene-name-changed', handler as EventListener);
        return () => window.removeEventListener('scene-name-changed', handler as EventListener);
    }, []);

    // Initialize visualizer
    useEffect(() => {
        if (canvasRef.current && !visualizer) {
            const vis = new MIDIVisualizerCore(canvasRef.current);
            // Do not tie visualizer play range to initial timeline view; view should not constrain playback.
            vis.render();
            setVisualizer(vis);
            const gen = new ImageSequenceGenerator(canvasRef.current, vis);
            setImageSequenceGenerator(gen);
            const vid = new VideoExporter(canvasRef.current, vis);
            setVideoExporter(vid);
            (window as any).debugVisualizer = vis;
            // Expose timeline service globally for non-React consumers (scene elements)
            try { (window as any).mvmntTimelineService = timelineService; } catch { }
            // Removed auto-binding of first timeline track to piano roll to avoid confusion
            // (Explicit user selection now required.)
            try { /* no-op */ } catch { }
            // Sync initial fps/width/height from scene builder settings
            try {
                const s = vis.getSceneBuilder()?.getSceneSettings?.();
                if (s) {
                    setExportSettings((prev) => ({
                        ...prev,
                        fps: s.fps ?? prev.fps,
                        width: s.width ?? prev.width,
                        height: s.height ?? prev.height,
                        prePadding: s.prePadding ?? prev.prePadding ?? 0,
                        postPadding: s.postPadding ?? prev.postPadding ?? 0,
                    }));
                }
            } catch { }
        }
    }, [visualizer]);

    // (Removed duplicate view sync; see effect near bottom that also clamps current time)

    // Removed listener for auto-binding newly added tracks; user chooses explicitly now.
    useEffect(() => { return () => { /* cleanup only */ }; }, []);

    // Animation / time update loop — Phase 3: drive tick-domain playhead. We still mirror seconds for legacy UI until Phase 4 purge.
    useEffect(() => {
        if (!visualizer) return;
        let raf: number;
        let lastUIUpdate = 0;
        // Lazy-init playback clock referencing shared TimingManager (singleton inside timeline store conversions for now)
        // We approximate current tick from existing store on mount.
        const tm = new TimingManager(); // NOTE: Later phases may share instance; safe placeholder.
        const stateAtStart = useTimelineStore.getState();
        // Derive starting tick from store (already dual-written in Phase 2)
        const startTick = stateAtStart.timeline.currentTick ?? 0;
        const clock = new PlaybackClock({ timingManager: tm, initialTick: startTick });
        const loop = () => {
            const state = useTimelineStore.getState();
            const vNow = visualizer.currentTime || 0; // legacy seconds (visualizer still seconds-based internally)
            // Loop handling: if store loop active, wrap visualizer time
            const { loopEnabled, loopStartSec, loopEndSec } = state.transport;
            if (loopEnabled && loopStartSec != null && loopEndSec != null && loopEndSec > loopStartSec) {
                if (vNow >= loopEndSec - 1e-6) {
                    // Seek exactly to loop start; then mirror immediately so UI doesn't show post-start drift
                    visualizer.seek?.(loopStartSec);
                    // Wrap both seconds (for visualizer) and authoritative ticks
                    const spb = 60 / (state.timeline.globalBpm || 120);

                    const beats = tu.secondsToBeats(state.timeline.masterTempoMap, loopStartSec, spb);
                    const tmLocal = new TimingManager();
                    const tickVal = Math.round(beats * tmLocal.ticksPerQuarter);
                    clock.setTick(tickVal);
                    state.setCurrentTick(tickVal); // dual-write updates seconds
                }
            }
            // Advance clock only when transport playing; rely on visualizer.isPlaying flag indirectly
            if (state.transport.isPlaying) {
                const nextTick = clock.update(performance.now());
                if (nextTick !== state.timeline.currentTick) {
                    state.setCurrentTick(nextTick); // store converts to seconds for legacy selectors
                }
            } else {
                // If paused, keep clock in sync with any explicit seeks (seconds->tick derive once)
                const sNow = state.timeline.currentTimeSec;
                const sTick = state.timeline.currentTick ?? 0;
                // If visualizer time diverges (e.g., external seek) sync tick
                if (Math.abs(sNow - vNow) > 0.002) {
                    state.setCurrentTimeSec(vNow);
                } else if (state.timeline.currentTick == null) {
                    state.setCurrentTimeSec(vNow);
                } else {
                    // keep clock aligned with current tick
                    clock.setTick(sTick);
                }
            }

            // Throttled UI labels
            const nowTs = performance.now();
            if (nowTs - lastUIUpdate > 80) {
                const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : (visualizer.duration || 0);
                // Display time relative to the current playback window start to match manual start/end UX
                let rel = vNow;
                try { const view = useTimelineStore.getState().timelineView; rel = vNow - (view?.startSec ?? 0); } catch { }
                const format = (s: number) => {
                    const sign = s < 0 ? '-' : '';
                    const abs = Math.abs(s);
                    const m = Math.floor(abs / 60);
                    const sec = Math.floor(abs % 60);
                    return `${sign}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                };
                setCurrentTimeLabel(`${format(rel)} / ${format(total)}`);
                setNumericCurrentTime(vNow);
                setTotalDuration(total);
                lastUIUpdate = nowTs;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(raf); if (typeof visualizer.cleanup === 'function') visualizer.cleanup(); };
    }, [visualizer]);

    // Apply export settings size changes
    useEffect(() => {
        if (!visualizer || !canvasRef.current) return;
        const sceneSettings = visualizer.getSceneBuilder?.().getSceneSettings?.() || {};
        if (
            sceneSettings.fps !== exportSettings.fps ||
            sceneSettings.width !== exportSettings.width ||
            sceneSettings.height !== exportSettings.height ||
            sceneSettings.prePadding !== exportSettings.prePadding ||
            sceneSettings.postPadding !== exportSettings.postPadding
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
                    ...['fps', 'width', 'height', 'prePadding', 'postPadding'].reduce((acc: any, key) => {
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

    // Re-render canvas when fonts finish loading so text bounds recalc
    useEffect(() => {
        if (!visualizer) return;
        const handler = () => visualizer.invalidateRender?.();
        window.addEventListener('font-loaded', handler as EventListener);
        return () => window.removeEventListener('font-loaded', handler as EventListener);
    }, [visualizer]);

    const playPause = useCallback(() => {
        // Delegate play/pause to global timeline store so UI stays in sync
        const { togglePlay } = useTimelineStore.getState();
        togglePlay();
    }, []);

    // Global spacebar shortcut for play/pause (ignores when typing in inputs/contentEditable)
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.key === ' ') {
                const target = e.target as HTMLElement | null;
                const tag = target?.tagName;
                if (target?.isContentEditable) return; // allow editing
                if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return; // allow form controls
                e.preventDefault();
                const { togglePlay } = useTimelineStore.getState();
                togglePlay();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // Sync visualizer playback with global timeline store transport
    const tIsPlaying = useTimelineStore((s) => s.transport.isPlaying);
    const tCurrent = useTimelineStore((s) => s.timeline.currentTimeSec);
    useEffect(() => {
        if (!visualizer) return;
        // Toggle visualizer play/pause to match store
        if (tIsPlaying && !visualizer.isPlaying) {
            const started = visualizer.play?.();
            setIsPlaying(started && !!visualizer.isPlaying);
        } else if (!tIsPlaying && visualizer.isPlaying) {
            visualizer.pause?.();
            setIsPlaying(false);
        }
    }, [visualizer, tIsPlaying]);

    // Seek visualizer when store time changes (scrub) and update play range when view window changes
    useEffect(() => {
        if (!visualizer) return;
        const vTime = visualizer.currentTime || 0;
        // Only push from store to visualizer on explicit scrubs (big changes),
        // small drift is handled by the mirroring loop above.
        if (Math.abs(vTime - tCurrent) > 0.05) {
            visualizer.seek?.(tCurrent);
        }
    }, [visualizer, tCurrent]);

    const tView = useTimelineStore((s) => s.timelineView);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    // Loop UI disabled: ignore loop braces and use playbackRange/view only
    const setTimelineView = useTimelineStore((s) => s.setTimelineView);
    const setPlaybackRange = useTimelineStore((s) => s.setPlaybackRange);
    // Updated: Only apply an explicit play range if user defined playbackRange braces. The timeline view no longer
    // constrains or clamps playback; view panning/zooming is purely visual and must not modify playhead.
    useEffect(() => {
        if (!visualizer) return;
        const hasUserRange = typeof playbackRange?.startSec === 'number' && typeof playbackRange?.endSec === 'number';
        if (hasUserRange) {
            const start = playbackRange!.startSec as number;
            const end = playbackRange!.endSec as number;
            visualizer.setPlayRange?.(start, end);
            if (visualizer.currentTime < start || visualizer.currentTime > end) {
                const clamped = Math.min(Math.max(visualizer.currentTime, start), end);
                visualizer.seek?.(clamped);
            }
        } else {
            // Clear or widen play range if API supports it; fall back to leaving prior range alone.
            try {
                if (visualizer.clearPlayRange) visualizer.clearPlayRange();
            } catch { }
        }
    }, [visualizer, playbackRange?.startSec, playbackRange?.endSec]);

    // Initialize playbackRange once from current view so it's decoupled from pan/zoom until user changes it
    useEffect(() => {
        if (typeof playbackRange?.startSec === 'number' && typeof playbackRange?.endSec === 'number') return;
        setPlaybackRange(tView.startSec, tView.endSec);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-fit timeline view to scene duration only once when first available and the view is at default width.
    const didAutoFitRef = useRef(false);
    useEffect(() => {
        if (didAutoFitRef.current) return;
        const duration = totalDuration;
        if (!isFinite(duration) || duration <= 0) return;
        const width = Math.max(0, tView.endSec - tView.startSec);
        const isExactlyDefault = Math.abs(width - 60) < 1e-6 || width === 0;
        if (isExactlyDefault) {
            const end = Math.max(1, duration);
            setTimelineView(0, end);
            if (!(typeof playbackRange?.startSec === 'number' && typeof playbackRange?.endSec === 'number')) {
                setPlaybackRange(0, end);
            }
            didAutoFitRef.current = true;
        }
    }, [totalDuration, tView.startSec, tView.endSec, setTimelineView, playbackRange?.startSec, playbackRange?.endSec, setPlaybackRange]);

    const stop = useCallback(() => {
        if (!visualizer) return;
        visualizer.stop();
        setIsPlaying(false);
    }, [visualizer]);

    const stepForward = useCallback(() => { visualizer?.stepForward?.(); }, [visualizer]);
    const stepBackward = useCallback(() => { visualizer?.stepBackward?.(); }, [visualizer]);
    const forceRender = useCallback(() => { visualizer?.invalidateRender?.(); }, [visualizer]);
    const seekPercent = useCallback((percent: number) => {
        if (!visualizer) return;
        // Prefer explicit view window if set; otherwise fallback to visualizer duration mapping
        const { startSec, endSec } = useTimelineStore.getState().timelineView;
        const range = Math.max(0.001, endSec - startSec);
        const target = startSec + Math.max(0, Math.min(1, percent)) * range;
        visualizer.seek?.(target);
    }, [visualizer]);

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
            await videoExporter.exportVideo({
                fps: settings.fps,
                width: settings.width,
                height: settings.height,
                sceneName: sceneNameRef.current,
                maxFrames,
                _startFrame: startFrame,
                // Pass through new optional settings
                bitrate: settings.bitrate,
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
        closeProgress: () => setShowProgressOverlay(false),
        timelineService,
        useTimeline: () => useTimelineStore(selectTimeline),
        useTransport: () => {
            const transport = useTimelineStore((s) => s.transport);
            const play = useTimelineStore((s) => s.play);
            const pause = useTimelineStore((s) => s.pause);
            const togglePlay = useTimelineStore((s) => s.togglePlay);
            const scrub = useTimelineStore((s) => s.scrub);
            const setCurrentTimeSec = useTimelineStore((s) => s.setCurrentTimeSec);
            return { transport, actions: { play, pause, togglePlay, scrub, setCurrentTimeSec } };
        },
    };

    return <VisualizerContext.Provider value={value}>{children}</VisualizerContext.Provider>;
}

export const useVisualizer = () => {
    const ctx = useContext(VisualizerContext);
    if (!ctx) throw new Error('useVisualizer must be used within VisualizerProvider');
    return ctx;
};
