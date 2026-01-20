import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { RULER_HEIGHT } from './constants';
import { useTickScale } from './useTickScale';
import { sharedTimingManager } from '@state/timelineStore';
import { formatTickAsBBT } from '@core/timing/time-domain';
import { quantizeSettingToBeats, type QuantizeSetting } from '@state/timeline/quantize';

// Snap tick helper
function useSnapTicks() {
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    // Use shared singleton timing manager so BPM / tempo map changes propagate consistently
    const tm = sharedTimingManager;
    return useCallback(
        (candidateTick: number, opts?: { altKey?: boolean; forceBar?: boolean }) => {
            const { altKey, forceBar } = opts || {};
            if (altKey) return Math.max(0, candidateTick);
            const target: QuantizeSetting = forceBar ? 'bar' : quantize;
            if (target === 'off') return Math.max(0, candidateTick);
            const beatLength = quantizeSettingToBeats(target, beatsPerBar);
            if (!beatLength) return Math.max(0, candidateTick);
            const tpq = tm.ticksPerQuarter;
            const resolution = Math.max(1, Math.round(beatLength * tpq));
            const snappedUnits = Math.round(candidateTick / resolution);
            return Math.max(0, snappedUnits * resolution);
        },
        [quantize, beatsPerBar, tm]
    );
}

const BRACE_HIT_W = 8;

