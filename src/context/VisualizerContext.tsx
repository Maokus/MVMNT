import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore
import { MIDIVisualizerCore } from '@core/visualizer-core.js';
// @ts-ignore
import { ImageSequenceGenerator } from '@export/image-sequence-generator.js';
import { VideoExporter } from '@export/video-exporter.js';
import { TimingManager } from '@core/timing';
import { getSharedTimingManager } from '@state/timelineStore';
import { useTimelineStore } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
import { PlaybackClock } from '@core/playback-clock';
// Removed direct secondsToBeats usage for loop wrap; conversions now derive from ticks via shared TimingManager

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
    // TimelineService removed: all track/timeline operations flow through Zustand store.

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
            // Global timeline service removed; non-React consumers should use store adapters instead.
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

    // Animation / time update loop — drives tick-domain playhead. Seconds are derived for any UI that needs them.
    // NOTE (2025-09): Updated paused-state sync so manual tick scrubs (ruler drag while paused) immediately seek the
    // visualizer instead of being reverted by the seconds->tick mirror. We track the last applied tick to detect user driven changes.
    useEffect(() => {
        if (!visualizer) return;
        let raf: number;
        let lastUIUpdate = 0;
        const lastAppliedTickRef = { current: useTimelineStore.getState().timeline.currentTick };
        // Lazy-init playback clock referencing shared TimingManager (singleton inside timeline store conversions for now)
        // We approximate current tick from existing store on mount.
        const tm = getSharedTimingManager();
        const stateAtStart = useTimelineStore.getState();
        // Derive starting tick from store (already dual-written)
        const startTick = stateAtStart.timeline.currentTick ?? 0;
        const clock = new PlaybackClock({
            timingManager: tm,
            initialTick: startTick,
            autoStartPaused: !stateAtStart.transport.isPlaying,
        });
        const playSnapHandler = (e: any) => {
            if (!e?.detail?.tick) return;
            try { clock.setTick(e.detail.tick); } catch { /* ignore */ }
        };
        window.addEventListener('timeline-play-snapped', playSnapHandler as EventListener);

        const loop = () => {
            const state = useTimelineStore.getState();
            const vNow = visualizer.currentTime || 0; // seconds (visualizer still seconds-based internally)
            // Determine playback end (stop automatically when playhead passes explicit playback range end)
            try {
                const st = useTimelineStore.getState();
                const pr = st.playbackRange;
                if (pr?.endTick != null) {
                    // Convert authoritative tick to seconds for comparison (approx using TimingManager)
                    const tmApprox = getSharedTimingManager();
                    tmApprox.setBPM(st.timeline.globalBpm || 120);
                    const endBeats = pr.endTick / tmApprox.ticksPerQuarter;
                    const endSec = tmApprox.beatsToSeconds(endBeats);
                    if (vNow >= endSec) {
                        // Auto-stop behavior: pause visualizer & transport, reset playhead to start (loop-like) without killing RAF loop.
                        visualizer.pause?.();
                        try { if (st.transport.isPlaying) st.pause(); } catch { /* ignore */ }
                        const startTick = pr.startTick ?? 0;
                        clock.setTick(startTick);
                        st.setCurrentTick(startTick, 'clock');
                        // Do not early-return; allow rest of loop to process paused state and schedule next frame.
                    }
                }
            } catch { }
            // Loop handling (tick domain): if loop active and visualizer time passes loop end, wrap to loop start.
            const { loopEnabled, loopStartTick, loopEndTick } = state.transport;
            if (
                loopEnabled &&
                typeof loopStartTick === 'number' &&
                typeof loopEndTick === 'number' &&
                loopEndTick > loopStartTick
            ) {
                try {
                    const tmLoop = getSharedTimingManager();
                    tmLoop.setBPM(state.timeline.globalBpm || 120);
                    if (state.timeline.masterTempoMap) tmLoop.setTempoMap(state.timeline.masterTempoMap, 'seconds');
                    const loopStartSec = tmLoop.beatsToSeconds(loopStartTick / tmLoop.ticksPerQuarter);
                    const loopEndSec = tmLoop.beatsToSeconds(loopEndTick / tmLoop.ticksPerQuarter);
                    if (vNow >= loopEndSec - 1e-6) {
                        visualizer.seek?.(loopStartSec);
                        clock.setTick(loopStartTick);
                        state.setCurrentTick(loopStartTick, 'clock');
                    }
                } catch {
                    /* ignore loop wrap errors */
                }
            }
            // Manage pause/resume of playback clock.
            if (!state.transport.isPlaying) {
                if (!clock.isPaused) clock.pause(performance.now());
            } else if (clock.isPaused) {
                clock.resume(performance.now());
            }
            // Advance clock only when transport playing
            if (state.transport.isPlaying) {
                // CLOCK → STORE → VISUALIZER
                const storeTick = state.timeline.currentTick ?? 0;
                if (storeTick !== clock.currentTick) {
                    clock.setTick(storeTick); // accept external seek while playing
                }
                const nextTick = clock.update(performance.now());
                if (nextTick !== storeTick) {
                    state.setCurrentTick(nextTick, 'clock');
                    lastAppliedTickRef.current = nextTick;
                    // Derive seconds and seek visualizer only if significant drift (visualizer still seconds-based)
                    try {
                        const tmConv = getSharedTimingManager();
                        tmConv.setBPM(state.timeline.globalBpm || 120);
                        const secFromTick = tmConv.beatsToSeconds(nextTick / tmConv.ticksPerQuarter);
                        if (Math.abs((visualizer.currentTime || 0) - secFromTick) > 0.03) visualizer.seek?.(secFromTick);
                    } catch { /* ignore */ }
                }
            } else {
                // PAUSED: USER (store tick) → CLOCK & VISUALIZER
                const currentTickVal = state.timeline.currentTick ?? 0;
                if (currentTickVal !== lastAppliedTickRef.current) {
                    try {
                        const tmConv = getSharedTimingManager();
                        tmConv.setBPM(state.timeline.globalBpm || 120);
                        const secFromTick = tmConv.beatsToSeconds(currentTickVal / tmConv.ticksPerQuarter);
                        if (Math.abs((visualizer.currentTime || 0) - secFromTick) > 0.001) visualizer.seek?.(secFromTick);
                    } catch { /* noop */ }
                    clock.setTick(currentTickVal);
                    lastAppliedTickRef.current = currentTickVal;
                } else {
                    clock.setTick(currentTickVal); // keep internal fractional cleared
                }
            }

            // Throttled UI labels
            const nowTs = performance.now();
            if (nowTs - lastUIUpdate > 80) {
                const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : (visualizer.duration || 0);
                // Display time relative to the current playback window start to match manual start/end UX
                let rel = vNow;
                try {
                    const view = useTimelineStore.getState().timelineView as any;
                    // startSec is injected by subscribe shim; use fallback when absent
                    const startSec = typeof view.startSec === 'number' ? view.startSec : 0;
                    rel = vNow - startSec;
                } catch { /* ignore */ }
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
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('timeline-play-snapped', playSnapHandler as EventListener);
            if (typeof visualizer.cleanup === 'function') visualizer.cleanup();
        };
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
    // Use derived seconds selector instead of removed currentTimeSec
    const tCurrent = useTimelineStore((s) => {
        const spb = 60 / (s.timeline.globalBpm || 120);
        const beats = s.timeline.currentTick / getSharedTimingManager().ticksPerQuarter;
        return getSharedTimingManager().beatsToSeconds(beats); // TimingManager already accounts for tempo map
    });
    useEffect(() => {
        if (!visualizer) return;
        // Toggle visualizer play/pause to match store
        if (tIsPlaying && !visualizer.isPlaying) {
            visualizer.play?.();
        } else if (!tIsPlaying && visualizer.isPlaying) {
            visualizer.pause?.();
        }
    }, [visualizer, tIsPlaying]);

    // Seek visualizer when store time changes (scrub) and update play range when view window changes
    useEffect(() => {
        if (!visualizer) return;
        const vTime = visualizer.currentTime || 0;
        // Only push from store to visualizer on explicit scrubs (big changes),
        // small drift is handled by the mirroring loop above.
        if (typeof tCurrent === 'number' && Math.abs(vTime - tCurrent) > 0.05) {
            visualizer.seek?.(tCurrent);
        }
    }, [visualizer, tCurrent]);

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

    const stop = useCallback(() => {
        if (!visualizer) return;
        const state = useTimelineStore.getState();
        state.pause();
        const targetTick =
            (state.playbackRange?.startTick ?? state.timelineView?.startTick ?? state.timeline.currentTick ?? 0) || 0;
        state.setCurrentTick(targetTick, 'user');
        visualizer.stop?.();
    }, [visualizer]);

    const stepForward = useCallback(() => { visualizer?.stepForward?.(); }, [visualizer]);
    const stepBackward = useCallback(() => { visualizer?.stepBackward?.(); }, [visualizer]);
    const forceRender = useCallback(() => { visualizer?.invalidateRender?.(); }, [visualizer]);
    const seekPercent = useCallback((percent: number) => {
        const st = useTimelineStore.getState();
        const { startTick, endTick } = st.timelineView;
        const normalized = Math.max(0, Math.min(1, percent));
        const span = Math.max(1, endTick - startTick);
        const targetTick = startTick + normalized * span;
        st.setCurrentTick(Math.max(0, Math.round(targetTick)), 'user');
    }, []);

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
        isPlaying: tIsPlaying,
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
