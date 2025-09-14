import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from './useTickScale';

type Props = {
    trackIds: string[];
};

// Tick-domain snapping (Phase 5): bar snap when quantize==='bar' or forceSnap.
function useSnapTicks() {
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const ppq = CANONICAL_PPQ; // unified PPQ
    return useCallback((candidateTick: number, altKey?: boolean, forceSnap?: boolean) => {
        if (altKey) return Math.max(0, Math.round(candidateTick));
        const should = forceSnap || quantize === 'bar';
        if (!should) return Math.max(0, Math.round(candidateTick));
        const ticksPerBar = bpb * ppq;
        return Math.max(0, Math.round(candidateTick / ticksPerBar) * ticksPerBar);
    }, [quantize, bpb, ppq]);
}

const GridLines: React.FC<{ width: number; height: number } & { startTick: number; endTick: number }> = ({ width, height, startTick, endTick }) => {
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const ppq = CANONICAL_PPQ; // unified PPQ
    const { toX } = useTickScale();
    const ticksPerBar = bpb * ppq;
    const lines = useMemo(() => {
        const firstBar = Math.max(0, Math.floor(startTick / ticksPerBar) - 1);
        const lastBar = Math.floor(endTick / ticksPerBar) + 1;
        const arr: Array<{ tick: number; isBar: boolean }> = [];
        for (let bar = firstBar; bar <= lastBar; bar++) {
            for (let beat = 0; beat < bpb; beat++) {
                const tick = bar * ticksPerBar + beat * ppq; // beat boundary
                if (tick < startTick - ppq || tick > endTick + ppq) continue;
                arr.push({ tick, isBar: beat === 0 });
            }
        }
        return arr;
    }, [startTick, endTick, ticksPerBar, bpb, ppq]);
    return (
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden>
            {lines.map((g, i) => {
                const x = toX(g.tick, width);
                const col = g.isBar ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
                return <line key={i} x1={x} x2={x} y1={0} y2={height} stroke={col} strokeWidth={1} />;
            })}
        </svg>
    );
};

