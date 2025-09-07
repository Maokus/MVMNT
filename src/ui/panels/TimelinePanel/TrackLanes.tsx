import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { barsToSeconds, secondsToBars } from '@state/selectors/timing';

type Props = {
    trackIds: string[];
};

// Utility to convert px <-> seconds using current view and container width
function useTimeScale() {
    const view = useTimelineStore((s) => s.timelineView);
    const rangeSec = Math.max(0.001, view.endSec - view.startSec);
    const toSeconds = useCallback(
        (x: number, width: number) => view.startSec + (Math.min(Math.max(0, x), width) / Math.max(1, width)) * rangeSec,
        [view.startSec, rangeSec]
    );
    const toX = useCallback((sec: number, width: number) => {
        const t = (sec - view.startSec) / rangeSec;
        return t * Math.max(1, width);
    }, [view.startSec, rangeSec]);
    return { view, toSeconds, toX };
}

function useSnapSeconds() {
    // Default snapping to bars; Alt/Option bypasses; also consider global quantize setting
    const quantize = useTimelineStore((s) => s.transport.quantize);
    return useCallback((candidateSec: number, altKey?: boolean, forceSnap?: boolean) => {
        if (altKey) return Math.max(0, candidateSec);
        // Force snap is used for DnD of new files (always bar snap)
        const shouldSnap = forceSnap || quantize === 'bar';
        if (!shouldSnap) return Math.max(0, candidateSec);
        const state = useTimelineStore.getState();
        const bars = secondsToBars(state, candidateSec);
        const snappedBars = Math.round(bars);
        return barsToSeconds(state, snappedBars);
    }, [quantize]);
}

const GridLines: React.FC<{ width: number; height: number } & { startSec: number; endSec: number }> = ({ width, height, startSec, endSec }) => {
    const bpm = useTimelineStore((s) => s.timeline.globalBpm);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar);
    const tempoMap = useTimelineStore((s) => s.timeline.masterTempoMap);
    const { toX } = useTimeScale();

    // Build beat grid using seconds<->beats conversions via selectors
    const beats = useMemo(() => {
        const state = useTimelineStore.getState();
        const startBeats = Math.ceil(secondsToBars(state, startSec) * bpb - 1e-9); // convert to beat index space
        const endBeats = Math.floor(secondsToBars(state, endSec) * bpb + 1e-9);
        const arr: Array<{ time: number; isBar: boolean }> = [];
        for (let bi = startBeats; bi <= endBeats; bi++) {
            const barIdx = Math.floor(bi / bpb);
            const isBar = bi % bpb === 0;
            const sec = barsToSeconds(state, barIdx + (bi % bpb) / bpb);
            arr.push({ time: sec, isBar });
        }
        return arr;
    }, [startSec, endSec, bpb, bpm, tempoMap, toX]);

    return (
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden>
            {beats.map((g, i) => {
                const x = toX(g.time, width);
                const col = g.isBar ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
                const w = g.isBar ? 1.0 : 1.0;
                return <line key={i} x1={x} x2={x} y1={0} y2={height} stroke={col} strokeWidth={w} />;
            })}
        </svg>
    );
};

