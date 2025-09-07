import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { barsToSeconds, secondsToBars } from '@state/selectors/timing';

// Local scale utilities using the global timelineView
function useTimeScale() {
    const view = useTimelineStore((s) => s.timelineView);
    const rangeSec = Math.max(0.001, view.endSec - view.startSec);
    const toSeconds = useCallback(
        (x: number, width: number) => view.startSec + (Math.min(Math.max(0, x), width) / Math.max(1, width)) * rangeSec,
        [view.startSec, rangeSec]
    );
    const toX = useCallback(
        (sec: number, width: number) => {
            const t = (sec - view.startSec) / rangeSec;
            return t * Math.max(1, width);
        },
        [view.startSec, rangeSec]
    );
    return { view, toSeconds, toX };
}

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
    const height = 28;
    const currentTimeSec = useTimelineStore((s) => s.timeline.currentTimeSec);
    const { view, toSeconds, toX } = useTimeScale();
    const seek = useTimelineStore((s) => s.seek);
    const setCurrentTimeSec = useTimelineStore((s) => s.setCurrentTimeSec);
    const setLoopRange = useTimelineStore((s) => s.setLoopRange);
    const { loopEnabled, loopStartSec, loopEndSec } = useTimelineStore((s) => s.transport);
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

    // Build bar ticks for the visible range
    const bars = useMemo(() => {
        const s = useTimelineStore.getState();
        const startBars = Math.floor(secondsToBars(s, view.startSec) - 1e-6);
        const endBars = Math.ceil(secondsToBars(s, view.endSec) + 1e-6);
        const items: Array<{ barIdx: number; sec: number }> = [];
        for (let b = Math.max(0, startBars); b <= Math.max(startBars, endBars); b++) {
            const sec = barsToSeconds(s, b);
            items.push({ barIdx: b, sec });
        }
        return items;
    }, [view.startSec, view.endSec]);

    // Pointer interactions: click to seek, drag braces
    const dragState = useRef<
        | null
        | {
            type: 'seek' | 'brace-start' | 'brace-end';
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
        const startX = typeof loopStartSec === 'number' ? toX(loopStartSec, width) : null;
        const endX = typeof loopEndSec === 'number' ? toX(loopEndSec, width) : null;

        let type: 'seek' | 'brace-start' | 'brace-end' = 'seek';
        if (startX != null && Math.abs(x - startX) <= BRACE_HIT_W) type = 'brace-start';
        else if (endX != null && Math.abs(x - endX) <= BRACE_HIT_W) type = 'brace-end';

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragState.current = {
            type,
            originX: x,
            originSec: tSec,
            startSec: loopStartSec,
            endSec: loopEndSec,
            alt: !!e.altKey,
        };

        if (type === 'seek') {
            const snapped = snapSeconds(tSec, { altKey: e.altKey });
            if (e.altKey) setCurrentTimeSec(snapped);
            else seek(snapped);
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState.current || dragState.current.type === 'seek') return;
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const cand = toSeconds(x, width);
        const snapped = snapSeconds(cand, { altKey: dragState.current.alt });
        const d = dragState.current;
        if (d.type === 'brace-start') {
            const newStart = Math.max(0, snapped);
            const newEnd = typeof d.endSec === 'number' ? Math.max(newStart + 0.0001, d.endSec) : d.endSec;
            setLoopRange(newStart, newEnd);
        } else if (d.type === 'brace-end') {
            const newEnd = Math.max(0.0001, snapped);
            const newStart = typeof d.startSec === 'number' ? Math.min(d.startSec, newEnd - 0.0001) : d.startSec;
            setLoopRange(newStart, newEnd);
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
    const loopStartX = typeof loopStartSec === 'number' ? toX(loopStartSec, width) : null;
    const loopEndX = typeof loopEndSec === 'number' ? toX(loopEndSec, width) : null;

    return (
        <div
            ref={containerRef}
            className="timeline-ruler relative select-none bg-neutral-900/60 border-y border-neutral-800"
            style={{ height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            role="group"
            aria-label="Timeline ruler"
            title="Click to seek. Drag braces to set loop. Hold Alt to bypass snapping."
        >
            {/* Bar ticks and labels */}
            <svg className="absolute inset-0" width={width} height={height} aria-hidden>
                {bars.map((b, i) => {
                    const x = toX(b.sec, width);
                    return (
                        <g key={i}>
                            <line x1={x} x2={x} y1={0} y2={height} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
                            {/* Label every bar; avoid crowding by simple density check */}
                            {width / Math.max(1, bars.length) > 24 && (
                                <text x={x + 4} y={16} fill="#ddd" fontSize={11}>
                                    {b.barIdx + 1}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Loop region tint */}
            {loopEnabled && loopStartX != null && loopEndX != null && loopEndX > loopStartX && (
                <div
                    className="absolute top-0 bottom-0 bg-emerald-500/10 pointer-events-none"
                    style={{ left: loopStartX, width: Math.max(0, loopEndX - loopStartX) }}
                />
            )}

            {/* Braces */}
            {loopStartX != null && (
                <div
                    className="absolute top-0 bottom-0 w-0 border-l-2 border-emerald-400 cursor-ew-resize"
                    style={{ left: loopStartX }}
                    aria-label="Loop start"
                />
            )}
            {loopEndX != null && (
                <div
                    className="absolute top-0 bottom-0 w-0 border-l-2 border-emerald-400 cursor-ew-resize"
                    style={{ left: loopEndX }}
                    aria-label="Loop end"
                />
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