const TrackRowBlock: React.FC<{ trackId: string; laneWidth: number; laneHeight: number; onHoverSnapX: (x: number | null) => void }>
    = ({ trackId, laneWidth, laneHeight, onHoverSnapX }) => {
        const track = useTimelineStore((s) => s.tracks[trackId]);
        const setTrackOffsetTicks = useTimelineStore((s) => s.setTrackOffsetTicks);
        const setTrackRegionTicks = useTimelineStore((s) => s.setTrackRegionTicks);
        const selectTracks = useTimelineStore((s) => s.selectTracks);
        const midiCacheEntry = useTimelineStore((s) => s.midiCache[(s.tracks[trackId]?.midiSourceId) ?? trackId]);
        const bpb = useTimelineStore((s) => s.timeline.beatsPerBar);
        const ppq = CANONICAL_PPQ; // unified PPQ
        const { view, toX } = useTickScale();
        const snapTicks = useSnapTicks();

        const [dragging, setDragging] = useState(false);
        const [dragTick, setDragTick] = useState<number | null>(null);
        const startRef = useRef<{ startX: number; baseOffsetTick: number; alt: boolean } | null>(null);
        const [resizing, setResizing] = useState<null | { type: 'left' | 'right'; startX: number; baseStart: number; baseEnd: number; alt: boolean }>(null);
        const [didMove, setDidMove] = useState(false);
        const isSelected = useTimelineStore((s) => s.selection.selectedTrackIds.includes(trackId));
        const quantize = useTimelineStore((s) => s.transport.quantize);

        // Compute local clip extent from cached MIDI and optional region trimming
        const { localStartTick, localEndTick } = useMemo(() => {
            let start = 0;
            let end = 0;
            const notes = midiCacheEntry?.notesRaw || [];
            if (notes.length > 0) {
                start = notes.reduce((m, n) => Math.min(m, n.startBeat != null ? Math.round(n.startBeat * ppq) : m), Number.POSITIVE_INFINITY);
                if (!isFinite(start)) start = 0;
                end = notes.reduce((m, n) => Math.max(m, n.endBeat != null ? Math.round(n.endBeat * ppq) : m), 0);
            }
            if (typeof track?.regionStartTick === 'number') start = Math.max(start, track.regionStartTick);
            if (typeof track?.regionEndTick === 'number') end = Math.min(end, track.regionEndTick);
            if (end < start) end = start;
            return { localStartTick: start, localEndTick: end };
        }, [midiCacheEntry, track?.regionStartTick, track?.regionEndTick, ppq]);

        const onPointerDown = (e: React.PointerEvent) => {
            if (!track) return;
            // Begin dragging the track block
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            startRef.current = { startX: e.clientX, baseOffsetTick: track?.offsetTicks || 0, alt: !!e.altKey };
            setDragging(true);
            setDidMove(false);
            onHoverSnapX(null);
        };
        const onPointerMove = (e: React.PointerEvent) => {
            if (resizing) {
                const dx = e.clientX - resizing.startX;
                const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
                const candidateAbs = Math.max(0, (track?.offsetTicks || 0) + (resizing.type === 'left' ? resizing.baseStart : resizing.baseEnd) + deltaTicks);
                const snappedAbs = snapTicks(candidateAbs, e.altKey, false);
                const absOffset = track?.offsetTicks || 0;
                const notes = midiCacheEntry?.notesRaw || [];
                const rawMin = notes.length ? notes.reduce((m, n) => Math.min(m, n.startBeat != null ? Math.round(n.startBeat * ppq) : m), Number.POSITIVE_INFINITY) : 0;
                const rawMax = notes.length ? notes.reduce((m, n) => Math.max(m, n.endBeat != null ? Math.round(n.endBeat * ppq) : m), 0) : 0;
                const minAbs = absOffset + Math.max(0, rawMin);
                const maxAbs = absOffset + Math.max(minAbs, rawMax);
                const clampedAbs = Math.min(Math.max(snappedAbs, minAbs), maxAbs);
                const newLocal = Math.max(0, clampedAbs - absOffset);
                if (resizing.type === 'left') {
                    const newStart = Math.min(newLocal, (track?.regionEndTick ?? localEndTick));
                    setTrackRegionTicks(trackId, newStart, track?.regionEndTick);
                } else {
                    const minRight = (track?.regionStartTick ?? localStartTick) + 1;
                    const newEnd = Math.max(newLocal, minRight);
                    setTrackRegionTicks(trackId, track?.regionStartTick, newEnd);
                }
                setDidMove(true);
                return;
            }
            if (!dragging || !startRef.current) return;
            const dx = e.clientX - startRef.current.startX;
            const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
            const cand = Math.max(0, startRef.current.baseOffsetTick + deltaTicks);
            const snapped = snapTicks(cand, e.altKey, false);
            setDragTick(snapped);
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
            const finalTick = Math.max(0, dragTick != null ? dragTick : (track?.offsetTicks || 0));
            setTrackOffsetTicks(trackId, finalTick);
            setDragTick(null);
            onHoverSnapX(null);
            // Click selection when not moved
            if (!didMove) selectTracks([trackId]);
        };

        // Resizer handlers
        const onResizeDown = (e: React.PointerEvent, which: 'left' | 'right') => {
            e.stopPropagation();
            if (!track) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const baseStart = track.regionStartTick ?? localStartTick;
            const baseEnd = track.regionEndTick ?? localEndTick;
            setResizing({ type: which, startX: e.clientX, baseStart, baseEnd, alt: !!e.altKey });
        };
        const offsetTick = dragTick != null ? dragTick : (track?.offsetTicks || 0);
        const absStartTick = Math.max(0, offsetTick + localStartTick);
        const absEndTick = Math.max(absStartTick, offsetTick + localEndTick);
        const visStart = view.startTick;
        const visEnd = view.endTick;
        const clippedStartTick = Math.max(absStartTick, visStart);
        const clippedEndTick = Math.max(clippedStartTick, Math.min(absEndTick, visEnd));
        const leftX = toX(clippedStartTick, laneWidth);
        const rightX = toX(clippedEndTick, laneWidth);
        const widthPx = Math.max(0, rightX - leftX);
        const isClippedLeft = absStartTick < visStart;
        const isClippedRight = absEndTick > visEnd;
        const offsetBeats = useMemo(() => {
            if (!track) return 0;
            return (dragTick != null ? dragTick : (track.offsetTicks || 0)) / ppq;
        }, [track, dragTick, ppq]);
        const beatsPerBar = Math.max(1, bpb);
        const wholeBeats = Math.floor(offsetBeats + 1e-9);
        const barsDisplay = Math.floor(wholeBeats / beatsPerBar);
        const beatInBarDisplay = (wholeBeats % beatsPerBar) + 1; // 1-based beat index like DAWs
        const label = `+${barsDisplay}|${beatInBarDisplay}`;
        const tooltip = useMemo(() => {
            const st = useTimelineStore.getState();
            const bpm = st.timeline.globalBpm || 120;
            const secPerBeat = 60 / bpm;
            const ticksToSec = (t: number) => (t / ppq) * secPerBeat;
            const absStartRealTick = Math.max(0, offsetTick + localStartTick);
            const absEndRealTick = Math.max(absStartRealTick, offsetTick + localEndTick);
            const absStartSec = ticksToSec(absStartRealTick);
            const absEndSec = ticksToSec(absEndRealTick);
            const barsStart = absStartRealTick / (ppq * bpb);
            const barsEnd = absEndRealTick / (ppq * bpb);
            const fmt = (s: number) => `${s.toFixed(2)}s`;
            const fmtBar = (b: number) => {
                const bb = Math.max(0, b);
                const barIdx = Math.floor(bb) + 1;
                const beatInBar = Math.floor((bb % 1) * (bpb || 4)) + 1;
                return `${barIdx}|${beatInBar}`;
            };
            const snapInfo = `Snap: ${quantize === 'bar' ? 'Bar' : 'Off'} (hold Alt to bypass)`;
            const clipInfo: string[] = [];
            if (absStartRealTick < visStart) clipInfo.push('Start clipped by view');
            if (absEndRealTick > visEnd) clipInfo.push('End clipped by view');
            const clipLine = clipInfo.length ? `\n${clipInfo.join('; ')}` : '';
            return `Track: ${track?.name}\n${snapInfo}\nOffset ${label}\nStart ${fmt(absStartSec)} (${fmtBar(barsStart)})\nEnd ${fmt(absEndSec)} (${fmtBar(barsEnd)})${clipLine}`;
        }, [offsetTick, localStartTick, localEndTick, label, bpb, track?.name, quantize, visStart, visEnd, ppq]);

        return (
            <div className="relative h-full"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                {/* Track clip rectangle (width reflects clip length) */}
                {widthPx > 0 && (
                    <div
                        className={`absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] text-white cursor-grab active:cursor-grabbing select-none ${isSelected ? 'bg-blue-500/60 border border-blue-300/80' : 'bg-blue-500/40 border border-blue-400/60'}`}
                        style={{ left: Math.max(0, leftX), width: Math.max(8, widthPx), height: Math.max(18, laneHeight * 0.6) }}
                        title={tooltip}
                        onPointerDown={onPointerDown}
                        data-clip="1"
                    >
                        {/* Edge indicators: jagged mask when clipped, solid when fully visible */}
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-stretch">
                            {isClippedLeft ? (
                                <div className="relative h-full w-3 overflow-hidden">
                                    <svg className="absolute inset-0" preserveAspectRatio="none" viewBox="0 0 10 100" aria-hidden>
                                        <defs>
                                            <pattern id="zigL" width="4" height="8" patternUnits="userSpaceOnUse">
                                                <path d="M0 0 L4 4 L0 8 Z" fill="#1e3a8a" fillOpacity="0.55" />
                                            </pattern>
                                            <linearGradient id="fadeL" x1="0" x2="1" y1="0" y2="0">
                                                <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.85" />
                                                <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.35" />
                                                <stop offset="100%" stopColor="transparent" />
                                            </linearGradient>
                                        </defs>
                                        <rect x="0" y="0" width="10" height="100" fill="url(#fadeL)" />
                                        <rect x="0" y="0" width="6" height="100" fill="url(#zigL)" />
                                    </svg>
                                </div>
                            ) : (
                                <div className="w-[3px] h-full bg-white/60" />
                            )}
                        </div>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-stretch">
                            {isClippedRight ? (
                                <div className="relative h-full w-3 overflow-hidden">
                                    <svg className="absolute inset-0" preserveAspectRatio="none" viewBox="0 0 10 100" aria-hidden>
                                        <defs>
                                            <pattern id="zigR" width="4" height="8" patternUnits="userSpaceOnUse">
                                                <path d="M4 0 L0 4 L4 8 Z" fill="#1e3a8a" fillOpacity="0.55" />
                                            </pattern>
                                            <linearGradient id="fadeR" x1="1" x2="0" y1="0" y2="0">
                                                <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.85" />
                                                <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.35" />
                                                <stop offset="100%" stopColor="transparent" />
                                            </linearGradient>
                                        </defs>
                                        <rect x="0" y="0" width="10" height="100" fill="url(#fadeR)" />
                                        <rect x="4" y="0" width="6" height="100" fill="url(#zigR)" />
                                    </svg>
                                </div>
                            ) : (
                                <div className="w-[3px] h-full bg-white/60" />
                            )}
                        </div>
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
                )}
            </div>
        );
    };

