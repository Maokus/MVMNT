import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { AudioClip } from '@audio/audioTypes';
import { getAudioClipLocalBounds, getAudioClipsForTrack } from '@state/timeline/audioClips';
import { formatQuantizeShortLabel } from '@state/timeline/quantize';
import { useSelectionStore } from '@state/selectionStore';
import { useTimelineStore } from '@state/timelineStore';
import AudioWaveform from '@workspace/components/AudioWaveform';
import { getAudioClipsInTimelineSelection, type TimelineClipRef } from '../clipboard/midiClipClipboard';
import { useSnapTicks } from '../hooks/useSnapTicks';
import { useTickScale } from '../hooks/useTickScale';

type Props = {
    trackId: string;
    trackIndex: number;
    rowHeight: number;
    clip: AudioClip;
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

const AudioClipBlock: React.FC<Props> = ({ trackId, trackIndex, rowHeight, clip, laneWidth, laneHeight, onHoverSnapX }) => {
    const audioCacheEntry = useTimelineStore((s) => s.audioCache[clip.sourceId]);
    const updateAudioClip = useTimelineStore((s) => s.updateAudioClip);
    const setMultipleAudioClipOffsets = useTimelineStore((s) => s.setMultipleAudioClipOffsets);
    const moveAudioClipsBetweenTracks = useTimelineStore((s) => s.moveAudioClipsBetweenTracks);
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

    const localBounds = useMemo(() => getAudioClipLocalBounds(useTimelineStore.getState().audioCache, clip), [clip, audioCacheEntry]);
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
    const wholeBeats = Math.floor(Math.abs(offsetBeats) + 1e-9);
    const label = `${offsetBeats < 0 ? '-' : '+'}${Math.floor(wholeBeats / beatsPerBar)}|${(wholeBeats % beatsPerBar) + 1}`;
    const displayName = clip.name || useTimelineStore.getState().tracks[trackId]?.name || 'Audio clip';

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

    const isCrossDragging = crossTrackDrag?.previews.some((p) => p.clipId === clip.id && p.sourceTrackId === trackId) ?? false;

    const tooltip = useMemo(() => {
        const snapInfo = `Snap: ${formatQuantizeShortLabel(quantize)} (hold Alt to bypass)`;
        return `Clip: ${displayName}\n${snapInfo}\nOffset ${label}`;
    }, [displayName, label, quantize]);

    const selectForPointer = (e: React.PointerEvent): TimelineClipRef[] => {
        const state = useTimelineStore.getState();
        const currentSelection = useSelectionStore.getState().clipTimelineSelection;
        const selectedRefs = getAudioClipsInTimelineSelection(state, currentSelection);
        const alreadySelected = selectedRefs.some((entry) => entry.trackId === trackId && entry.clipId === clip.id);
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            const base: TimelineClipRef[] = currentSelection?.type === 'clips' ? [...currentSelection.clips] : selectedRefs;
            const existingIndex = base.findIndex((c) => c.trackId === trackId && c.clipId === clip.id);
            const next: TimelineClipRef[] = existingIndex >= 0
                ? base.filter((_, i) => i !== existingIndex)
                : [...base, { trackId, clipId: clip.id, kind: 'audio' }];
            selectClipTimeline(next.length ? { type: 'clips', clips: next } : null);
            return next;
        }
        if (alreadySelected) return selectedRefs;
        const nextSelection = { type: 'clips' as const, clips: [{ trackId, clipId: clip.id, kind: 'audio' as const }] };
        selectClipTimeline(nextSelection);
        return nextSelection.clips;
    };

    const selectRefsAsClips = (refs: TimelineClipRef[]) => {
        if (refs.length) selectClipTimeline({ type: 'clips', clips: refs.map((ref) => ({ ...ref, kind: 'audio' })) });
    };

    const releaseClipPointerCapture = (pointerId: number | null) => {
        if (pointerId == null) return;
        try {
            const clipEl = clipElRef.current;
            if (clipEl?.hasPointerCapture?.(pointerId)) clipEl.releasePointerCapture(pointerId);
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
                const regionEndTick = audioCacheEntry && preview.end >= audioCacheEntry.durationTicks ? undefined : preview.end;
                void updateAudioClip({ trackId, clipId: clip.id, patch: { regionStartTick, regionEndTick } }).then(() => {
                    selectRefsAsClips([{ trackId, clipId: clip.id, kind: 'audio' }]);
                });
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
            void moveAudioClipsBetweenTracks({ moves }).then(() => {
                selectRefsAsClips(moves.map((m) => ({ trackId: m.destinationTrackId, clipId: m.clipId, kind: 'audio' })));
            });
            return;
        }
        if (finalTick == null) return;
        if (drag.groupBaseOffsets.length > 1) {
            const delta = finalTick - drag.baseOffsetTick;
            void setMultipleAudioClipOffsets({
                offsets: drag.groupBaseOffsets.map((entry) => ({
                    trackId: entry.trackId,
                    clipId: entry.clipId,
                    offsetTicks: entry.offsetTicks + delta,
                })),
            }).then(() => {
                selectRefsAsClips(drag.groupBaseOffsets.map((entry) => ({ trackId: entry.trackId, clipId: entry.clipId, kind: 'audio' })));
            });
        } else {
            void updateAudioClip({ trackId, clipId: clip.id, patch: { offsetTicks: finalTick } }).then(() => {
                selectRefsAsClips([{ trackId, clipId: clip.id, kind: 'audio' }]);
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
            .filter((entry) => (entry.kind ?? storeState.tracks[entry.trackId]?.type) === 'audio')
            .map((entry) => {
                const track = storeState.tracks[entry.trackId];
                if (!track || track.type !== 'audio') return null;
                const targetClip = getAudioClipsForTrack(track).find((candidate) => candidate.id === entry.clipId);
                const ti = storeState.tracksOrder.indexOf(entry.trackId);
                return targetClip
                    ? { trackId: entry.trackId, clipId: entry.clipId, offsetTicks: targetClip.offsetTicks, trackIndex: ti }
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
                setResizePreview({ start: Math.max(0, Math.round(Math.min(nextLocal, localEndTick - 1))), end: localEndTick });
            } else {
                setResizePreview({ start: localStartTick, end: Math.round(Math.max(nextLocal, localStartTick + 1)) });
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

        const trackDelta = Math.round(dy / Math.max(1, rowHeight));
        if (trackDelta !== 0 && drag.groupBaseOffsets.length) {
            const horizontalDelta = snapped - drag.baseOffsetTick;
            const audioTrackIds = tracksOrder.filter((id) => useTimelineStore.getState().tracks[id]?.type === 'audio');
            const previews = drag.groupBaseOffsets
                .map((entry) => {
                    const newTrackIndex = entry.trackIndex + trackDelta;
                    const clampedIndex = Math.max(0, Math.min(tracksOrder.length - 1, newTrackIndex));
                    let targetId = tracksOrder[clampedIndex];
                    if (!targetId || !audioTrackIds.includes(targetId)) {
                        targetId = audioTrackIds.reduce((best, id) => {
                            const idx = tracksOrder.indexOf(id);
                            return Math.abs(idx - newTrackIndex) < Math.abs(tracksOrder.indexOf(best) - newTrackIndex) ? id : best;
                        }, audioTrackIds[0] ?? entry.trackId);
                    }
                    const t = useTimelineStore.getState().tracks[entry.trackId];
                    const c = t?.type === 'audio' ? getAudioClipsForTrack(t).find((cl) => cl.id === entry.clipId) : undefined;
                    return {
                        kind: 'audio' as const,
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
                const primaryTarget = previews.find((p) => p.clipId === clip.id)?.targetTrackId ?? previews[0].targetTrackId;
                setCrossTrackDrag({ kind: 'audio', previews, targetTrackId: primaryTarget } as any);
            }
        } else if (crossTrackDrag) {
            setCrossTrackDrag(null);
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
        resizeRef.current = { type, startX: e.clientX, baseStart: localBounds.startTick, baseEnd: localBounds.endTick, alt: !!(e.ctrlKey || e.metaKey) };
        setResizePreview({ start: localBounds.startTick, end: localBounds.endTick });
        setDidMove(false);
    };

    return (
        <div
            className={`absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] text-white cursor-grab active:cursor-grabbing select-none overflow-hidden transition-opacity ${isCrossDragging ? 'opacity-30 pointer-events-none' : ''} ${isSelected ? 'bg-emerald-500/65 border border-emerald-200/90' : 'bg-blue-500/40 border border-blue-400/60'}`}
            ref={clipElRef}
            style={{ left: leftX, width: Math.max(8, widthPx), height: clipHeight, userSelect: 'none', touchAction: 'none' }}
            title={tooltip}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={() => {
                if (dragRef.current || resizeRef.current) finishPointerGesture(activePointerIdRef.current);
            }}
            onDragStart={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            data-clip="1"
        >
            <div className="absolute inset-0 pointer-events-none opacity-70">
                <AudioWaveform
                    trackId={trackId}
                    sourceId={clip.sourceId}
                    clipOffsetTicks={offsetTick}
                    regionStartTick={localStartTick}
                    regionEndTick={localEndTick}
                    height={clipHeight - 4}
                    regionStartTickAbs={absStartTick}
                    regionEndTickAbs={absEndTick}
                />
            </div>
            <div className="relative z-10 flex min-w-0 items-center gap-1">
                {editingName ? (
                    <input
                        className="bg-transparent text-white outline-none border-b border-emerald-300 w-[80px] text-[11px] min-w-0"
                        value={nameValue}
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(event) => setNameValue(event.target.value)}
                        onBlur={() => {
                            const trimmed = nameValue.trim();
                            void updateAudioClip({ trackId, clipId: clip.id, patch: { name: trimmed || undefined } });
                            setEditingName(false);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                const trimmed = nameValue.trim();
                                void updateAudioClip({ trackId, clipId: clip.id, patch: { name: trimmed || undefined } });
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
            </div>
            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => onResizeDown(event, 'left')} title="Resize start" />
            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={(event) => onResizeDown(event, 'right')} title="Resize end" />
        </div>
    );
};

export default AudioClipBlock;