const TrackRowBlock: React.FC<{ trackId: string; laneWidth: number; laneHeight: number; onHoverSnapX: (x: number | null) => void }>
    = ({ trackId, laneWidth, laneHeight, onHoverSnapX }) => {
        const track = useTimelineStore((s) => s.tracks[trackId]);
        const setTrackOffset = useTimelineStore((s) => s.setTrackOffset);
        const { view, toSeconds, toX } = useTimeScale();
        const snapSeconds = useSnapSeconds();

        const [dragging, setDragging] = useState(false);
        const [dragSec, setDragSec] = useState<number | null>(null);
        const startRef = useRef<{ startX: number; baseOffset: number; alt: boolean } | null>(null);

        const onPointerDown = (e: React.PointerEvent) => {
            // Begin dragging the track block
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            startRef.current = { startX: e.clientX, baseOffset: track.offsetSec, alt: !!e.altKey };
            setDragging(true);
            onHoverSnapX(null);
        };
        const onPointerMove = (e: React.PointerEvent) => {
            if (!dragging || !startRef.current) return;
            const dx = e.clientX - startRef.current.startX;
            const deltaSec = (dx / Math.max(1, laneWidth)) * (view.endSec - view.startSec);
            const cand = Math.max(0, startRef.current.baseOffset + deltaSec);
            const snapped = snapSeconds(cand, e.altKey, true);
            setDragSec(snapped);
            onHoverSnapX(toX(snapped, laneWidth));
        };
        const onPointerUp = (e: React.PointerEvent) => {
            if (!dragging) return;
            setDragging(false);
            const final = dragSec != null ? dragSec : track.offsetSec;
            setTrackOffset(trackId, Math.max(0, final));
            setDragSec(null);
            onHoverSnapX(null);
        };

        const x = toX(dragSec != null ? dragSec : track.offsetSec, laneWidth);

        return (
            <div className="relative h-full"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                {/* Track block */}
                <div className="absolute top-1/2 -translate-y-1/2 bg-blue-500/50 border border-blue-300/70 rounded px-2 py-1 text-[11px] text-white cursor-grab active:cursor-grabbing select-none"
                    style={{ left: Math.max(0, x), width: 120, height: Math.max(18, laneHeight * 0.6) }}
                    title="Drag horizontally to change offset (Alt to bypass snapping)"
                >
                    {track.name}
                </div>
            </div>
        );
    };

const TrackLanes: React.FC<Props> = ({ trackIds }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const [hoverX, setHoverX] = useState<number | null>(null);
    const { view, toSeconds, toX } = useTimeScale();
    const snapSeconds = useSnapSeconds();
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const currentTimeSec = useTimelineStore((s) => s.timeline.currentTimeSec);

    // Resize observer to keep width/height up to date
    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const cr = entry.contentRect;
                setWidth(Math.max(1, Math.floor(cr.width)));
                setHeight(Math.max(1, Math.floor(cr.height)));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // DnD handlers for dropping MIDI files to create tracks at snapped positions
    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const candSec = toSeconds(x, width);
        const snapped = snapSeconds(candSec, e.altKey, true);
        setHoverX(toX(snapped, width));
    };
    const onDragLeave = () => setHoverX(null);
    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const candSec = toSeconds(x, width);
        const snappedSec = snapSeconds(candSec, e.altKey, true);

        const files = Array.from(e.dataTransfer.files || []);
        const midi = files.find((f) => /\.midi?$/.test(f.name.toLowerCase())) || files[0];
        if (midi) {
            await addMidiTrack({ name: midi.name.replace(/\.[^/.]+$/, ''), file: midi, offsetSec: Math.max(0, snappedSec) });
        }
        setHoverX(null);
    };

    const rowHeight = 36;
    const lanesHeight = Math.max(rowHeight * Math.max(1, trackIds.length), 120);
    const playheadX = toX(currentTimeSec, Math.max(1, width));

    return (
        <div className="timeline-lanes relative border-t border-neutral-800 bg-neutral-900/40"
            ref={containerRef}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            style={{ height: lanesHeight, width: '100%' }}
        >
            {/* Grid */}
            <GridLines width={width} height={lanesHeight} startSec={view.startSec} endSec={view.endSec} />

            {/* Hover snapped line for DnD and dragging */}
            {hoverX != null && (
                <div className="absolute top-0 bottom-0 border-l border-blue-300/70 pointer-events-none" style={{ left: hoverX }} />
            )}

            {/* Rows */}
            <div className="absolute inset-0">
                {trackIds.map((id, idx) => (
                    <div
                        key={id}
                        className={`relative ${idx % 2 === 0 ? 'bg-neutral-800/20' : 'bg-neutral-800/10'}`}
                        style={{ height: rowHeight, top: idx * rowHeight }}
                    >
                        {/* Horizontal separator */}
                        <div className="absolute left-0 right-0 bottom-0 border-b border-neutral-800" />
                        <TrackRowBlock trackId={id} laneWidth={width} laneHeight={rowHeight}
                            onHoverSnapX={(x) => setHoverX(x)}
                        />
                    </div>
                ))}
            </div>

            {/* Playhead overlay */}
            <div className="absolute top-0 bottom-0 w-0 border-l border-red-400 pointer-events-none" style={{ left: playheadX }} />
        </div>
    );
};

export default TrackLanes;