const TrackLanes: React.FC<Props> = ({ trackIds }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const [hoverX, setHoverX] = useState<number | null>(null);
    const { view, toTick, toX } = useTickScale();
    const snapTicks = useSnapTicks();
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
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
        const candTick = toTick(x, width);
        const snapped = snapTicks(candTick, e.altKey, true);
        setHoverX(toX(snapped, width));
    };
    const onDragLeave = () => setHoverX(null);
    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const candTick = toTick(x, width);
        const snappedTick = snapTicks(candTick, e.altKey, true);

        const files = Array.from(e.dataTransfer.files || []);
        const midi = files.find((f) => /\.midi?$/.test(f.name.toLowerCase())) || files[0];
        if (midi) {
            await addMidiTrack({ name: midi.name.replace(/\.[^/.]+$/, ''), file: midi, offsetTicks: Math.max(0, snappedTick) });
        }
        setHoverX(null);
    };

    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const lanesHeight = Math.max(rowHeight * Math.max(1, trackIds.length), 120);
    const playheadX = toX(currentTick, Math.max(1, width));

    // Compute display pad to extend beyond view for readability (keep in sync with useTimeScale)
    const rawRange = Math.max(1, view.endTick - view.startTick);
    const pad = Math.max(1, Math.floor(rawRange * 0.01));
    const dispStart = view.startTick - pad;
    const dispEnd = view.endTick + pad;

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
        const ppq = CANONICAL_PPQ; // unified PPQ
        for (const id of trackIds) {
            const t = tracksMap[id];
            if (!t) continue;
            const cacheKey = t.midiSourceId ?? id;
            const cache = midiCache[cacheKey];
            const notes = cache?.notesRaw || [];
            if (notes.length === 0) continue;
            const rawStart = notes.reduce((m, n) => Math.min(m, n.startBeat != null ? Math.round(n.startBeat * ppq) : m), Number.POSITIVE_INFINITY);
            const rawEnd = notes.reduce((m, n) => Math.max(m, n.endBeat != null ? Math.round(n.endBeat * ppq) : m), 0);
            const regionStart = typeof t.regionStartTick === 'number' ? Math.max(rawStart, t.regionStartTick) : rawStart;
            const regionEnd = typeof t.regionEndTick === 'number' ? Math.min(rawEnd, t.regionEndTick) : rawEnd;
            const absStart = Math.max(0, (t.offsetTicks || 0) + Math.max(0, regionStart));
            const absEnd = Math.max(absStart, (t.offsetTicks || 0) + Math.max(0, regionEnd));
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
            <GridLines width={width} height={lanesHeight} startTick={dispStart} endTick={dispEnd} />

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
