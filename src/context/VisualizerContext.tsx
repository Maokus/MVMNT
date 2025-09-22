import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore
import { MIDIVisualizerCore } from '@core/visualizer-core.js';
// @ts-ignore
import { ImageSequenceGenerator } from '@export/image-sequence-generator.js';
import { VideoExporter } from '@export/video-exporter.js';
// Side-effect import: registers window.AVExporter so VideoExporter can delegate audio-inclusive exports.
import '@export/av-exporter.js';
import { TimingManager } from '@core/timing';
import { getSharedTimingManager } from '@state/timelineStore';
import { useTimelineStore } from '@state/timelineStore';
import type { TimelineState } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
// PlaybackClock now wrapped by TransportCoordinator; direct usage removed in favor of a unified transport API.
import { getTransportCoordinator } from '@audio/transport-coordinator';
// Removed direct secondsToBeats usage for loop wrap; conversions now derive from ticks via shared TimingManager

export interface ExportSettings {
    fps: number;
    width: number;
    height: number;
    fullDuration: boolean;
    startTime: number;
    endTime: number;
    // Optional user-specified base filename (without extension). Defaults to current scene name when not provided.
    filename?: string;
    // (Padding removed from system)
    // Optional per-export (render modal) video settings. Kept here so override typing is easy.
    bitrate?: number; // target video bitrate (bps)
    qualityPreset?: 'low' | 'medium' | 'high';
    includeAudio?: boolean; // whether to include audio when exporting MP4 (delegates to AV exporter). Default true.
    // Advanced export settings (A/V codecs & container negotiation)
    // container deprecated (always mp4 currently)
    container?: 'auto' | 'mp4' | 'webm';
    videoCodec?: string; // 'h264' (alias of avc) default; 'auto' tries h264 then fallback
    videoBitrateMode?: 'auto' | 'manual';
    videoBitrate?: number; // manual video bitrate (bps) when mode == manual (supersedes legacy bitrate field)
    audioCodec?: string; // 'auto' | codec id (aac, opus, vorbis, etc.)
    audioBitrate?: number; // bps
    audioSampleRate?: 'auto' | 44100 | 48000;
    audioChannels?: 1 | 2;
}

export interface DebugSettings {
    showAnchorPoints: boolean;
}

interface ProgressData { progress: number; text: string; }

