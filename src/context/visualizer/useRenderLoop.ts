import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import { getTransportCoordinator } from '@audio/transport-coordinator';
import { beatsToSeconds } from '@core/timing/tempo-utils';

interface UseRenderLoopArgs {
    visualizer: any | null;
    setCurrentTimeLabel: Dispatch<SetStateAction<string>>;
    setNumericCurrentTime: Dispatch<SetStateAction<number>>;
    setTotalDuration: Dispatch<SetStateAction<number>>;
}

export function useRenderLoop({
    visualizer,
    setCurrentTimeLabel,
    setNumericCurrentTime,
    setTotalDuration,
}: UseRenderLoopArgs) {
    useEffect(() => {
        if (!visualizer) return;
        let raf: number | null = null;
        let loopActive = true;
        let lastUIUpdate = 0;
        const UI_UPDATE_INTERVAL = 150;
        let lastAppliedBpm: number | null = null;
        // Sentinel forces one initial tempo-map sync so stale data cannot leak from prior sessions/projects.
        let lastTempoMapVersion: string | null = '__unset__';
        let lastTickForPaused = useTimelineStore.getState().timeline.currentTick;
        let needsFrameWhileIdle = true;

        const wakeLoop = () => {
            if (!loopActive) {
                loopActive = true;
                needsFrameWhileIdle = true;
                raf = requestAnimationFrame(loop);
            } else {
                needsFrameWhileIdle = true;
            }
        };

        const lastAppliedTickRef = { current: useTimelineStore.getState().timeline.currentTick };
        const transportCoordinator = getTransportCoordinator();
        const playSnapHandler = (e: any) => {
            if (!e?.detail?.tick) return;
            try {
                transportCoordinator.seek(e.detail.tick);
            } catch {}
        };
        window.addEventListener('timeline-play-snapped', playSnapHandler as EventListener);

        const loop = () => {
            const state = useTimelineStore.getState();
            const isPaused = !state.transport.isPlaying;

            try {
                const tmCfg = getSharedTimingManager();
                const bpm = state.timeline.globalBpm || 120;
                let tempoMapVersion: string | null = null;
                const map = state.timeline.masterTempoMap;
                if (map && map.length) {
                    tempoMapVersion = map.map(e => `${e.time}:${e.bpm}`).join(',');
                }
                let bpmChanged = false;
                if (lastAppliedBpm !== bpm) {
                    tmCfg.setBPM(bpm);
                    lastAppliedBpm = bpm;
                    bpmChanged = true;
                }
                if (tempoMapVersion !== lastTempoMapVersion || bpmChanged) {
                    // setBPM wipes _tempoSegments; always re-apply tempo map in that case
                    if (map && map.length) tmCfg.setTempoMap(map, 'seconds');
                    else tmCfg.setTempoMap(undefined, 'seconds');
                    lastTempoMapVersion = tempoMapVersion;
                }
            } catch {}

            const vNow = visualizer.currentTime || 0;
            try {
                const st = useTimelineStore.getState();
                const pr = st.playbackRange;
                if (pr?.endTick != null) {
                    const tmApprox = getSharedTimingManager();
                    const endBeats = pr.endTick / tmApprox.ticksPerQuarter;
                    const endSec = beatsToSeconds(
                        st.timeline.masterTempoMap,
                        endBeats,
                        60 / (st.timeline.globalBpm || 120)
                    );
                    if (vNow >= endSec) {
                        visualizer.pause?.();
                        try {
                            if (st.transport.isPlaying) st.pause();
                        } catch {}
                        const startTick = pr.startTick ?? 0;
                        transportCoordinator.seek(startTick);
                        st.setCurrentTick(startTick, 'clock');
                    }
                }
            } catch {}

            const { loopEnabled, loopStartTick, loopEndTick } = state.transport;
            if (
                loopEnabled &&
                typeof loopStartTick === 'number' &&
                typeof loopEndTick === 'number' &&
                loopEndTick > loopStartTick
            ) {
                try {
                    const tmLoop = getSharedTimingManager();
                    const fallbackSecondsPerBeat = 60 / (state.timeline.globalBpm || 120);
                    const loopStartSec = beatsToSeconds(
                        state.timeline.masterTempoMap,
                        loopStartTick / tmLoop.ticksPerQuarter,
                        fallbackSecondsPerBeat
                    );
                    const loopEndSec = beatsToSeconds(
                        state.timeline.masterTempoMap,
                        loopEndTick / tmLoop.ticksPerQuarter,
                        fallbackSecondsPerBeat
                    );
                    if (vNow >= loopEndSec - 1e-6) {
                        visualizer.seek?.(loopStartSec);
                        transportCoordinator.seek(loopStartTick);
                        state.setCurrentTick(loopStartTick, 'clock');
                    }
                } catch {}
            }

            let next: number | undefined | null = undefined;
            if (!isPaused) {
                next = transportCoordinator.updateFrame(performance.now());
            } else {
                const currentTickPaused = state.timeline.currentTick ?? 0;
                if (currentTickPaused !== lastTickForPaused) {
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
                        const secFromTick = tmConv.beatsToSeconds(next / tmConv.ticksPerQuarter);
                        if (Math.abs((visualizer.currentTime || 0) - secFromTick) > 0.03) visualizer.seek?.(secFromTick);
                    } catch {}
                }
            } else if (!state.transport.isPlaying) {
                const currentTickVal = state.timeline.currentTick ?? 0;
                if (currentTickVal !== lastAppliedTickRef.current) {
                    transportCoordinator.seek(currentTickVal);
                    try {
                        const tmConv = getSharedTimingManager();
                        const secFromTick = tmConv.beatsToSeconds(currentTickVal / tmConv.ticksPerQuarter);
                        if (Math.abs((visualizer.currentTime || 0) - secFromTick) > 0.001) visualizer.seek?.(secFromTick);
                    } catch {}
                    lastAppliedTickRef.current = currentTickVal;
                }
            }

            const nowTs = performance.now();
            if (nowTs - lastUIUpdate > UI_UPDATE_INTERVAL) {
                try {
                    const stNow = useTimelineStore.getState();
                    const tmDisp = getSharedTimingManager();
                    const tick = stNow.timeline.currentTick;
                    const sec = tmDisp.beatsToSeconds(tick / tmDisp.ticksPerQuarter);
                    const total = visualizer.getCurrentDuration ? visualizer.getCurrentDuration() : visualizer.duration || 0;
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
                } catch {}
                lastUIUpdate = nowTs;
            }

            if (isPaused) {
                if (!needsFrameWhileIdle) {
                    loopActive = false;
                    raf = null;
                    return;
                }
                needsFrameWhileIdle = false;
            }
            raf = requestAnimationFrame(loop);
        };

        raf = requestAnimationFrame(loop);

        type SubState = { tick: number; playing: boolean; bpm: number; tempoMapLen: number; tempoMapRef: unknown };
        let prevSub: SubState = {
            tick: useTimelineStore.getState().timeline.currentTick,
            playing: useTimelineStore.getState().transport.isPlaying,
            bpm: useTimelineStore.getState().timeline.globalBpm,
            tempoMapLen: useTimelineStore.getState().timeline.masterTempoMap?.length || 0,
            tempoMapRef: useTimelineStore.getState().timeline.masterTempoMap,
        };
        const unsub = useTimelineStore.subscribe((s) => {
            const nextState: SubState = {
                tick: s.timeline.currentTick,
                playing: s.transport.isPlaying,
                bpm: s.timeline.globalBpm,
                tempoMapLen: s.timeline.masterTempoMap?.length || 0,
                tempoMapRef: s.timeline.masterTempoMap,
            };
            const p = prevSub;
            if (nextState.playing && !p.playing) wakeLoop();
            else if (!nextState.playing && p.playing) wakeLoop();
            else if (nextState.tick !== p.tick) wakeLoop();
            else if (nextState.bpm !== p.bpm) wakeLoop();
            else if (nextState.tempoMapRef !== p.tempoMapRef) wakeLoop();
            prevSub = nextState;
        });
        const visInvalidate = () => wakeLoop();
        visualizer.canvas?.addEventListener('visualizer-update', visInvalidate);
        const fontLoaded = () => wakeLoop();
        window.addEventListener('font-loaded', fontLoaded as EventListener);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('timeline-play-snapped', playSnapHandler as EventListener);
            if (typeof visualizer.cleanup === 'function') visualizer.cleanup();
            visualizer.canvas?.removeEventListener('visualizer-update', visInvalidate);
            window.removeEventListener('font-loaded', fontLoaded as EventListener);
            unsub?.();
        };
    }, [visualizer, setCurrentTimeLabel, setNumericCurrentTime, setTotalDuration]);
}
