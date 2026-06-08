import React, { useMemo, useRef, useState } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { useTickScale } from '../hooks/useTickScale';
import { useSnapTicks } from '../hooks/useSnapTicks';
import AudioWaveform from '@workspace/components/AudioWaveform';
import MidiNotePreview from '@workspace/components/MidiNotePreview';
import { formatQuantizeShortLabel } from '@state/timeline/quantize';
import type { AudioTrack } from '@audio/audioTypes';

type Props = {
    trackId: string;
    laneWidth: number;
    laneHeight: number;
    onHoverSnapX: (x: number | null) => void;
};

const TrackRowBlock: React.FC<Props> = ({ trackId, laneWidth, laneHeight, onHoverSnapX }) => {
    const track = useTimelineStore((s) => s.tracks[trackId]);
    const setTrackOffsetTicks = useTimelineStore((s) => s.setTrackOffsetTicks);
    const setTrackRegionTicks = useTimelineStore((s) => s.setTrackRegionTicks);
    const setMultipleTrackOffsetTicks = useTimelineStore((s) => s.setMultipleTrackOffsetTicks);
    const selectTracks = useSelectionStore((s) => s.selectTracks);
    const updateTrack = useTimelineStore((s) => s.updateTrack);
    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState('');
    const midiCacheEntry = useTimelineStore((s) => {
        const t: any = s.tracks[trackId];
        if (t && t.type === 'midi') {
            return s.midiCache[t.midiSourceId ?? trackId];
        }
        return undefined;
    });
    const audioCacheEntry = useTimelineStore((s) => s.audioCache[trackId]);
    const isAudioTrack = track?.type === 'audio';
    const audioSourceId = isAudioTrack ? (track as AudioTrack).audioSourceId ?? trackId : undefined;
    const hasFeatureRequirements = useAudioDiagnosticsStore((state) =>
        audioSourceId ? (state.sourcesWithIntents[audioSourceId] ?? 0) > 0 : false,
    );
    const audioFeatureStatus = useTimelineStore((s) =>
        audioSourceId ? s.audioFeatureCacheStatus[audioSourceId] : undefined,
    );
    const setTrackGain = useTimelineStore((s) => s.setTrackGain);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar);
    const ppq = CANONICAL_PPQ;
    const { view, toX } = useTickScale();
    const snapTicks = useSnapTicks();

    const [dragging, setDragging] = useState(false);
    const [dragTick, setDragTick] = useState<number | null>(null);
    const startRef = useRef<{ startX: number; baseOffsetTick: number; alt: boolean; groupBaseOffsets: Record<string, number> } | null>(null);
    const [resizing, setResizing] = useState<null | { type: 'left' | 'right'; startX: number; baseStart: number; baseEnd: number; alt: boolean }>(null);
    const [didMove, setDidMove] = useState(false);
    const isSelected = useSelectionStore((s) => s.selectedTrackIds.includes(trackId));
    const selectedTrackIds = useSelectionStore((s) => s.selectedTrackIds);
    const groupDrag = useTimelineStore((s) => s._clipGroupDrag);
    const setClipGroupDrag = useTimelineStore((s) => s._setClipGroupDrag);
    const quantize = useTimelineStore((s) => s.transport.quantize);

    const { dataStartTick, dataEndTick } = useMemo(() => {
        if (!track) return { dataStartTick: 0, dataEndTick: 0 };
        if (track.type === 'audio') {
            const duration = audioCacheEntry?.durationTicks ?? 0;
            const safeDuration = Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
            return { dataStartTick: 0, dataEndTick: safeDuration };
        }
        const notes = midiCacheEntry?.notesRaw || [];
        if (!notes.length) return { dataStartTick: 0, dataEndTick: 0 };
        if (midiCacheEntry?.bounds) {
            const { minTick, maxTick } = midiCacheEntry.bounds;
            return { dataStartTick: Math.max(0, Math.round(minTick)), dataEndTick: Math.max(0, Math.round(maxTick)) };
        }
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
        return Math.min(Math.max(Math.round(track.regionStartTick), dataStartTick), dataEndTick);
    }, [track?.regionStartTick, dataStartTick, dataEndTick]);

    const regionEnd = useMemo(() => {
        if (typeof track?.regionEndTick !== 'number') return undefined;
        const clamped = Math.min(Math.max(Math.round(track.regionEndTick), dataStartTick), dataEndTick);
        return Math.max(clamped, regionStart ?? dataStartTick);
    }, [track?.regionEndTick, dataStartTick, dataEndTick, regionStart]);

    const localStartTick = regionStart ?? dataStartTick;
    const localEndTick = regionEnd ?? dataEndTick;
    const allowNegativeOffset = true;

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        if (!track) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const groupBaseOffsets: Record<string, number> = {};
        if (isSelected && selectedTrackIds.length > 1) {
            const storeState = useTimelineStore.getState();
            for (const id of selectedTrackIds) {
                groupBaseOffsets[id] = storeState.tracks[id]?.offsetTicks ?? 0;
            }
        }
        startRef.current = { startX: e.clientX, baseOffsetTick: track?.offsetTicks || 0, alt: !!(e.ctrlKey || e.metaKey), groupBaseOffsets };
        setDragging(true);
        setDidMove(false);
        onHoverSnapX(null);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (resizing) {
            const dx = e.clientX - resizing.startX;
            const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
            const baseLocal = resizing.type === 'left' ? resizing.baseStart : resizing.baseEnd;
            const candidateAbs = Math.max(0, (track?.offsetTicks || 0) + baseLocal + deltaTicks);
            const snappedAbs = snapTicks(candidateAbs, e.ctrlKey || e.metaKey, false);
            const absOffset = track?.offsetTicks || 0;
            const minAbs = absOffset + dataStartTick;
            const maxAbs = absOffset + dataEndTick;
            const clampedAbs = Math.min(Math.max(snappedAbs, minAbs), maxAbs);
            const newLocal = Math.max(dataStartTick, Math.min(clampedAbs - absOffset, dataEndTick));
            const prevStart = regionStart != null ? Math.round(regionStart) : undefined;
            const prevEnd = regionEnd != null ? Math.round(regionEnd) : undefined;
            if (resizing.type === 'left') {
                const endBoundary = regionEnd ?? dataEndTick;
                const limited = Math.min(newLocal, endBoundary);
                const nextStart = limited <= dataStartTick ? undefined : Math.round(limited);
                if (nextStart !== prevStart) void setTrackRegionTicks(trackId, nextStart, prevEnd);
            } else {
                const startBoundary = regionStart ?? dataStartTick;
                const enforced = Math.max(newLocal, startBoundary + 1);
                const limited = Math.min(enforced, dataEndTick);
                const nextEnd = limited >= dataEndTick ? undefined : Math.round(limited);
                if (nextEnd !== prevEnd) void setTrackRegionTicks(trackId, prevStart, nextEnd);
            }
            setDidMove(true);
            return;
        }
        if (!dragging || !startRef.current) return;
        const dx = e.clientX - startRef.current.startX;
        const deltaTicks = Math.round((dx / Math.max(1, laneWidth)) * (view.endTick - view.startTick));
        const altActive = !!((e.ctrlKey || e.metaKey) || startRef.current.alt);
        const candidate = startRef.current.baseOffsetTick + deltaTicks;
        const snapped = snapTicks(candidate, altActive, false, allowNegativeOffset);
        setDragTick(snapped);
        onHoverSnapX(toX(snapped, laneWidth));
        if (Math.abs(dx) > 2) setDidMove(true);
        const groupIds = Object.keys(startRef.current.groupBaseOffsets);
        if (groupIds.length > 1) {
            setClipGroupDrag({ delta: snapped - startRef.current.baseOffsetTick, trackIds: groupIds });
        }
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
        const groupBaseOffsets = startRef.current?.groupBaseOffsets ?? {};
        const groupIds = Object.keys(groupBaseOffsets);
        if (groupIds.length > 1) {
            const delta = clampedFinal - (startRef.current?.baseOffsetTick ?? fallback);
            const offsets = groupIds.map((id) => ({
                trackId: id,
                offsetTicks: allowNegativeOffset ? groupBaseOffsets[id] + delta : Math.max(0, groupBaseOffsets[id] + delta),
            }));
            void setMultipleTrackOffsetTicks(offsets);
        } else {
            void setTrackOffsetTicks(trackId, clampedFinal);
        }
        setClipGroupDrag(null);
        setDragTick(null);
        onHoverSnapX(null);
        if (!didMove) {
            if (e.shiftKey) {
                const current = useSelectionStore.getState().selectedTrackIds;
                const idx = current.indexOf(trackId);
                selectTracks(idx >= 0 ? current.filter((id) => id !== trackId) : [...current, trackId]);
            } else {
                selectTracks([trackId]);
            }
        }
    };

    const onResizeDown = (e: React.PointerEvent, which: 'left' | 'right') => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (!track) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const baseStart = track.regionStartTick ?? localStartTick;
        const baseEnd = track.regionEndTick ?? localEndTick;
        setResizing({ type: which, startX: e.clientX, baseStart, baseEnd, alt: !!(e.ctrlKey || e.metaKey) });
    };

    const offsetTick = dragTick != null
        ? dragTick
        : (groupDrag && groupDrag.trackIds.includes(trackId)
            ? (track?.offsetTicks || 0) + groupDrag.delta
            : (track?.offsetTicks || 0));
    const rawAbsStart = offsetTick + localStartTick;
    const rawAbsEnd = offsetTick + localEndTick;
    const absStartTick = allowNegativeOffset ? rawAbsStart : Math.max(0, rawAbsStart);
    const absEndTick = allowNegativeOffset
        ? Math.max(rawAbsStart, rawAbsEnd)
        : Math.max(absStartTick, Math.max(0, rawAbsEnd));
    const leftX = toX(absStartTick, laneWidth);
    const rightX = toX(absEndTick, laneWidth);
    const widthPx = Math.max(0, rightX - leftX);
    const placeholderTicks = ppq * Math.max(1, bpb || 4);
    const placeholderWidthPx = Math.max(8, toX(absStartTick + placeholderTicks, laneWidth) - leftX);
    const effectiveWidthPx = isAudioTrack
        ? widthPx > 0 ? Math.max(8, widthPx) : placeholderWidthPx
        : Math.max(8, widthPx);
    const shouldRenderClip = isAudioTrack ? effectiveWidthPx > 0 : widthPx > 0;
    const hasWaveform = isAudioTrack && (audioCacheEntry?.waveform?.channelPeaks?.length ?? 0) > 0;
    const clipHeight = Math.max(18, laneHeight * 0.6);
    const canResize = !isAudioTrack || widthPx > 0;

    const offsetBeats = useMemo(() => {
        if (!track) return 0;
        return (dragTick != null ? dragTick : (track.offsetTicks || 0)) / ppq;
    }, [track, dragTick, ppq]);
    const beatsPerBar = Math.max(1, bpb);
    const offsetBeatsAbs = Math.abs(offsetBeats);
    const wholeBeats = Math.floor(offsetBeatsAbs + 1e-9);
    const barsDisplay = Math.floor(wholeBeats / beatsPerBar);
    const beatInBarDisplay = (wholeBeats % beatsPerBar) + 1;
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
            return `${negative ? '-' : ''}${barIdx}|${beatInBar}`;
        };
        const snapInfo = `Snap: ${formatQuantizeShortLabel(quantize)} (hold Alt to bypass)`;
        return `Track: ${track?.name}\n${snapInfo}\nOffset ${label}\nStart ${fmt(absStartSec)} (${fmtBar(barsStart)})\nEnd ${fmt(absEndSec)} (${fmtBar(barsEnd)})`;
    }, [offsetTick, localStartTick, localEndTick, label, bpb, track?.name, quantize, ppq]);

    const showFeatureChip = isAudioTrack && hasFeatureRequirements;
    let featureStatusLabel: string | null = null;
    let featureStatusClass = '';
    if (showFeatureChip) {
        const pendingProgress = audioFeatureStatus?.progress;
        const pendingPercent = pendingProgress
            ? Math.round(Math.max(0, Math.min(1, pendingProgress.value)) * 100)
            : null;
        switch (audioFeatureStatus?.state) {
            case 'ready':
                featureStatusLabel = 'Analysed';
                featureStatusClass = 'bg-emerald-500/60 text-emerald-50 border border-emerald-300/40';
                break;
            case 'pending':
                featureStatusLabel = pendingPercent != null ? `Analysing… ${pendingPercent}%` : 'Analysing…';
                featureStatusClass = 'bg-amber-500/60 text-amber-50 border border-amber-300/40';
                break;
            case 'failed':
                featureStatusLabel = 'Failed';
                featureStatusClass = 'bg-rose-500/70 text-rose-50 border border-rose-300/40';
                break;
            case 'stale':
                featureStatusLabel = 'Queued';
                featureStatusClass = 'bg-sky-500/60 text-sky-50 border border-sky-300/40';
                break;
            default:
                featureStatusLabel = 'Not analysed';
                featureStatusClass = 'bg-slate-600/70 text-slate-100 border border-slate-400/40';
        }
    }

    const featureStatusTitle = useMemo(() => {
        if (!showFeatureChip || !audioFeatureStatus) return undefined;
        const parts: string[] = [];
        if (audioFeatureStatus.message) parts.push(audioFeatureStatus.message);
        if (audioFeatureStatus.state === 'pending' && audioFeatureStatus.progress?.label) {
            parts.push(`Phase: ${audioFeatureStatus.progress.label}`);
        }
        return parts.length ? parts.join(' • ') : undefined;
    }, [audioFeatureStatus, showFeatureChip]);

    return (
        <div className="relative h-full" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            {shouldRenderClip && (
                <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] text-white cursor-grab active:cursor-grabbing select-none overflow-hidden ${isSelected ? 'bg-blue-500/60 border border-blue-300/80' : 'bg-blue-500/40 border border-blue-400/60'}`}
                    style={{ left: leftX, width: effectiveWidthPx, height: clipHeight }}
                    title={tooltip}
                    onPointerDown={onPointerDown}
                    data-clip="1"
                >
                    {hasWaveform && (
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
                            bounds={midiCacheEntry?.bounds}
                        />
                    )}
                    <div className="relative z-10 flex items-center gap-1">
                        {editingName ? (
                            <input
                                className="bg-transparent text-white outline-none border-b border-blue-400 w-[80px] text-[11px] min-w-0"
                                value={nameValue}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onChange={(e) => setNameValue(e.target.value)}
                                onBlur={() => {
                                    const trimmed = nameValue.trim();
                                    if (trimmed) updateTrack(trackId, { name: trimmed });
                                    setEditingName(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const trimmed = nameValue.trim();
                                        if (trimmed) updateTrack(trackId, { name: trimmed });
                                        setEditingName(false);
                                    } else if (e.key === 'Escape') {
                                        setEditingName(false);
                                    }
                                    e.stopPropagation();
                                }}
                            />
                        ) : (
                            <span
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setNameValue(track?.name ?? '');
                                    setEditingName(true);
                                }}
                            >{track?.name}</span>
                        )}
                        <span className="opacity-80">{label}</span>
                        {track?.type === 'audio' ? (
                            <>
                                <span className="ml-1 text-[10px] opacity-80">
                                    {audioCacheEntry ? `${(audioCacheEntry.durationTicks / ppq).toFixed(2)} beats` : 'loading...'}
                                </span>
                                {showFeatureChip && featureStatusLabel && (
                                    <span
                                        className={`ml-1 rounded px-1.5 py-[1px] text-[10px] font-medium ${featureStatusClass}`}
                                        title={featureStatusTitle}
                                    >
                                        {featureStatusLabel}
                                    </span>
                                )}
                            </>
                        ) : (
                            (midiCacheEntry?.notesRaw?.length ?? 0) === 0 && (
                                <span className="ml-1 text-[10px] opacity-70">No data</span>
                            )
                        )}
                    </div>

                    {canResize && (
                        <>
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
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default TrackRowBlock;