const TimelineRuler: React.FC = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const height = RULER_HEIGHT;
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const { view, toTick, toX } = useTickScale();
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const seekTick = useTimelineStore((s) => s.seekTick);
    const setCurrentTick = useTimelineStore((s) => s.setCurrentTick);
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const snapTicks = useSnapTicks();

    // Resize handling
    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWidth(Math.max(1, Math.floor(entry.contentRect.width)));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Build bar ticks for the visible range (with slight padding for readability)
    const bars = useMemo(() => {
        const tpq = sharedTimingManager.ticksPerQuarter;
        const ticksPerBar = beatsPerBar * tpq;
        const startBar = Math.floor(view.startTick / ticksPerBar) - 1;
        const endBar = Math.ceil(view.endTick / ticksPerBar) + 1;
        const arr: Array<{ barIdx: number; tick: number }> = [];
        for (let b = Math.max(0, startBar); b <= endBar; b++) arr.push({ barIdx: b, tick: b * ticksPerBar });
        return arr;
    }, [view.startTick, view.endTick, beatsPerBar]);

    // Optionally compute beat ticks if there's enough room per bar
    const beatTicks = useMemo(() => {
        if (!width || bars.length < 2) return [] as Array<{ tick: number; isBar: boolean }>;
        const tpq = sharedTimingManager.ticksPerQuarter;
        const ticksPerBar = beatsPerBar * tpq;
        const pxPerBar = Math.abs(toX(bars[1].tick, width) - toX(bars[0].tick, width));
        const showBeats = pxPerBar > 48;
        const arr: Array<{ tick: number; isBar: boolean }> = [];
        for (let i = 0; i < bars.length; i++) {
            const b = bars[i];
            arr.push({ tick: b.tick, isBar: true });
            if (showBeats) {
                for (let beat = 1; beat < beatsPerBar; beat++) {
                    arr.push({ tick: b.tick + beat * tpq, isBar: false });
                }
            }
        }
        return arr;
    }, [bars, width, toX, beatsPerBar]);

    // Pointer interactions: click to seek, drag braces
    const dragState = useRef<
        | null
        | {
            type: 'seek' | 'loop-start' | 'loop-end' | 'play-start' | 'play-end';
            originX: number;
            originSec: number;
            startSec: number | undefined;
            endSec: number | undefined;
            alt: boolean;
        }
    >(null);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const tick = toTick(x, width);
        const pr = useTimelineStore.getState().playbackRange;
        const playStart = pr?.startTick ?? view.startTick;
        const playEnd = pr?.endTick ?? view.endTick;
        const playStartX = toX(playStart, width);
        const playEndX = toX(playEnd, width);

        let type: 'seek' | 'play-start' | 'play-end' = 'seek';
        if (Math.abs(x - playStartX) <= BRACE_HIT_W) type = 'play-start';
        else if (Math.abs(x - playEndX) <= BRACE_HIT_W) type = 'play-end';

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragState.current = {
            type,
            originX: x,
            originSec: 0,
            startSec: playStart,
            endSec: playEnd,
            alt: !!e.altKey,
        };
        if (type === 'seek') {
            const snapped = snapTicks(tick, { altKey: e.altKey, forceBar: e.shiftKey });
            e.altKey ? setCurrentTick(snapped) : seekTick(snapped);
        }
    };

    // Change cursor when hovering over draggable braces
    const onPointerMoveRoot = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        // If actively dragging brace, keep default (handled elsewhere)
        if (dragState.current && dragState.current.type !== 'seek') return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pr = useTimelineStore.getState().playbackRange;
        const playStart = pr?.startTick ?? view.startTick;
        const playEnd = pr?.endTick ?? view.endTick;
        const playStartX = toX(playStart, width);
        const playEndX = toX(playEnd, width);
        const nearStart = Math.abs(x - playStartX) <= BRACE_HIT_W;
        const nearEnd = Math.abs(x - playEndX) <= BRACE_HIT_W;
        if (nearStart || nearEnd) {
            containerRef.current.style.cursor = 'col-resize';
        } else {
            containerRef.current.style.cursor = 'default';
        }
    };

    const autoPanWhileSeeking = useCallback(
        (x: number) => {
            if (!containerRef.current) return;
            const edgePadding = Math.min(80, Math.max(16, width * 0.1));
            if (edgePadding <= 0) return;
            const viewState = useTimelineStore.getState().timelineView;
            const range = Math.max(1, viewState.endTick - viewState.startTick);
            let direction = 0;
            let overflow = 0;
            if (x < edgePadding) {
                direction = -1;
                overflow = edgePadding - x;
            } else if (x > width - edgePadding) {
                direction = 1;
                overflow = x - (width - edgePadding);
            }
            if (direction === 0 || overflow <= 0) return;
            const intensity = Math.min(1, overflow / edgePadding);
            const baseShift = Math.max(1, Math.round(range * 0.02));
            const shift = Math.max(1, Math.round(baseShift * intensity));
            const newStart = viewState.startTick + direction * shift;
            const newEnd = viewState.endTick + direction * shift;
            setTimelineViewTicks(newStart, newEnd);
        },
        [setTimelineViewTicks, width]
    );

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current) return;
        // Handle drag scrubbing when type === 'seek' and not near braces
        if (dragState.current.type === 'seek') {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            autoPanWhileSeeking(x);
            const cand = toTick(x, width);
            const snapped = snapTicks(cand, { altKey: e.altKey, forceBar: e.shiftKey });
            setCurrentTick(snapped);
            return;
        }
        // Else handle brace drag
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const cand = toTick(x, width);
        // Track live modifier keys: Alt/Shift
        const alt = !!(e.altKey || dragState.current.alt);
        const forceBar = !!e.shiftKey;
        const snapped = snapTicks(cand, { altKey: alt, forceBar });
        const d = dragState.current;
        if (d.type === 'play-start') {
            const newStart = Math.max(0, snapped);
            const newEnd = typeof d.endSec === 'number' ? Math.max(newStart + 1, d.endSec) : d.endSec;
            useTimelineStore.getState().setPlaybackRangeExplicitTicks(newStart, newEnd as number | undefined);
        } else if (d.type === 'play-end') {
            const newEnd = Math.max(1, snapped);
            const newStart = typeof d.startSec === 'number' ? Math.min(d.startSec, newEnd - 1) : d.startSec;
            useTimelineStore.getState().setPlaybackRangeExplicitTicks(newStart as number | undefined, newEnd);
        }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current) return;
        dragState.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { }
    };

    const playheadX = toX(currentTick, width);
    const loopStartX = null;
    const loopEndX = null;
    const pr = useTimelineStore.getState().playbackRange;
    const playStart = pr?.startTick ?? view.startTick;
    const playEnd = pr?.endTick ?? view.endTick;
    const playStartX = toX(playStart, width);
    const playEndX = toX(playEnd, width);

    return (
        <div
            ref={containerRef}
            className="timeline-ruler relative select-none bg-neutral-900/40 border-y border-neutral-800"
            style={{ height, clipPath: 'border-box' }}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => { onPointerMove(e); onPointerMoveRoot(e); }}
            onPointerUp={onPointerUp}
            role="group"
            aria-label="Timeline ruler"
            title="Click to seek (Shift snaps to bar, Alt bypass). Drag braces to set playback range (Shift snaps to bar, Alt bypass)."
        >
            {/* Bar ticks and labels */}
            <svg className="absolute inset-0" width={width} height={height} aria-hidden>
                {beatTicks.map((t, i) => {
                    const x = toX(t.tick, width);
                    const col = t.isBar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
                    const h = t.isBar ? height : Math.floor(height * 0.6);
                    const y1 = t.isBar ? 0 : height - h;
                    return <line key={`tick-${i}`} x1={x} x2={x} y1={y1} y2={height} stroke={col} strokeWidth={1} />;
                })}
                {bars.map((b, i) => {
                    const x = toX(b.tick, width);
                    if (width / Math.max(1, bars.length) <= 24) return null;
                    return (
                        <text key={`lbl-${i}`} x={x + 4} y={16} fill="#ddd" fontSize={11}>
                            {b.barIdx}
                        </text>
                    );
                })}
            </svg>

            {/* Loop UI removed for now */}

            {/* Playback range tint + yellow markers (always visible) */}
            {playEnd > playStart && (
                <>
                    <div
                        className="absolute top-0 bottom-0 bg-yellow-400/10 pointer-events-none"
                        style={{ left: playStartX, width: Math.max(0, playEndX - playStartX) }}
                    />
                    <div className="absolute top-0 bottom-0 w-0 border-l-2 border-yellow-400" style={{ left: playStartX }} aria-hidden />
                    <div className="absolute top-0 bottom-0 w-0 border-l-2 border-yellow-400" style={{ left: playEndX }} aria-hidden />
                </>
            )}

            {/* Playhead */}
            <div
                className="absolute top-0 bottom-0 w-0 border-l border-red-400 pointer-events-none"
                style={{ left: playheadX }}
                aria-hidden
            />
        </div>
    );
};

export default TimelineRuler;
