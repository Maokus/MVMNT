import React, { useMemo, useRef, useState } from 'react';
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
    clip: MidiClip;
    laneWidth: number;
    laneHeight: number;
    onHoverSnapX: (x: number | null) => void;
};

type DragStart = {
    startX: number;
    baseOffsetTick: number;
    alt: boolean;
    groupBaseOffsets: Array<{ trackId: string; clipId: string; offsetTicks: number }>;
};

type ResizeStart = {
    type: 'left' | 'right';
    startX: number;
    baseStart: number;
    baseEnd: number;
    alt: boolean;
};

const MidiClipBlock: React.FC<Props> = ({ trackId, clip, laneWidth, laneHeight, onHoverSnapX }) => {
    const midiCacheEntry = useTimelineStore((s) => s.midiCache[clip.sourceId]);
    const updateMidiClip = useTimelineStore((s) => s.updateMidiClip);
    const setMultipleMidiClipOffsets = useTimelineStore((s) => s.setMultipleMidiClipOffsets);
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

    const localBounds = useMemo(() => getMidiClipLocalBounds(useTimelineStore.getState().midiCache, clip), [clip, midiCacheEntry]);
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
        if (!clipTimelineSelection || clipTimelineSelection.type !== 'range') return false;
        if (!clipTimelineSelection.range.trackIds.includes(trackId)) return false;
        const selectionStart = Math.min(clipTimelineSelection.range.startTick, clipTimelineSelection.range.endTick);
        const selectionEnd = Math.max(clipTimelineSelection.range.startTick, clipTimelineSelection.range.endTick);
        return absStartTick < selectionEnd && absEndTick > selectionStart;
    }, [absEndTick, absStartTick, clipTimelineSelection, trackId]);

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

    const selectForPointer = (): TimelineClipRef[] => {
        const state = useTimelineStore.getState();
        const currentSelection = useSelectionStore.getState().clipTimelineSelection;
        const selectedRefs = getMidiClipsInTimelineSelection(state, currentSelection);
        if (selectedRefs.some((entry) => entry.trackId === trackId && entry.clipId === clip.id)) {
            return selectedRefs;
        }
        const nextSelection = {
            type: 'range' as const,
            range: {
                startTick: absStartTick,
                endTick: absEndTick,
                trackIds: [trackId],
            },
        };
        selectClipTimeline(nextSelection);
        return [{ trackId, clipId: clip.id }];
    };

    const selectRangeForRefs = (refs: TimelineClipRef[]) => {
        const state = useTimelineStore.getState();
        let startTick = Infinity;
        let endTick = -Infinity;
        const selectedTrackIds = new Set<string>();
        const refKeys = new Set(refs.map((entry) => `${entry.trackId}:${entry.clipId}`));
        for (const candidateTrackId of state.tracksOrder) {
            const track = state.tracks[candidateTrackId];
            if (!track || track.type !== 'midi') continue;
            for (const candidateClip of track.clips ?? []) {
                if (!refKeys.has(`${candidateTrackId}:${candidateClip.id}`)) continue;
                const bounds = getMidiClipTimelineBounds(state.midiCache, candidateClip);
                if (!bounds) continue;
                startTick = Math.min(startTick, bounds.startTick);
                endTick = Math.max(endTick, bounds.endTick);
                selectedTrackIds.add(candidateTrackId);
            }
        }
        if (Number.isFinite(startTick) && Number.isFinite(endTick) && selectedTrackIds.size) {
            selectClipTimeline({
                type: 'range',
                range: { startTick, endTick, trackIds: [...selectedTrackIds] },
            });
        }
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.button != null && e.button !== 0) return;
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const nextSelection = selectForPointer();
        const storeState = useTimelineStore.getState();
        const groupBaseOffsets = nextSelection
            .map((entry) => {
                const track = storeState.tracks[entry.trackId];
                if (!track || track.type !== 'midi') return null;
                const targetClip = track.clips?.find((candidate) => candidate.id === entry.clipId);
                return targetClip
                    ? { trackId: entry.trackId, clipId: entry.clipId, offsetTicks: targetClip.offsetTicks }
                    : null;
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        dragRef.current = {
            startX: e.clientX,
            baseOffsetTick: clip.offsetTicks,
            alt: !!(e.ctrlKey || e.metaKey),
            groupBaseOffsets,
        };
        setDidMove(false);
        onHoverSnapX(null);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (resizeRef.current) {
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
        const dx = e.clientX - dragRef.current.startX;
        const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
        const snapped = snapTicks(dragRef.current.baseOffsetTick + deltaTicks, e.ctrlKey || e.metaKey || dragRef.current.alt, false, true);
        setDragTick(snapped);
        onHoverSnapX(toX(snapped + localStartTick, laneWidth));
        if (Math.abs(dx) > 2) setDidMove(true);
    };

    const onPointerUp = (e: React.PointerEvent) => {
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
        if (resizeRef.current) {
            const preview = resizePreview;
            resizeRef.current = null;
            setResizePreview(null);
            if (preview && didMove) {
                const regionStartTick = preview.start <= 0 ? undefined : preview.start;
                const regionEndTick =
                    midiCacheEntry?.bounds && preview.end >= midiCacheEntry.bounds.maxTick ? undefined : preview.end;
                void updateMidiClip({ trackId, clipId: clip.id, patch: { regionStartTick, regionEndTick } }).then(() => {
                    selectRangeForRefs([{ trackId, clipId: clip.id }]);
                });
            }
            return;
        }
        const drag = dragRef.current;
        dragRef.current = null;
        const finalTick = dragTick;
        setDragTick(null);
        onHoverSnapX(null);
        if (!drag || finalTick == null || !didMove) return;
        if (drag.groupBaseOffsets.length > 1) {
            const delta = finalTick - drag.baseOffsetTick;
            void setMultipleMidiClipOffsets({
                offsets: drag.groupBaseOffsets.map((entry) => ({
                    trackId: entry.trackId,
                    clipId: entry.clipId,
                    offsetTicks: entry.offsetTicks + delta,
                })),
            }).then(() => {
                selectRangeForRefs(drag.groupBaseOffsets);
            });
        } else {
            void updateMidiClip({ trackId, clipId: clip.id, patch: { offsetTicks: finalTick } }).then(() => {
                selectRangeForRefs([{ trackId, clipId: clip.id }]);
            });
        }
    };

    const onResizeDown = (e: React.PointerEvent, type: 'left' | 'right') => {
        if (e.button != null && e.button !== 0) return;
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        selectForPointer();
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
            className={`absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] text-white cursor-grab active:cursor-grabbing select-none overflow-hidden ${
                isSelected ? 'bg-sky-500/65 border border-sky-200/90' : 'bg-blue-500/40 border border-blue-400/60'
            }`}
            style={{ left: leftX, width: Math.max(8, widthPx), height: clipHeight }}
            title={tooltip}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
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
                                void updateMidiClip({ trackId, clipId: clip.id, patch: { name: trimmed || undefined } });
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
                {(midiCacheEntry?.notesRaw?.length ?? 0) === 0 && <span className="shrink-0 text-[10px] opacity-70">No data</span>}
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
