import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { barsToSeconds, secondsToBars, secondsToBeatsSelector } from '@state/selectors/timing';
import { useTimeScale } from './useTimeScale';

type Props = {
    trackIds: string[];
};

// Utility to convert px <-> seconds using current view and container width
// useTimeScale imported

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
        const setTrackOffsetBeats = useTimelineStore((s) => s.setTrackOffsetBeats);
        const setTrackRegion = useTimelineStore((s) => s.setTrackRegion);
        const selectTracks = useTimelineStore((s) => s.selectTracks);
        const midiCacheEntry = useTimelineStore((s) => s.midiCache[(s.tracks[trackId]?.midiSourceId) ?? trackId]);
        const bpb = useTimelineStore((s) => s.timeline.beatsPerBar);
        const { view, toX } = useTimeScale();
        const snapSeconds = useSnapSeconds();

        const [dragging, setDragging] = useState(false);
        const [dragSec, setDragSec] = useState<number | null>(null);
        const startRef = useRef<{ startX: number; baseOffset: number; alt: boolean } | null>(null);
        const [resizing, setResizing] = useState<null | { type: 'left' | 'right'; startX: number; baseStart: number; baseEnd: number; alt: boolean }>(null);
        const [didMove, setDidMove] = useState(false);
        const isSelected = useTimelineStore((s) => s.selection.selectedTrackIds.includes(trackId));
        const quantize = useTimelineStore((s) => s.transport.quantize);

        // Compute local clip extent from cached MIDI and optional region trimming
        const { localStartSec, localEndSec } = useMemo(() => {
            let start = 0;
            let end = 0;
            const notes = midiCacheEntry?.notesRaw || [];
            if (notes.length > 0) {
                start = notes.reduce((m, n) => Math.min(m, n.startTime || 0), Number.POSITIVE_INFINITY);
                if (!isFinite(start)) start = 0;
                end = notes.reduce((m, n) => Math.max(m, n.endTime || 0), 0);
            }
            // Apply region trimming if present
            if (typeof track?.regionStartSec === 'number') start = Math.max(start, track.regionStartSec);
            if (typeof track?.regionEndSec === 'number') end = Math.min(end, track.regionEndSec);
            if (end < start) end = start;
            return { localStartSec: start, localEndSec: end };
        }, [midiCacheEntry, track?.regionStartSec, track?.regionEndSec]);

        const onPointerDown = (e: React.PointerEvent) => {
            if (!track) return;
            // Begin dragging the track block
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            startRef.current = { startX: e.clientX, baseOffset: track.offsetSec, alt: !!e.altKey };
            setDragging(true);
            setDidMove(false);
            onHoverSnapX(null);
        };
        const onPointerMove = (e: React.PointerEvent) => {
            if (resizing) {
                // Handle resizing region start/end
                const dx = e.clientX - resizing.startX;
                const deltaSec = (dx / Math.max(1, laneWidth)) * (view.endSec - view.startSec);
                const candidateAbs = Math.max(0, (track?.offsetSec || 0) + (resizing.type === 'left' ? resizing.baseStart : resizing.baseEnd) + deltaSec);
                const snappedAbs = snapSeconds(candidateAbs, e.altKey, false);
                const absOffset = track?.offsetSec || 0;
                // Clamp to MIDI content bounds (absolute)
                const notes = midiCacheEntry?.notesRaw || [];
                const rawMin = notes.length ? notes.reduce((m, n) => Math.min(m, n.startTime || 0), Number.POSITIVE_INFINITY) : 0;
                const rawMax = notes.length ? notes.reduce((m, n) => Math.max(m, n.endTime || 0), 0) : 0;
                const minAbs = absOffset + Math.max(0, rawMin);
                const maxAbs = absOffset + Math.max(minAbs, rawMax);
                const clampedAbs = Math.min(Math.max(snappedAbs, minAbs), maxAbs);
                const newLocal = Math.max(0, clampedAbs - absOffset);
                if (resizing.type === 'left') {
                    const newStart = Math.min(newLocal, (track?.regionEndSec ?? localEndSec));
                    setTrackRegion(trackId, newStart, track?.regionEndSec);
                } else {
                    const minRight = (track?.regionStartSec ?? localStartSec) + 0.0001;
                    const newEnd = Math.max(newLocal, minRight);
                    setTrackRegion(trackId, track?.regionStartSec, newEnd);
                }
                setDidMove(true);
                return;
            }
            if (!dragging || !startRef.current) return;
            const dx = e.clientX - startRef.current.startX;
            const deltaSec = (dx / Math.max(1, laneWidth)) * (view.endSec - view.startSec);
            const cand = Math.max(0, startRef.current.baseOffset + deltaSec);
            const snapped = snapSeconds(cand, e.altKey, false);
            setDragSec(snapped);
            onHoverSnapX(toX(snapped, laneWidth));
            if (Math.abs(dx) > 2) setDidMove(true);
        };
        const onPointerUp = (e: React.PointerEvent) => {
            if (resizing) {
                setResizing(null);
                try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
                return;
            }
            if (!dragging) return;
            setDragging(false);
            const finalSec = Math.max(0, dragSec != null ? dragSec : (track?.offsetSec || 0));
            // Convert to beats for storage
            const state = useTimelineStore.getState();
            const beats = secondsToBeatsSelector(state, finalSec);
            setTrackOffsetBeats(trackId, beats);
            setDragSec(null);
            onHoverSnapX(null);
            // Click selection when not moved
            if (!didMove) selectTracks([trackId]);
        };

        // Resizer handlers
        const onResizeDown = (e: React.PointerEvent, which: 'left' | 'right') => {
            e.stopPropagation();
            if (!track) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const baseStart = track.regionStartSec ?? localStartSec;
            const baseEnd = track.regionEndSec ?? localEndSec;
            setResizing({ type: which, startX: e.clientX, baseStart, baseEnd, alt: !!e.altKey });
        };

        const offsetSec = dragSec != null ? dragSec : track?.offsetSec || 0;
        const leftX = toX(Math.max(0, offsetSec + localStartSec), laneWidth);
        const rightX = toX(Math.max(0, offsetSec + localEndSec), laneWidth);
        const widthPx = Math.max(8, rightX - leftX); // minimal visible width when empty or very small

        // Label: show offset as +bars|beats
        const offsetBeats = useMemo(() => {
            if (!track) return 0;
            if (dragSec != null) {
                const st = useTimelineStore.getState();
                return secondsToBeatsSelector(st, dragSec);
            }
            return typeof (track as any).offsetBeats === 'number'
                ? (track as any).offsetBeats as number
                : secondsToBeatsSelector(useTimelineStore.getState(), track.offsetSec || 0);
        }, [track, dragSec]);
        const beatsPerBar = Math.max(1, bpb);
        const wholeBeats = Math.floor(offsetBeats + 1e-9);
        const barsDisplay = Math.floor(wholeBeats / beatsPerBar);
        const beatInBarDisplay = (wholeBeats % beatsPerBar) + 1; // 1-based beat index like DAWs
        const label = `+${barsDisplay}|${beatInBarDisplay}`;

        // Tooltip: include absolute time and bar|beat at start/end
        const tooltip = useMemo(() => {
            const st = useTimelineStore.getState();
            const absStart = Math.max(0, offsetSec + localStartSec);
            const absEnd = Math.max(absStart, offsetSec + localEndSec);
            const barsStart = secondsToBars(st, absStart);
            const barsEnd = secondsToBars(st, absEnd);
            const fmt = (s: number) => `${s.toFixed(2)}s`;
            const fmtBar = (b: number) => {
                const bb = Math.max(0, b);
                const barIdx = Math.floor(bb) + 1;
                const beatInBar = Math.floor((bb % 1) * (bpb || 4)) + 1;
                return `${barIdx}|${beatInBar}`;
            };
            const snapInfo = `Snap: ${quantize === 'bar' ? 'Bar' : 'Off'} (hold Alt to bypass)`;
            return `Track: ${track?.name}\n${snapInfo}\nOffset ${label}\nStart ${fmt(absStart)} (${fmtBar(barsStart)})\nEnd ${fmt(absEnd)} (${fmtBar(barsEnd)})`;
        }, [offsetSec, localStartSec, localEndSec, label, bpb, track?.name, quantize]);

        return (
            <div className="relative h-full"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                {/* Track clip rectangle (width reflects clip length) */}
                <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] text-white cursor-grab active:cursor-grabbing select-none ${isSelected ? 'bg-blue-500/60 border border-blue-300/80' : 'bg-blue-500/40 border border-blue-400/60'}`}
                    style={{ left: Math.max(0, leftX), width: widthPx, height: Math.max(18, laneHeight * 0.6) }}
                    title={tooltip}
                    onPointerDown={onPointerDown}
                    data-clip="1"
                >
                    {track?.name}{' '}
                    <span className="opacity-80">{label}</span>
                    {(midiCacheEntry?.notesRaw?.length ?? 0) === 0 && (
                        <span className="ml-2 text-[10px] opacity-70">No data</span>
                    )}

                    {/* Resize handles */}
                    <div
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
                        onPointerDown={(e) => onResizeDown(e, 'left')}
                        title="Resize start (Shift snaps to bars, Alt bypass)"
                    />
                    <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                        onPointerDown={(e) => onResizeDown(e, 'right')}
                        title="Resize end (Shift snaps to bars, Alt bypass)"
                    />
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
    const selectTracks = useTimelineStore((s) => s.selectTracks);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const midiCache = useTimelineStore((s) => s.midiCache);

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

    const rowHeight = 30;
    const lanesHeight = Math.max(rowHeight * Math.max(1, trackIds.length), 120);
    const playheadX = toX(currentTimeSec, Math.max(1, width));

    // Compute display pad to extend beyond view for readability (keep in sync with useTimeScale)
    const rawRange = Math.max(0.001, view.endSec - view.startSec);
    const pad = Math.max(0.2, rawRange * 0.02);
    const dispStart = view.startSec - pad;
    const dispEnd = view.endSec + pad;

    // Selection marquee state
    const marqueeRef = useRef<null | { startX: number; currentX: number; active: boolean }>(null);
    const [marquee, setMarquee] = useState<null | { x1: number; x2: number }>(null);

    const onBackgroundPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.button !== 0) return; // left click only for marquee
        if (!containerRef.current) return;
        // Ignore clicks that start on a clip (so clip dragging works)
        const target = e.target as HTMLElement;
        if (target && target.closest('[data-clip="1"]')) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        marqueeRef.current = { startX: x, currentX: x, active: true };
        setMarquee({ x1: x, x2: x });
    };
    const onBackgroundPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const m = marqueeRef.current;
        if (!m?.active || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        m.currentX = e.clientX - rect.left;
        setMarquee({ x1: m.startX, x2: m.currentX });
    };
    const onBackgroundPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const m = marqueeRef.current;
        marqueeRef.current = null;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
        if (!m || !containerRef.current) {
            setMarquee(null);
            return;
        }
        const x1 = Math.min(m.startX, m.currentX);
        const x2 = Math.max(m.startX, m.currentX);
        // Select tracks whose clip intersects [x1,x2]
        const selected: string[] = [];
        for (const id of trackIds) {
            const t = tracksMap[id];
            if (!t) continue;
            const cacheKey = t.midiSourceId ?? id;
            const cache = midiCache[cacheKey];
            const notes = cache?.notesRaw || [];
            if (notes.length === 0) continue;
            const rawStart = notes.reduce((m, n) => Math.min(m, n.startTime || 0), Number.POSITIVE_INFINITY);
            const rawEnd = notes.reduce((m, n) => Math.max(m, n.endTime || 0), 0);
            const regionStart = typeof t.regionStartSec === 'number' ? Math.max(rawStart, t.regionStartSec) : rawStart;
            const regionEnd = typeof t.regionEndSec === 'number' ? Math.min(rawEnd, t.regionEndSec) : rawEnd;
            const absStart = Math.max(0, (t.offsetSec || 0) + Math.max(0, regionStart));
            const absEnd = Math.max(absStart, (t.offsetSec || 0) + Math.max(0, regionEnd));
            const clipL = toX(absStart, Math.max(1, width));
            const clipR = toX(absEnd, Math.max(1, width));
            const intersects = !(clipR < x1 || clipL > x2);
            if (intersects) selected.push(id);
        }
        if (Math.abs(x2 - x1) < 3) {
            // Tiny drag: clear selection
            selectTracks([]);
        } else {
            selectTracks(selected);
        }
        setMarquee(null);
    };

    return (
        <div className="timeline-lanes relative border-t border-neutral-800 bg-neutral-900/40"
            ref={containerRef}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onBackgroundPointerMove}
            onPointerUp={onBackgroundPointerUp}
            style={{ height: lanesHeight, width: '100%' }}
        >
            {/* Grid */}
            <GridLines width={width} height={lanesHeight} startSec={dispStart} endSec={dispEnd} />

            {/* Hover snapped line for DnD and dragging */}
            {hoverX != null && (
                <div className="absolute top-0 bottom-0 border-l border-blue-300/70 pointer-events-none" style={{ left: hoverX }} />
            )}

            {/* Rows */}
            <div className="absolute inset-0">
                {trackIds.map((id, idx) => (
                    <div
                        key={id}
                        className={`relative ${idx % 2 === 0 ? 'bg-neutral-800/15' : 'bg-neutral-800/5'}`}
                        style={{ height: rowHeight }}
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

            {/* Marquee selection overlay */}
            {marquee && (
                <div
                    className="absolute top-0 bottom-0 bg-blue-400/10 border-x border-blue-400 pointer-events-none"
                    style={{ left: Math.min(marquee.x1, marquee.x2), width: Math.abs(marquee.x2 - marquee.x1) }}
                />
            )}
        </div>
    );
};

export default TrackLanes;