type ExportKind = 'png' | 'video' | null;

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
        audioCodec: 'aac',
        videoBitrateMode: 'auto',
        audioSampleRate: 'auto',
        audioChannels: 2,
    });
    const [debugSettings, setDebugSettings] = useState<DebugSettings>({ showAnchorPoints: false });
    const [showProgressOverlay, setShowProgressOverlay] = useState(false);
    const [progressData, setProgressData] = useState<ProgressData>({ progress: 0, text: 'Generating images...' });
    const [exportKind, setExportKind] = useState<ExportKind>(null);
    const sceneNameRef = useRef<string>('scene');
    // Keep a reactive scene name so consumers (like Render / Export modal) get live updates.
    const [sceneNameState, setSceneNameState] = useState<string>('scene');
    // TimelineService removed: all track/timeline operations flow through Zustand store.

    // Listen for scene name changes broadcast by SceneContext
    useEffect(() => {
        const handler = (e: any) => {
            if (e?.detail?.sceneName) {
                sceneNameRef.current = e.detail.sceneName;
                setSceneNameState(e.detail.sceneName);
            }
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
        let raf: number | null = null;
        let loopActive = true; // whether we are currently running RAF frames
        let lastUIUpdate = 0;
        const UI_UPDATE_INTERVAL = 150; // ms (throttled per Optimization #2)
        // Memoization for TimingManager config (#3)
        let lastAppliedBpm: number | null = null;
        let lastTempoMapVersion: string | null = null; // stringified length+first+last markers
        // Track last tick for short-circuit (#4)
        let lastTickForPaused = useTimelineStore.getState().timeline.currentTick;
        // A flag that something changed while idle so we must render a frame
        let needsFrameWhileIdle = true;

        const wakeLoop = (why: string) => {
            if (!loopActive) {
                loopActive = true;
                needsFrameWhileIdle = true;
                raf = requestAnimationFrame(loop);
            } else {
                // If already active but paused-idle, ensure one more frame
                needsFrameWhileIdle = true;
            }
        };
        const lastAppliedTickRef = { current: useTimelineStore.getState().timeline.currentTick };
        // Lazy-init playback clock referencing shared TimingManager (singleton inside timeline store conversions for now)
        // We approximate current tick from existing store on mount.
        const tm = getSharedTimingManager();
        const stateAtStart = useTimelineStore.getState();
        // Derive starting tick from store (already dual-written)
        const startTick = stateAtStart.timeline.currentTick ?? 0;
        const transportCoordinator = getTransportCoordinator();
        const playSnapHandler = (e: any) => {
            if (!e?.detail?.tick) return;
            try { transportCoordinator.seek(e.detail.tick); } catch { /* ignore */ }
        };
        window.addEventListener('timeline-play-snapped', playSnapHandler as EventListener);

        const loop = () => {
            const state = useTimelineStore.getState();
            // Optimization #1: Suspend RAF loop if paused & nothing changed
            const isPaused = !state.transport.isPlaying;

            // Apply memoized TimingManager configuration (#3)
            try {
                const tmCfg = getSharedTimingManager();
                const bpm = state.timeline.globalBpm || 120;
                let tempoMapVersion: string | null = null;
                const map = state.timeline.masterTempoMap;
                if (map && map.length) {
                    const first = map[0];
                    const last = map[map.length - 1];
                    // Build a lightweight signature: length + first.time + last.time + first.bpm + last.bpm (if present)
                    // TempoMapEntry assumed shape { time?: number; bpm?: number; ... }
                    tempoMapVersion = `${map.length}:${first?.time ?? 0}:${last?.time ?? 0}:${first?.bpm ?? ''}:${last?.bpm ?? ''}`;
                }
                if (lastAppliedBpm !== bpm) {
                    tmCfg.setBPM(bpm);
                    lastAppliedBpm = bpm;
                }
                if (tempoMapVersion !== lastTempoMapVersion) {
                    if (map && map.length) tmCfg.setTempoMap(map, 'seconds');
                    else tmCfg.setTempoMap(undefined, 'seconds');
                    lastTempoMapVersion = tempoMapVersion;
                }
            } catch { /* ignore timing manager errors */ }
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
                        transportCoordinator.seek(startTick);
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
                        transportCoordinator.seek(loopStartTick);
                        state.setCurrentTick(loopStartTick, 'clock');
                    }
                } catch {
                    /* ignore loop wrap errors */
                }
            }
            let next: number | undefined | null = undefined;
            if (!isPaused) {
                next = transportCoordinator.updateFrame(performance.now());
            } else {
                // Optimization #4: short-circuit when paused and tick unchanged
                const currentTickPaused = state.timeline.currentTick ?? 0;
                if (currentTickPaused !== lastTickForPaused) {
                    // allow reconciliation path to run so visuals follow scrub
                    next = currentTickPaused;
                    lastTickForPaused = currentTickPaused;
                }
            }
            if (typeof next === 'number') {
                const storeTick = state.timeline.currentTick ?? 0;
                if (next !== storeTick) {
                    state.setCurrentTick(next, 'clock');
                    lastAppliedTickRef.current = next;
                    try {
                        const tmConv = getSharedTimingManager();
                        // BPM already memo-applied; only tempo map may need ensure (cheap guard)
                        const secFromTick = tmConv.beatsToSeconds(next / tmConv.ticksPerQuarter);
                        if (Math.abs((visualizer.currentTime || 0) - secFromTick) > 0.03) visualizer.seek?.(secFromTick);
                    } catch { /* ignore */ }
                }
            } else if (!state.transport.isPlaying) {
                const currentTickVal = state.timeline.currentTick ?? 0;
                if (currentTickVal !== lastAppliedTickRef.current) {
                    transportCoordinator.seek(currentTickVal);
                    try {
                        const tmConv = getSharedTimingManager();
                        // BPM already set if changed
                        const secFromTick = tmConv.beatsToSeconds(currentTickVal / tmConv.ticksPerQuarter);
                        if (Math.abs((visualizer.currentTime || 0) - secFromTick) > 0.001) visualizer.seek?.(secFromTick);
                    } catch { /* noop */ }
                    lastAppliedTickRef.current = currentTickVal;
                }
            }

            // Throttled UI labels
            const nowTs = performance.now();
            if (nowTs - lastUIUpdate > UI_UPDATE_INTERVAL) {
                // Canonical tick -> seconds conversion for display to avoid drift between visualizer internal clock & store tick.
                try {
                    const stNow = useTimelineStore.getState();
                    const tmDisp = getSharedTimingManager();
                    const tick = stNow.timeline.currentTick;
                    const sec = tmDisp.beatsToSeconds(tick / tmDisp.ticksPerQuarter);
                    const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : (visualizer.duration || 0);
                    const format = (s: number) => {
                        const sign = s < 0 ? '-' : '';
                        const abs = Math.abs(s);
                        const m = Math.floor(abs / 60);
                        const secI = Math.floor(abs % 60);
                        return `${sign}${m.toString().padStart(2, '0')}:${secI.toString().padStart(2, '0')}`;
                    };
                    setCurrentTimeLabel(`${format(sec)} / ${format(total)}`);
                    setNumericCurrentTime(sec);
                    setTotalDuration(total);
                } catch { /* ignore display calc errors */ }
                lastUIUpdate = nowTs;
            }
            // Decide whether to continue RAF
            if (isPaused) {
                // If paused and no pending visualizer invalidation or scrub, allow suspension
                if (!needsFrameWhileIdle) {
                    loopActive = false; // stop scheduling further frames; wakeLoop will restart
                    raf = null;
                    return; // suspend
                }
                // We consumed the needed frame
                needsFrameWhileIdle = false;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        // Wake triggers
        type SubState = { tick: number; playing: boolean; bpm: number; tempoMapLen: number };
        let prevSub: SubState = {
            tick: useTimelineStore.getState().timeline.currentTick,
            playing: useTimelineStore.getState().transport.isPlaying,
            bpm: useTimelineStore.getState().timeline.globalBpm,
            tempoMapLen: useTimelineStore.getState().timeline.masterTempoMap?.length || 0,
        };
        const unsub = useTimelineStore.subscribe((s, prev) => {
            const nextState: SubState = {
                tick: s.timeline.currentTick,
                playing: s.transport.isPlaying,
                bpm: s.timeline.globalBpm,
                tempoMapLen: s.timeline.masterTempoMap?.length || 0,
            };
            const p = prevSub;
            if (nextState.playing && !p.playing) wakeLoop('play');
            else if (!nextState.playing && p.playing) wakeLoop('pause');
            else if (nextState.tick !== p.tick) wakeLoop('tick');
            else if (nextState.bpm !== p.bpm) wakeLoop('bpm');
            else if (nextState.tempoMapLen !== p.tempoMapLen) wakeLoop('tempoMap');
            prevSub = nextState;
        });
        const visInvalidate = () => wakeLoop('visualizerInvalidate');
        visualizer.canvas?.addEventListener('visualizer-update', visInvalidate);
        const fontLoaded = () => wakeLoop('fontLoaded');
        window.addEventListener('font-loaded', fontLoaded as EventListener);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('timeline-play-snapped', playSnapHandler as EventListener);
            if (typeof visualizer.cleanup === 'function') visualizer.cleanup();
            visualizer.canvas?.removeEventListener('visualizer-update', visInvalidate);
            window.removeEventListener('font-loaded', fontLoaded as EventListener);
            unsub?.();
        };
    }, [visualizer]);

    // Apply export settings size changes
    useEffect(() => {
        if (!visualizer || !canvasRef.current) return;
        const sceneSettings = visualizer.getSceneBuilder?.().getSceneSettings?.() || {};
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

    // Global spacebar shortcut for play/pause
    // Requirements:
    // - Always toggle transport with Space while in workspace (this provider only mounts there)
    // - Prevent default behavior that re-opens or re-focuses dropdown <select> elements
    // - Still allow entering spaces inside genuine text-editing fields (text inputs, textareas, contentEditable)
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.key === ' ') {
                const target = e.target as HTMLElement | null;
                const tag = target?.tagName;
                // Determine if the focused element is a text-editing control where the user reasonably expects a space character
                let isEditing = false;
                if (target) {
                    if (target.isContentEditable) {
                        isEditing = true;
                    } else if (tag === 'TEXTAREA') {
                        isEditing = true;
                    } else if (tag === 'INPUT') {
                        const type = (target as HTMLInputElement).type;
                        const textLike = ['text', 'search', 'url', 'tel', 'email', 'password'];
                        if (textLike.includes(type)) isEditing = true;
                    }
                }
                // If it's a pure text editing field, do NOT hijack space.
                if (isEditing) return;
                // For everything else (including SELECT, number inputs, buttons, etc.) we treat space as transport toggle.
                // This prevents reopening of dropdown menus after interaction.
                e.preventDefault();
                try {
                    const { togglePlay } = useTimelineStore.getState();
                    togglePlay();
                } catch { /* ignore */ }
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
        visualizer.stop();
        setIsPlaying(false);
    }, [visualizer]);

    const stepForward = useCallback(() => { visualizer?.stepForward?.(); }, [visualizer]);
    const stepBackward = useCallback(() => { visualizer?.stepBackward?.(); }, [visualizer]);
    const forceRender = useCallback(() => { visualizer?.invalidateRender?.(); }, [visualizer]);
    const seekPercent = useCallback((percent: number) => {
        if (!visualizer) return;
        const st = useTimelineStore.getState();
        const { startTick, endTick } = st.timelineView;
        const tm = getSharedTimingManager();
        tm.setBPM(st.timeline.globalBpm || 120);
        const startSec = tm.beatsToSeconds(startTick / tm.ticksPerQuarter);
        const endSec = tm.beatsToSeconds(endTick / tm.ticksPerQuarter);
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
                bitrate: settings.bitrate,
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
