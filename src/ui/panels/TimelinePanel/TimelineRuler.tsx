import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { barsToSeconds, secondsToBars } from '@state/selectors/timing';
import { RULER_HEIGHT } from './constants';
import { useTimeScale } from './useTimeScale';

// Use shared time scale

function useSnapSeconds() {
    const quantize = useTimelineStore((s) => s.transport.quantize);
    return useCallback(
        (candidateSec: number, opts?: { altKey?: boolean; forceBar?: boolean }) => {
            const { altKey, forceBar } = opts || {};
            if (altKey) return Math.max(0, candidateSec);
            const shouldSnap = forceBar || quantize === 'bar';
            if (!shouldSnap) return Math.max(0, candidateSec);
            const state = useTimelineStore.getState();
            const bars = secondsToBars(state, candidateSec);
            const snappedBars = Math.round(bars);
            return barsToSeconds(state, snappedBars);
        },
        [quantize]
    );
}

const BRACE_HIT_W = 8;

const TimelineRuler: React.FC = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const height = RULER_HEIGHT;
    const currentTimeSec = useTimelineStore((s) => s.timeline.currentTimeSec);
    const { view, toSeconds, toX } = useTimeScale();
    const seek = useTimelineStore((s) => s.seek);
    const setCurrentTimeSec = useTimelineStore((s) => s.setCurrentTimeSec);
    // Loop UI disabled: keep state wired for compatibility, but do not render or edit loop braces
    const { loopEnabled, loopStartSec, loopEndSec } = useTimelineStore((s) => s.transport);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const setPlaybackRange = useTimelineStore((s) => s.setPlaybackRange);
    const snapSeconds = useSnapSeconds();

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
        const s = useTimelineStore.getState();
        const startBars = Math.floor(secondsToBars(s, Math.max(0, view.startSec - 0.001)) - 1e-6) - 1;
        const endBars = Math.ceil(secondsToBars(s, view.endSec + 0.001) + 1e-6) + 1;
        const items: Array<{ barIdx: number; sec: number }> = [];
        for (let b = Math.max(0, startBars); b <= Math.max(startBars, endBars); b++) {
            const sec = barsToSeconds(s, b);
            items.push({ barIdx: b, sec });
        }
        return items;
    }, [view.startSec, view.endSec]);

    // Optionally compute beat ticks if there's enough room per bar
    const beatTicks = useMemo(() => {
        const s = useTimelineStore.getState();
        const bpb = s.timeline.beatsPerBar || 4;
        if (!width || bars.length < 2) return [] as Array<{ sec: number; isBar: boolean }>;
        // estimate px per bar using first two bars
        const pxPerBar = Math.abs(toX(bars[1].sec, width) - toX(bars[0].sec, width));
        const showBeats = pxPerBar > 48; // threshold: only show beats when bars are wide enough
        const ticks: Array<{ sec: number; isBar: boolean }> = [];
        for (let i = 0; i < bars.length; i++) {
            const b = bars[i];
            // bar line
            ticks.push({ sec: b.sec, isBar: true });
            if (showBeats) {
                for (let beat = 1; beat < bpb; beat++) {
                    const sec = barsToSeconds(s, b.barIdx + beat / bpb);
                    ticks.push({ sec, isBar: false });
                }
            }
        }
        return ticks;
    }, [bars, width, toX]);

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
        const tSec = toSeconds(x, width);
        const loopStartX = typeof loopStartSec === 'number' ? toX(loopStartSec, width) : null;
        const loopEndX = typeof loopEndSec === 'number' ? toX(loopEndSec, width) : null;
        const playStart = typeof playbackRange?.startSec === 'number' ? (playbackRange!.startSec as number) : view.startSec;
        const playEnd = typeof playbackRange?.endSec === 'number' ? (playbackRange!.endSec as number) : view.endSec;
        const playStartX = toX(playStart, width);
        const playEndX = toX(playEnd, width);

        let type: 'seek' | 'play-start' | 'play-end' = 'seek';
        if (Math.abs(x - playStartX) <= BRACE_HIT_W) type = 'play-start';
        else if (Math.abs(x - playEndX) <= BRACE_HIT_W) type = 'play-end';

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragState.current = {
            type,
            originX: x,
            originSec: tSec,
            startSec: playStart,
            endSec: playEnd,
            alt: !!e.altKey,
        };

        if (type === 'seek') {
            // Initial seek
            const snapped = snapSeconds(tSec, { altKey: e.altKey, forceBar: e.shiftKey });
            if (e.altKey) setCurrentTimeSec(snapped); else seek(snapped);
        }
    };

    // Change cursor when hovering over draggable braces
    const onPointerMoveRoot = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        // If actively dragging brace, keep default (handled elsewhere)
        if (dragState.current && dragState.current.type !== 'seek') return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const playStart = typeof playbackRange?.startSec === 'number' ? (playbackRange!.startSec as number) : view.startSec;
        const playEnd = typeof playbackRange?.endSec === 'number' ? (playbackRange!.endSec as number) : view.endSec;
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

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current) return;
        // Handle drag scrubbing when type === 'seek' and not near braces
        if (dragState.current.type === 'seek') {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const cand = toSeconds(x, width);
            const snapped = snapSeconds(cand, { altKey: e.altKey, forceBar: e.shiftKey });
            // During drag we set currentTime directly (no quantize jump) for smoothness
            setCurrentTimeSec(snapped);
            return;
        }
        // Else handle brace drag
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const cand = toSeconds(x, width);
        // Track live modifier keys: Alt/Shift
        const alt = !!(e.altKey || dragState.current.alt);
        const forceBar = !!e.shiftKey;
        const snapped = snapSeconds(cand, { altKey: alt, forceBar });
        const d = dragState.current;
        if (d.type === 'play-start') {
            const newStart = Math.max(0, snapped);
            const newEnd = typeof d.endSec === 'number' ? Math.max(newStart + 0.0001, d.endSec) : d.endSec;
            setPlaybackRange(newStart, newEnd);
        } else if (d.type === 'play-end') {
            const newEnd = Math.max(0.0001, snapped);
            const newStart = typeof d.startSec === 'number' ? Math.min(d.startSec, newEnd - 0.0001) : d.startSec;
            setPlaybackRange(newStart, newEnd);
        }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current) return;
        dragState.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { }
    };

    const playheadX = toX(currentTimeSec, width);
    const loopStartX = null;
    const loopEndX = null;
    const playStart = typeof playbackRange?.startSec === 'number' ? (playbackRange!.startSec as number) : view.startSec;
    const playEnd = typeof playbackRange?.endSec === 'number' ? (playbackRange!.endSec as number) : view.endSec;
    const playStartX = toX(playStart, width);
    const playEndX = toX(playEnd, width);

    return (
        <div
            ref={containerRef}
            className="timeline-ruler relative select-none bg-neutral-900/40 border-y border-neutral-800"
            style={{ height }}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => { onPointerMove(e); onPointerMoveRoot(e); }}
            onPointerUp={onPointerUp}
            role="group"
            aria-label="Timeline ruler"
            title="Click to seek (Shift snaps to bar, Alt bypass). Drag braces to set loop (Shift snaps to bar, Alt bypass)."
        >
            {/* Bar ticks and labels */}
            <svg className="absolute inset-0" width={width} height={height} aria-hidden>
                {beatTicks.map((t, i) => {
                    const x = toX(t.sec, width);
                    const col = t.isBar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
                    const h = t.isBar ? height : Math.floor(height * 0.6);
                    const y1 = t.isBar ? 0 : height - h;
                    return <line key={`tick-${i}`} x1={x} x2={x} y1={y1} y2={height} stroke={col} strokeWidth={1} />;
                })}
                {bars.map((b, i) => {
                    const x = toX(b.sec, width);
                    // Label bars when there's room
                    if (width / Math.max(1, bars.length) <= 24) return null;
                    return (
                        <text key={`lbl-${i}`} x={x + 4} y={16} fill="#ddd" fontSize={11}>
                            {b.barIdx + 1}
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
