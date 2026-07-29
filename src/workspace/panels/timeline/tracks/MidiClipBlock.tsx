import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useSelectionStore } from '@state/selectionStore';
import { getMidiClipLocalBounds, getMidiClipTimelineBounds, type MidiClip } from '@state/timeline/midiClips';
import { formatQuantizeShortLabel } from '@state/timeline/quantize';
import { useTimelineStore } from '@state/timelineStore';
import MidiNotePreview from '@workspace/components/MidiNotePreview';
import { getMidiClipsInTimelineSelection, type TimelineClipRef } from '../clipboard/midiClipClipboard';
import { useSnapTicks } from '../hooks/useSnapTicks';
import { useTickScale } from '../hooks/useTickScale';

type Props = {
    trackId: string;
    trackIndex: number;
    rowHeight: number;
    clip: MidiClip;
    laneWidth: number;
    laneHeight: number;
    onHoverSnapX: (x: number | null) => void;
};

type DragStart = {
    startX: number;
    startY: number;
    baseOffsetTick: number;
    alt: boolean;
    groupBaseOffsets: Array<{ trackId: string; clipId: string; offsetTicks: number; trackIndex: number }>;
};

type ResizeStart = {
    type: 'left' | 'right';
    startX: number;
    baseStart: number;
    baseEnd: number;
    alt: boolean;
};

