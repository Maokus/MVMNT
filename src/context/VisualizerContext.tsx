import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore
import { MIDIVisualizerCore } from '@core/visualizer-core.js';
// @ts-ignore
import { ImageSequenceGenerator } from '@export/image-sequence-generator.js';
import { VideoExporter } from '@export/video-exporter.js';
import { TimelineService } from '@core/timing';
import { useTimelineStore } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';

export interface ExportSettings {
    fps: number;
    width: number;
    height: number;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
    prePadding?: number;
    postPadding?: number;
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
    exportStatus: string;
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
    const [exportStatus, setExportStatus] = useState('Load MIDI or create scene to enable export');
    const [exportSettings, setExportSettings] = useState<ExportSettings>({
        fps: 30,
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
            // Initialize play range from current view window
            try {
                const { startSec, endSec } = useTimelineStore.getState().timelineView;
                vis.setPlayRange?.(startSec, endSec);
            } catch { }
            vis.render();
            setVisualizer(vis);
            const gen = new ImageSequenceGenerator(canvasRef.current, vis);
            setImageSequenceGenerator(gen);
            const vid = new VideoExporter(canvasRef.current, vis);
            setVideoExporter(vid);
            (window as any).debugVisualizer = vis;
            // Expose timeline service globally for non-React consumers (scene elements)
            try { (window as any).mvmntTimelineService = timelineService; } catch { }
            // Auto-bind first timeline track to default piano roll if none assigned
            try {
                const st = useTimelineStore.getState();
                const firstTrackId = st.tracksOrder.find((id) => st.tracks[id]?.type === 'midi');
                if (firstTrackId) {
                    const sb = vis.getSceneBuilder?.();
                    const rolls: any[] = sb?.getElementsByType?.('timeUnitPianoRoll') || [];
                    const roll: any = rolls[0];
                    if (roll) {
                        const ids = roll.getProperty?.('midiTrackIds');
                        const id = roll.getProperty?.('midiTrackId');
                        const hasIds = Array.isArray(ids) && ids.length > 0;
                        const hasId = !!id;
                        if (!hasIds && !hasId) {
                            roll.updateConfig?.({ midiTrackId: firstTrackId });
                        }
                    }
                }
            } catch { }
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

    // Auto-bind first newly added track if default piano roll has no selection yet
    useEffect(() => {
        const onAdded = (e: any) => {
            try {
                const vis = (window as any).debugVisualizer;
                const sb = vis?.getSceneBuilder?.();
                const rolls: any[] = sb?.getElementsByType?.('timeUnitPianoRoll') || [];
                const roll: any = rolls[0];
                if (!roll) return;
                const ids = roll.getProperty?.('midiTrackIds');
                const id = roll.getProperty?.('midiTrackId');
                const hasIds = Array.isArray(ids) && ids.length > 0;
                const hasId = !!id;
                if (!hasIds && !hasId) {
                    const trackId = e?.detail?.trackId;
                    if (trackId) roll.updateConfig?.({ midiTrackId: trackId });
                }
            } catch { }
        };
        window.addEventListener('timeline-track-added', onAdded as EventListener);
        return () => window.removeEventListener('timeline-track-added', onAdded as EventListener);
    }, []);

    // Animation / time update loop — mirror visualizer time into store and update UI
    useEffect(() => {
        if (!visualizer) return;
        let raf: number;
        let lastUIUpdate = 0;
        const loop = () => {
            const state = useTimelineStore.getState();
            const vNow = visualizer.currentTime || 0;
            // Loop handling: if store loop active, wrap visualizer time
            const { loopEnabled, loopStartSec, loopEndSec } = state.transport;
            if (loopEnabled && loopStartSec != null && loopEndSec != null && loopEndSec > loopStartSec) {
                if (vNow > loopEndSec + 1e-4) {
                    visualizer.seek?.(loopStartSec);
                }
            } else {
                // When not looping, clamp playback to timeline view end (user-defined play window)
                const { endSec } = state.timelineView;
                if (vNow > endSec + 1e-4) {
                    visualizer.pause?.();
                    state.pause();
                    visualizer.seek?.(endSec);
                }
            }
            // Mirror into store if drift > small epsilon to avoid feedback churn
            const sNow = state.timeline.currentTimeSec;
            if (Math.abs(sNow - vNow) > 0.002) {
                state.setCurrentTimeSec(vNow);
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
                const hasValidScene = total > 0;
                setExportStatus(hasValidScene ? 'Ready to export' : 'Load MIDI to enable export');
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
    useEffect(() => {
        if (!visualizer) return;
        visualizer.setPlayRange?.(tView.startSec, tView.endSec);
        // Ensure current time remains inside new range
        if (visualizer.currentTime < tView.startSec || visualizer.currentTime > tView.endSec) {
            visualizer.seek?.(Math.min(Math.max(visualizer.currentTime, tView.startSec), tView.endSec));
        }
    }, [visualizer, tView.startSec, tView.endSec]);

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
        exportStatus,
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
