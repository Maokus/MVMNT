import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from './useTickScale';
import AudioWaveform from '@workspace/components/AudioWaveform';
import MidiNotePreview from '@workspace/components/MidiNotePreview';
import { formatQuantizeShortLabel, quantizeSettingToBeats, type QuantizeSetting } from '@state/timeline/quantize';

type Props = {
    trackIds: string[];
};

// Tick-domain snapping: snap to selected denomination when quantize !== 'off', or forceSnap for bar snapping.
function useSnapTicks() {
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const ppq = CANONICAL_PPQ; // unified PPQ
    return useCallback((candidateTick: number, altKey?: boolean, forceSnap?: boolean, allowNegative = false) => {
        const clamp = (val: number) => {
            const rounded = Math.round(val);
            return allowNegative ? rounded : Math.max(0, rounded);
        };
        if (altKey) return clamp(candidateTick);
        const target: QuantizeSetting = forceSnap ? 'bar' : quantize;
        if (target === 'off') return clamp(candidateTick);
        const beatLength = quantizeSettingToBeats(target, bpb);
        if (!beatLength) return clamp(candidateTick);
        const resolution = Math.max(1, Math.round(beatLength * ppq));
        return clamp(Math.round(candidateTick / resolution) * resolution);
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
        const midiCacheEntry = useTimelineStore((s) => {
            const t: any = s.tracks[trackId];
            if (t && t.type === 'midi') {
                return s.midiCache[t.midiSourceId ?? trackId];
            }
            return undefined;
        });
        const audioCacheEntry = useTimelineStore((s) => s.audioCache[trackId]);
        const setTrackGain = useTimelineStore((s) => s.setTrackGain);
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
        const { dataStartTick, dataEndTick } = useMemo(() => {
            if (!track) return { dataStartTick: 0, dataEndTick: 0 };
            if (track.type === 'audio') {
                const duration = audioCacheEntry?.durationTicks ?? 0;
                const safeDuration = Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
                return { dataStartTick: 0, dataEndTick: safeDuration };
            }
            const notes = midiCacheEntry?.notesRaw || [];
            if (!notes.length) return { dataStartTick: 0, dataEndTick: 0 };
            let minTick = Number.POSITIVE_INFINITY;
            let maxTick = 0;
            for (const note of notes) {
                if (typeof note.startTick === 'number' && note.startTick < minTick) minTick = note.startTick;
                if (typeof note.endTick === 'number' && note.endTick > maxTick) maxTick = note.endTick;
            }
            if (!isFinite(minTick)) minTick = 0;
            if (maxTick < minTick) maxTick = minTick;
            const safeStart = Math.max(0, Math.round(minTick));
            const safeEnd = Math.max(safeStart, Math.round(maxTick));
            return { dataStartTick: safeStart, dataEndTick: safeEnd };
        }, [track, midiCacheEntry, audioCacheEntry]);

        const regionStart = useMemo(() => {
            if (typeof track?.regionStartTick !== 'number') return undefined;
            const clamped = Math.min(Math.max(Math.round(track.regionStartTick), dataStartTick), dataEndTick);
            return clamped;
        }, [track?.regionStartTick, dataStartTick, dataEndTick]);

        const regionEnd = useMemo(() => {
            if (typeof track?.regionEndTick !== 'number') return undefined;
            const clamped = Math.min(Math.max(Math.round(track.regionEndTick), dataStartTick), dataEndTick);
            return Math.max(clamped, regionStart ?? dataStartTick);
        }, [track?.regionEndTick, dataStartTick, dataEndTick, regionStart]);

        const localStartTick = regionStart ?? dataStartTick;
        const localEndTick = regionEnd ?? dataEndTick;

        const onPointerDown = (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            if (!track) return;
            // Begin dragging the track block
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            startRef.current = { startX: e.clientX, baseOffsetTick: track?.offsetTicks || 0, alt: !!e.altKey };
            setDragging(true);
            setDidMove(false);
            onHoverSnapX(null);
        };
        const allowNegativeOffset = true; // allow shifting MIDI imports that start late back toward the origin

        const onPointerMove = (e: React.PointerEvent) => {
            if (resizing) {
                const dx = e.clientX - resizing.startX;
                const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
                const baseLocal = resizing.type === 'left' ? resizing.baseStart : resizing.baseEnd;
                const candidateAbs = Math.max(0, (track?.offsetTicks || 0) + baseLocal + deltaTicks);
                const snappedAbs = snapTicks(candidateAbs, e.altKey, false);
                const absOffset = track?.offsetTicks || 0;
                const minAbs = absOffset + dataStartTick;
                const maxAbs = absOffset + dataEndTick;
                const clampedAbs = Math.min(Math.max(snappedAbs, minAbs), maxAbs);
                const newLocal = Math.max(dataStartTick, Math.min(clampedAbs - absOffset, dataEndTick));
                const currentRegionStart = regionStart;
                const currentRegionEnd = regionEnd;
                const prevStart = currentRegionStart != null ? Math.round(currentRegionStart) : undefined;
                const prevEnd = currentRegionEnd != null ? Math.round(currentRegionEnd) : undefined;
                if (resizing.type === 'left') {
                    const endBoundary = currentRegionEnd ?? dataEndTick;
                    const limited = Math.min(newLocal, endBoundary);
                    const nextStart = limited <= dataStartTick ? undefined : Math.round(limited);
                    if (nextStart !== prevStart) {
                        void setTrackRegionTicks(trackId, nextStart, prevEnd);
                    }
                } else {
                    const startBoundary = currentRegionStart ?? dataStartTick;
                    const enforced = Math.max(newLocal, startBoundary + 1);
                    const limited = Math.min(enforced, dataEndTick);
                    const nextEnd = limited >= dataEndTick ? undefined : Math.round(limited);
                    if (nextEnd !== prevEnd) {
                        void setTrackRegionTicks(trackId, prevStart, nextEnd);
                    }
                }
                setDidMove(true);
                return;
            }
            if (!dragging || !startRef.current) return;
            const dx = e.clientX - startRef.current.startX;
            const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
            const altActive = !!(e.altKey || startRef.current.alt);
            const candidate = startRef.current.baseOffsetTick + deltaTicks;
            const snapped = snapTicks(candidate, altActive, false, allowNegativeOffset);
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
            const fallback = track?.offsetTicks ?? 0;
            const finalTick = dragTick != null ? dragTick : fallback;
            const clampedFinal = allowNegativeOffset ? finalTick : Math.max(0, finalTick);
            void setTrackOffsetTicks(trackId, clampedFinal);
            setDragTick(null);
            onHoverSnapX(null);
            // Click selection when not moved
            if (!didMove) selectTracks([trackId]);
        };

        // Resizer handlers
        const onResizeDown = (e: React.PointerEvent, which: 'left' | 'right') => {
            if (e.button !== 0) return;
            e.stopPropagation();
            if (!track) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const baseStart = track.regionStartTick ?? localStartTick;
            const baseEnd = track.regionEndTick ?? localEndTick;
            setResizing({ type: which, startX: e.clientX, baseStart, baseEnd, alt: !!e.altKey });
        };
        const offsetTick = dragTick != null ? dragTick : (track?.offsetTicks || 0);
        const rawAbsStart = offsetTick + localStartTick;
        const rawAbsEnd = offsetTick + localEndTick;
        const absStartTick = allowNegativeOffset ? rawAbsStart : Math.max(0, rawAbsStart);
        const absEndTick = allowNegativeOffset
            ? Math.max(rawAbsStart, rawAbsEnd)
            : Math.max(absStartTick, Math.max(0, rawAbsEnd));
        const leftX = toX(absStartTick, laneWidth);
        const rightX = toX(absEndTick, laneWidth);
        const widthPx = Math.max(0, rightX - leftX);
        const clipHeight = Math.max(18, laneHeight * 0.6);
        const offsetBeats = useMemo(() => {
            if (!track) return 0;
            return (dragTick != null ? dragTick : (track.offsetTicks || 0)) / ppq;
        }, [track, dragTick, ppq]);
        const beatsPerBar = Math.max(1, bpb);
        const offsetBeatsAbs = Math.abs(offsetBeats);
        const wholeBeats = Math.floor(offsetBeatsAbs + 1e-9);
        const barsDisplay = Math.floor(wholeBeats / beatsPerBar);
        const beatInBarDisplay = (wholeBeats % beatsPerBar) + 1; // 1-based beat index like DAWs
        const sign = offsetBeats < 0 ? '-' : '+';
        const label = `${sign}${barsDisplay}|${beatInBarDisplay}`;
        const tooltip = useMemo(() => {
            const st = useTimelineStore.getState();
            const bpm = st.timeline.globalBpm || 120;
            const secPerBeat = 60 / bpm;
            const ticksToSec = (t: number) => (t / ppq) * secPerBeat;
            const absStartRealTick = allowNegativeOffset ? rawAbsStart : Math.max(0, rawAbsStart);
            const absEndRealTick = allowNegativeOffset
                ? Math.max(rawAbsStart, rawAbsEnd)
                : Math.max(absStartRealTick, Math.max(0, rawAbsEnd));
            const absStartSec = ticksToSec(absStartRealTick);
            const absEndSec = ticksToSec(absEndRealTick);
            const barsStart = absStartRealTick / (ppq * bpb);
            const barsEnd = absEndRealTick / (ppq * bpb);
            const fmt = (s: number) => `${s.toFixed(2)}s`;
            const fmtBar = (b: number) => {
                const negative = b < 0;
                const abs = Math.abs(b);
                const barIdx = Math.floor(abs) + 1;
                const beatInBar = Math.floor((abs % 1) * (bpb || 4)) + 1;
                const prefix = negative ? '-' : '';
                return `${prefix}${barIdx}|${beatInBar}`;
            };
            const snapInfo = `Snap: ${formatQuantizeShortLabel(quantize)} (hold Alt to bypass)`;
            return `Track: ${track?.name}\n${snapInfo}\nOffset ${label}\nStart ${fmt(absStartSec)} (${fmtBar(barsStart)})\nEnd ${fmt(absEndSec)} (${fmtBar(barsEnd)})`;
        }, [offsetTick, localStartTick, localEndTick, label, bpb, track?.name, quantize, ppq]);

        return (
            <div className="relative h-full"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                {/* Track clip rectangle (width reflects clip length) */}
                {widthPx > 0 && (
                    <div
                        className={`absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] text-white cursor-grab active:cursor-grabbing select-none overflow-hidden ${isSelected ? 'bg-blue-500/60 border border-blue-300/80' : 'bg-blue-500/40 border border-blue-400/60'}`}
                        style={{ left: leftX, width: Math.max(8, widthPx), height: clipHeight }}
                        title={tooltip}
                        onPointerDown={onPointerDown}
                        data-clip="1"
                    >
                        {/* Audio waveform background (only for audio tracks) */}
                        {track?.type === 'audio' && (
                            <div className="absolute inset-0 pointer-events-none opacity-70">
                                <AudioWaveform
                                    trackId={trackId}
                                    height={clipHeight - 4}
                                    regionStartTickAbs={absStartTick}
                                    regionEndTickAbs={absEndTick}
                                />
                            </div>
                        )}
                        {track?.type === 'midi' && (
                            <MidiNotePreview
                                notes={midiCacheEntry?.notesRaw ?? []}
                                visibleStartTick={localStartTick}
                                visibleEndTick={localEndTick}
                                height={clipHeight - 4}
                            />
                        )}
                        <div className="relative z-10 flex items-center gap-1">
                            <span>{track?.name}</span>
                            <span className="opacity-80">{label}</span>
                            {track?.type === 'audio' ? (
                                <span className="ml-1 text-[10px] opacity-80">{audioCacheEntry ? `${(audioCacheEntry.durationTicks / ppq).toFixed(2)} beats` : 'loading...'}</span>
                            ) : (
                                (midiCacheEntry?.notesRaw?.length ?? 0) === 0 && (
                                    <span className="ml-1 text-[10px] opacity-70">No data</span>
                                )
                            )}
                        </div>

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
    const lanesHeight = trackIds.length > 0
        ? rowHeight * Math.max(1, trackIds.length)
        : Math.max(120, rowHeight);
    const [containerHeight, setContainerHeight] = useState(0);
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setContainerHeight(Math.max(0, Math.round(rect.height)));
        };
        update();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => update());
            observer.observe(el);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    const effectiveHeight = Math.max(lanesHeight, containerHeight);
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
            if (t.type === 'midi') {
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
            } else if (t.type === 'audio') {
                const regionStart = t.regionStartTick ?? 0;
                const regionEnd = t.regionEndTick ?? (useTimelineStore.getState().audioCache[id]?.durationTicks || 0);
                const absStart = Math.max(0, (t.offsetTicks || 0) + regionStart);
                const absEnd = Math.max(absStart, (t.offsetTicks || 0) + regionEnd);
                const clipL = toX(absStart, Math.max(1, width));
                const clipR = toX(absEnd, Math.max(1, width));
                const intersects = !(clipR < x1 || clipL > x2);
                if (intersects) selected.push(id);
            }
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
            style={{ minHeight: lanesHeight, height: '100%', width: '100%' }}
        >
            {/* Grid */}
            <GridLines width={width} height={effectiveHeight} startTick={dispStart} endTick={dispEnd} />

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