const MidiClipBlock: React.FC<Props> = ({
    trackId,
    trackIndex,
    rowHeight,
    clip,
    laneWidth,
    laneHeight,
    onHoverSnapX,
}) => {
    const midiCacheEntry = useTimelineStore((s) => s.midiCache[clip.sourceId]);
    const updateMidiClip = useTimelineStore((s) => s.updateMidiClip);
    const setMultipleMidiClipOffsets = useTimelineStore((s) => s.setMultipleMidiClipOffsets);
    const moveMidiClipsBetweenTracks = useTimelineStore((s) => s.moveMidiClipsBetweenTracks);
    const setCrossTrackDrag = useTimelineStore((s) => s._setCrossTrackDrag);
    const crossTrackDrag = useTimelineStore((s) => s._crossTrackDrag);
    const tracksOrder = useTimelineStore((s) => s.tracksOrder);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const selectClipTimeline = useSelectionStore((s) => s.selectClipTimeline);
    const clipTimelineSelection = useSelectionStore((s) => s.clipTimelineSelection);
    const { view, toX } = useTickScale();
    const snapTicks = useSnapTicks();
    const ppq = CANONICAL_PPQ;

    const [dragTick, setDragTick] = useState<number | null>(null);
    const [resizePreview, setResizePreview] = useState<null | { start: number; end: number }>(null);
    const [didMove, setDidMove] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState('');
    const dragRef = useRef<DragStart | null>(null);
    const resizeRef = useRef<ResizeStart | null>(null);
    const clipElRef = useRef<HTMLDivElement | null>(null);
    const activePointerIdRef = useRef<number | null>(null);

    const localBounds = useMemo(
        () => getMidiClipLocalBounds(useTimelineStore.getState().midiCache, clip),
        [clip, midiCacheEntry]
    );
    if (!localBounds) return null;

    const localStartTick = resizePreview?.start ?? localBounds.startTick;
    const localEndTick = resizePreview?.end ?? localBounds.endTick;
    const offsetTick = dragTick ?? clip.offsetTicks;
    const absStartTick = offsetTick + localStartTick;
    const absEndTick = offsetTick + localEndTick;
    const leftX = toX(absStartTick, laneWidth);
    const rightX = toX(absEndTick, laneWidth);
    const widthPx = Math.max(0, rightX - leftX);
    if (widthPx <= 0) return null;

    const clipHeight = Math.max(18, laneHeight * 0.6);
    const offsetBeats = offsetTick / ppq;
    const beatsPerBar = Math.max(1, bpb);
    const offsetBeatsAbs = Math.abs(offsetBeats);
    const wholeBeats = Math.floor(offsetBeatsAbs + 1e-9);
    const barsDisplay = Math.floor(wholeBeats / beatsPerBar);
    const beatInBarDisplay = (wholeBeats % beatsPerBar) + 1;
    const sign = offsetBeats < 0 ? '-' : '+';
    const label = `${sign}${barsDisplay}|${beatInBarDisplay}`;
    const displayName = clip.name || useTimelineStore.getState().tracks[trackId]?.name || 'MIDI clip';

    const isSelected = useMemo(() => {
        if (!clipTimelineSelection) return false;
        if (clipTimelineSelection.type === 'clips') {
            return clipTimelineSelection.clips.some((c) => c.trackId === trackId && c.clipId === clip.id);
        }
        if (clipTimelineSelection.type !== 'range') return false;
        if (!clipTimelineSelection.range.trackIds.includes(trackId)) return false;
        const selectionStart = Math.min(clipTimelineSelection.range.startTick, clipTimelineSelection.range.endTick);
        const selectionEnd = Math.max(clipTimelineSelection.range.startTick, clipTimelineSelection.range.endTick);
        return absStartTick < selectionEnd && absEndTick > selectionStart;
    }, [absEndTick, absStartTick, clipTimelineSelection, trackId, clip.id]);

    const isCrossDragging = crossTrackDrag?.previews.some((p) => p.clipId === clip.id) ?? false;

    const tooltip = useMemo(() => {
        const st = useTimelineStore.getState();
        const bpm = st.timeline.globalBpm || 120;
        const secPerBeat = 60 / bpm;
        const ticksToSec = (tick: number) => (tick / ppq) * secPerBeat;
        const fmt = (seconds: number) => `${seconds.toFixed(2)}s`;
        const fmtBar = (tick: number) => {
            const beats = tick / ppq;
            const negative = beats < 0;
            const abs = Math.abs(beats);
            const barIdx = Math.floor(abs / beatsPerBar) + 1;
            const beatInBar = Math.floor(abs % beatsPerBar) + 1;
            return `${negative ? '-' : ''}${barIdx}|${beatInBar}`;
        };
        const snapInfo = `Snap: ${formatQuantizeShortLabel(quantize)} (hold Alt to bypass)`;
        return `Clip: ${displayName}\n${snapInfo}\nOffset ${label}\nStart ${fmt(ticksToSec(absStartTick))} (${fmtBar(absStartTick)})\nEnd ${fmt(ticksToSec(absEndTick))} (${fmtBar(absEndTick)})`;
    }, [absStartTick, absEndTick, beatsPerBar, displayName, label, ppq, quantize]);

    const selectForPointer = (e: React.PointerEvent): TimelineClipRef[] => {
        const state = useTimelineStore.getState();
        const currentSelection = useSelectionStore.getState().clipTimelineSelection;
        const selectedRefs = getMidiClipsInTimelineSelection(state, currentSelection);
        const alreadySelected = selectedRefs.some((entry) => entry.trackId === trackId && entry.clipId === clip.id);

        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            // Shift/Cmd: toggle this clip in the selection
            const base: TimelineClipRef[] =
                currentSelection?.type === 'clips' ? [...currentSelection.clips] : selectedRefs;
            const existingIndex = base.findIndex((c) => c.trackId === trackId && c.clipId === clip.id);
            const next: TimelineClipRef[] =
                existingIndex >= 0
                    ? base.filter((_, i) => i !== existingIndex)
                    : [...base, { trackId, clipId: clip.id }];
            if (next.length) {
                selectClipTimeline({ type: 'clips', clips: next });
                return next;
            }
            selectClipTimeline(null);
            return [];
        }

        if (alreadySelected) {
            // Already selected — preserve selection for drag
            return selectedRefs;
        }

        // Plain click: select only this clip
        const nextSelection = { type: 'clips' as const, clips: [{ trackId, clipId: clip.id }] };
        selectClipTimeline(nextSelection);
        return nextSelection.clips;
    };

    const selectRefsAsClips = (refs: TimelineClipRef[]) => {
        if (refs.length) {
            selectClipTimeline({ type: 'clips', clips: refs });
        }
    };

    const releaseClipPointerCapture = (pointerId: number | null) => {
        if (pointerId == null) return;
        try {
            const clipEl = clipElRef.current;
            if (clipEl?.hasPointerCapture?.(pointerId)) {
                clipEl.releasePointerCapture(pointerId);
            }
        } catch {}
    };

    const finishPointerGesture = (pointerId: number | null) => {
        releaseClipPointerCapture(pointerId);
        activePointerIdRef.current = null;
        if (resizeRef.current) {
            const preview = resizePreview;
            resizeRef.current = null;
            setResizePreview(null);
            if (preview && didMove) {
                const regionStartTick = preview.start <= 0 ? undefined : preview.start;
                const regionEndTick =
                    midiCacheEntry?.bounds && preview.end >= midiCacheEntry.bounds.maxTick ? undefined : preview.end;
                void updateMidiClip({ trackId, clipId: clip.id, patch: { regionStartTick, regionEndTick } }).then(
                    () => {
                        selectRefsAsClips([{ trackId, clipId: clip.id }]);
                    }
                );
            }
            return;
        }
        const drag = dragRef.current;
        dragRef.current = null;
        const finalTick = dragTick;
        setDragTick(null);
        onHoverSnapX(null);

        const activeCrossTrackDrag = crossTrackDrag;
        setCrossTrackDrag(null);

        if (!drag || !didMove) return;

        if (activeCrossTrackDrag && activeCrossTrackDrag.previews.some((p) => p.sourceTrackId !== p.targetTrackId)) {
            const moves = activeCrossTrackDrag.previews.map((p) => ({
                sourceTrackId: p.sourceTrackId,
                clipId: p.clipId,
                destinationTrackId: p.targetTrackId,
                newOffsetTicks: p.previewOffsetTicks,
            }));
            void moveMidiClipsBetweenTracks({ moves }).then(() => {
                selectRefsAsClips(moves.map((m) => ({ trackId: m.destinationTrackId, clipId: m.clipId })));
            });
            return;
        }

        if (finalTick == null) return;

        if (drag.groupBaseOffsets.length > 1) {
            const delta = finalTick - drag.baseOffsetTick;
            void setMultipleMidiClipOffsets({
                offsets: drag.groupBaseOffsets.map((entry) => ({
                    trackId: entry.trackId,
                    clipId: entry.clipId,
                    offsetTicks: entry.offsetTicks + delta,
                })),
            }).then(() => {
                selectRefsAsClips(
                    drag.groupBaseOffsets.map((entry) => ({ trackId: entry.trackId, clipId: entry.clipId }))
                );
            });
        } else {
            void updateMidiClip({ trackId, clipId: clip.id, patch: { offsetTicks: finalTick } }).then(() => {
                selectRefsAsClips([{ trackId, clipId: clip.id }]);
            });
        }
    };

    useEffect(() => {
        const finishFromWindow = (event: PointerEvent) => {
            if (activePointerIdRef.current !== event.pointerId) return;
            event.preventDefault();
            finishPointerGesture(event.pointerId);
        };
        window.addEventListener('pointerup', finishFromWindow, { capture: true });
        window.addEventListener('pointercancel', finishFromWindow, { capture: true });
        return () => {
            window.removeEventListener('pointerup', finishFromWindow, { capture: true });
            window.removeEventListener('pointercancel', finishFromWindow, { capture: true });
        };
    });

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        activePointerIdRef.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const nextSelection = selectForPointer(e);
        const storeState = useTimelineStore.getState();
        const groupBaseOffsets = nextSelection
            .map((entry) => {
                const track = storeState.tracks[entry.trackId];
                if (!track || track.type !== 'midi') return null;
                const targetClip = track.clips?.find((candidate) => candidate.id === entry.clipId);
                const ti = storeState.tracksOrder.indexOf(entry.trackId);
                return targetClip
                    ? {
                          trackId: entry.trackId,
                          clipId: entry.clipId,
                          offsetTicks: targetClip.offsetTicks,
                          trackIndex: ti,
                      }
                    : null;
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            baseOffsetTick: clip.offsetTicks,
            alt: !!(e.ctrlKey || e.metaKey),
            groupBaseOffsets,
        };
        setDidMove(false);
        onHoverSnapX(null);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (resizeRef.current) {
            e.preventDefault();
            const resize = resizeRef.current;
            const dx = e.clientX - resize.startX;
            const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
            const baseLocal = resize.type === 'left' ? resize.baseStart : resize.baseEnd;
            const candidateAbs = clip.offsetTicks + baseLocal + deltaTicks;
            const snappedAbs = snapTicks(candidateAbs, e.ctrlKey || e.metaKey || resize.alt, false);
            const nextLocal = Math.max(0, snappedAbs - clip.offsetTicks);
            if (resize.type === 'left') {
                const limited = Math.min(nextLocal, localEndTick - 1);
                setResizePreview({ start: Math.max(0, Math.round(limited)), end: localEndTick });
            } else {
                const limited = Math.max(nextLocal, localStartTick + 1);
                setResizePreview({ start: localStartTick, end: Math.round(limited) });
            }
            setDidMove(true);
            return;
        }
        if (!dragRef.current) return;
        e.preventDefault();
        const drag = dragRef.current;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
        const snapped = snapTicks(drag.baseOffsetTick + deltaTicks, e.ctrlKey || e.metaKey || drag.alt, false, true);
        setDragTick(snapped);
        onHoverSnapX(toX(snapped + localStartTick, laneWidth));
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setDidMove(true);

        // Cross-track drag detection
        const trackDelta = Math.round(dy / Math.max(1, rowHeight));
        if (trackDelta !== 0 && drag.groupBaseOffsets.length) {
            const horizontalDelta = snapped - drag.baseOffsetTick;
            const midiTrackIds = tracksOrder.filter((id) => {
                const t = useTimelineStore.getState().tracks[id];
                return t?.type === 'midi';
            });
            const previews = drag.groupBaseOffsets
                .map((entry) => {
                    const newTrackIndex = entry.trackIndex + trackDelta;
                    const clampedIndex = Math.max(0, Math.min(tracksOrder.length - 1, newTrackIndex));
                    const targetId = tracksOrder[clampedIndex];
                    if (!targetId || !midiTrackIds.includes(targetId)) {
                        // Snap to nearest MIDI track
                        const closestMidi = midiTrackIds.reduce((best, id) => {
                            const idx = tracksOrder.indexOf(id);
                            return Math.abs(idx - newTrackIndex) < Math.abs(tracksOrder.indexOf(best) - newTrackIndex)
                                ? id
                                : best;
                        }, midiTrackIds[0] ?? entry.trackId);
                        const t = useTimelineStore.getState().tracks[entry.trackId];
                        const c = t?.type === 'midi' ? t.clips?.find((cl) => cl.id === entry.clipId) : undefined;
                        return {
                            kind: 'midi' as const,
                            clipId: entry.clipId,
                            sourceTrackId: entry.trackId,
                            targetTrackId: closestMidi,
                            previewOffsetTicks: entry.offsetTicks + horizontalDelta,
                            sourceId: c?.sourceId ?? '',
                            regionStartTick: c?.regionStartTick,
                            regionEndTick: c?.regionEndTick,
                        };
                    }
                    const t = useTimelineStore.getState().tracks[entry.trackId];
                    const c = t?.type === 'midi' ? t.clips?.find((cl) => cl.id === entry.clipId) : undefined;
                    return {
                        kind: 'midi' as const,
                        clipId: entry.clipId,
                        sourceTrackId: entry.trackId,
                        targetTrackId: targetId,
                        previewOffsetTicks: entry.offsetTicks + horizontalDelta,
                        sourceId: c?.sourceId ?? '',
                        regionStartTick: c?.regionStartTick,
                        regionEndTick: c?.regionEndTick,
                    };
                })
                .filter((p) => !!p.sourceId);

            if (previews.length) {
                const primaryTarget =
                    previews.find((p) => p.clipId === clip.id)?.targetTrackId ?? previews[0].targetTrackId;
                setCrossTrackDrag({ kind: 'midi', previews, targetTrackId: primaryTarget });
            }
        } else {
            if (crossTrackDrag) setCrossTrackDrag(null);
        }
    };

    const onPointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        finishPointerGesture(e.pointerId);
    };

    const onResizeDown = (e: React.PointerEvent, type: 'left' | 'right') => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        activePointerIdRef.current = e.pointerId;
        clipElRef.current?.setPointerCapture(e.pointerId);
        selectForPointer(e);
        resizeRef.current = {
            type,
            startX: e.clientX,
            baseStart: localBounds.startTick,
            baseEnd: localBounds.endTick,
            alt: !!(e.ctrlKey || e.metaKey),
        };
        setResizePreview({ start: localBounds.startTick, end: localBounds.endTick });
        setDidMove(false);
    };

    return (
        <div
            className={`timeline-clip timeline-clip--midi absolute top-1/2 -translate-y-1/2 ${
                isCrossDragging ? 'opacity-30 pointer-events-none' : ''
            } ${isSelected ? 'bg-sky-500/65 border border-sky-200/90' : 'bg-blue-500/40 border border-blue-400/60'}`}
            ref={clipElRef}
            style={
                {
                    left: leftX,
                    width: Math.max(8, widthPx),
                    height: clipHeight,
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'none',
                    WebkitUserDrag: 'none',
                } as React.CSSProperties & { WebkitUserDrag: 'none' }
            }
            title={tooltip}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={() => {
                if (dragRef.current || resizeRef.current) {
                    finishPointerGesture(activePointerIdRef.current);
                }
            }}
            onDragStart={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            data-clip="1"
        >
            <MidiNotePreview
                notes={midiCacheEntry?.notesRaw ?? []}
                visibleStartTick={localStartTick}
                visibleEndTick={localEndTick}
                height={clipHeight - 4}
                bounds={midiCacheEntry?.bounds}
            />
            <div className="relative z-10 flex min-w-0 items-center gap-1">
                {editingName ? (
                    <input
                        className="bg-transparent text-white outline-none border-b border-blue-300 w-[80px] text-[11px] min-w-0"
                        value={nameValue}
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) => setNameValue(event.target.value)}
                        onBlur={() => {
                            const trimmed = nameValue.trim();
                            void updateMidiClip({ trackId, clipId: clip.id, patch: { name: trimmed || undefined } });
                            setEditingName(false);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                const trimmed = nameValue.trim();
                                void updateMidiClip({
                                    trackId,
                                    clipId: clip.id,
                                    patch: { name: trimmed || undefined },
                                });
                                setEditingName(false);
                            } else if (event.key === 'Escape') {
                                setEditingName(false);
                            }
                            event.stopPropagation();
                        }}
                    />
                ) : (
                    <span
                        className="min-w-0 truncate"
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            setNameValue(clip.name || '');
                            setEditingName(true);
                        }}
                    >
                        {displayName}
                    </span>
                )}
                <span className="shrink-0 opacity-80">{label}</span>
                {(midiCacheEntry?.notesRaw?.length ?? 0) === 0 && (
                    <span className="shrink-0 text-[10px] opacity-70">No data</span>
                )}
            </div>
            <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
                onPointerDown={(event) => onResizeDown(event, 'left')}
                title="Resize start"
            />
            <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                onPointerDown={(event) => onResizeDown(event, 'right')}
                title="Resize end"
            />
        </div>
    );
};

export default MidiClipBlock;
