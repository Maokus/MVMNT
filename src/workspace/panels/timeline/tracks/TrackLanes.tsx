import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { useTickScale } from '../hooks/useTickScale';
import { useSnapTicks } from '../hooks/useSnapTicks';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import { isMidiFile, isAudioFile } from '../utils/fileTypeUtils';
import AutomationLanes from '../automation/AutomationLanes';
import TempoAutomationLane from '../automation/TempoAutomationLane';
import { AUTOMATION_HEADER_HEIGHT, TEMPO_LANE_HEIGHT } from '../constants';
import GridLines from './GridLines';
import TrackRowBlock from './TrackRowBlock';
import { getMidiClipLocalBounds } from '@state/timeline/midiClips';
import { getAudioClipTimelineBounds } from '@state/timeline/audioClips';
import { createTimingContext } from '@state/timelineTime';

type Props = {
    trackIds: string[];
    activeTab: 'clips' | 'automation';
};

const TrackLanes: React.FC<Props> = ({ trackIds, activeTab }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const [hoverX, setHoverX] = useState<number | null>(null);
    const { view, toTick, toX } = useTickScale();
    const snapTicks = useSnapTicks();
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const addAudioTrack = useTimelineStore((s) => s.addAudioTrack);
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const tempoEnabled = useTimelineStore((s) => !!s.timeline.tempoAutomation?.enabled);
    const tempoLaneVisible = useTimelineStore((s) => s.timeline.tempoAutomation?.laneVisible !== false);
    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const crossTrackDrag = useTimelineStore((s) => s._crossTrackDrag);
    const midiCache = useTimelineStore((s) => s.midiCache);
    const clipTimelineSelection = useSelectionStore((s) => s.clipTimelineSelection);
    const midiTracks = useTimelineStore((s) => s.tracks);
    const audioCache = useTimelineStore((s) => s.audioCache);
    const timelineTiming = useTimelineStore((s) => s.timeline);

    useEffect(() => {
        const handleDesktopDrop = (event: Event) => {
            const { category, file } = (event as CustomEvent<{ category: string; file: File }>).detail ?? {};
            if (!file) return;
            if (category === 'midi')
                void addMidiTrack({ name: file.name.replace(/\.[^/.]+$/, ''), file, offsetTicks: 0 });
            if (category === 'audio') {
                void addAudioTrack({ name: file.name.replace(/\.[^/.]+$/, ''), file, offsetTicks: 0 }).catch(
                    (error) => {
                        alert(
                            `Unable to import ${file.name}. ${error instanceof Error ? error.message : String(error)}`
                        );
                    }
                );
            }
        };
        window.addEventListener('mvmnt-dropped-media', handleDesktopDrop);
        return () => window.removeEventListener('mvmnt-dropped-media', handleDesktopDrop);
    }, [addAudioTrack, addMidiTrack]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWidth(Math.max(1, Math.floor(entry.contentRect.width)));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const lanesHeight =
        activeTab === 'clips'
            ? trackIds.length > 0
                ? rowHeight * Math.max(1, trackIds.length)
                : Math.max(120, rowHeight)
            : 120;

    const [containerHeight, setContainerHeight] = useState(0);
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setContainerHeight(Math.max(0, Math.round(el.getBoundingClientRect().height)));
        update();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(update);
            observer.observe(el);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const effectiveHeight = Math.max(lanesHeight, containerHeight);
    const playheadX = toX(currentTick, Math.max(1, width));

    // Compute selection overlay entries (one per row segment)
    type OverlayEntry =
        | { type: 'point'; left: number; top: number; height: number }
        | { type: 'range'; left: number; top: number; width: number; height: number };

    const selectionOverlays: OverlayEntry[] = (() => {
        if (activeTab !== 'clips' || !clipTimelineSelection) return [];
        const w = Math.max(1, width);
        if (clipTimelineSelection.type === 'point') {
            const rowIndex = trackIds.indexOf(clipTimelineSelection.point.trackId);
            if (rowIndex < 0) return [];
            return [
                {
                    type: 'point' as const,
                    left: toX(clipTimelineSelection.point.tick, w),
                    top: rowIndex * rowHeight,
                    height: rowHeight,
                },
            ];
        }
        if (clipTimelineSelection.type === 'range') {
            const selectedIndexes = clipTimelineSelection.range.trackIds
                .map((id) => trackIds.indexOf(id))
                .filter((index) => index >= 0)
                .sort((a, b) => a - b);
            if (!selectedIndexes.length) return [];
            const left = toX(clipTimelineSelection.range.startTick, w);
            const right = toX(clipTimelineSelection.range.endTick, w);
            const first = selectedIndexes[0];
            const last = selectedIndexes[selectedIndexes.length - 1];
            return [
                {
                    type: 'range' as const,
                    left: Math.min(left, right),
                    top: first * rowHeight,
                    width: Math.max(1, Math.abs(right - left)),
                    height: (last - first + 1) * rowHeight,
                },
            ];
        }
        if (clipTimelineSelection.type === 'clips') {
            // Per-track segments: one highlight per track that has selected clips
            const segmentsByTrack = new Map<string, { minTick: number; maxTick: number }>();
            for (const ref of clipTimelineSelection.clips) {
                const track = midiTracks[ref.trackId];
                if (!track) continue;
                const kind = ref.kind ?? track.type;
                const clip =
                    kind === 'midi' && track.type === 'midi'
                        ? track.clips?.find((c) => c.id === ref.clipId)
                        : kind === 'audio' && track.type === 'audio'
                          ? track.clips?.find((c) => c.id === ref.clipId)
                          : undefined;
                if (!clip) continue;
                const bounds =
                    kind === 'midi'
                        ? getMidiClipLocalBounds(midiCache, clip as any)
                        : getAudioClipTimelineBounds(audioCache, clip as any, createTimingContext(timelineTiming));
                if (!bounds) continue;
                const abStart = kind === 'midi' ? clip.offsetTicks + bounds.startTick : bounds.startTick;
                const abEnd = kind === 'midi' ? clip.offsetTicks + bounds.endTick : bounds.endTick;
                const seg = segmentsByTrack.get(ref.trackId);
                if (seg) {
                    seg.minTick = Math.min(seg.minTick, abStart);
                    seg.maxTick = Math.max(seg.maxTick, abEnd);
                } else {
                    segmentsByTrack.set(ref.trackId, { minTick: abStart, maxTick: abEnd });
                }
            }
            const result: OverlayEntry[] = [];
            for (const [tId, seg] of segmentsByTrack) {
                const rowIndex = trackIds.indexOf(tId);
                if (rowIndex < 0) continue;
                result.push({
                    type: 'range',
                    left: toX(seg.minTick, w),
                    top: rowIndex * rowHeight,
                    width: Math.max(1, toX(seg.maxTick, w) - toX(seg.minTick, w)),
                    height: rowHeight,
                });
            }
            return result;
        }
        return [];
    })();

    const rawRange = Math.max(1, view.endTick - view.startTick);
    const pad = Math.max(1, Math.floor(rawRange * 0.01));
    const dispStart = view.startTick - pad;
    const dispEnd = view.endTick + pad;

    const { marquee, onBackgroundPointerDown, onBackgroundPointerMove, onBackgroundPointerUp } = useMarqueeSelect({
        containerRef,
        trackIds,
        width,
        activeTab,
    });

    // DnD: drop MIDI/audio files at snapped tick positions
    const onDragOver = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const snapped = snapTicks(toTick(x, width), e.ctrlKey || e.metaKey, true);
            setHoverX(toX(snapped, width));
        },
        [snapTicks, toTick, toX, width]
    );

    const onDragLeave = useCallback(() => setHoverX(null), []);

    const onDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const offsetTicks = Math.max(0, snapTicks(toTick(x, width), e.ctrlKey || e.metaKey, true));

            const unique: File[] = [];
            const seen = new Set<string>();
            for (const file of Array.from(e.dataTransfer.files || [])) {
                const key = `${file.name}__${file.size}__${file.lastModified}__${file.type}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(file);
                }
            }

            const midiFiles = unique.filter(isMidiFile);
            const audioFiles = unique.filter((f) => !isMidiFile(f) && isAudioFile(f));
            const ignored = unique.length - midiFiles.length - audioFiles.length;

            for (const midi of midiFiles) {
                await addMidiTrack({ name: midi.name.replace(/\.[^/.]+$/, ''), file: midi, offsetTicks });
            }
            for (const audio of audioFiles) {
                try {
                    await addAudioTrack({ name: audio.name.replace(/\.[^/.]+$/, ''), file: audio, offsetTicks });
                } catch (error) {
                    console.error('Failed to import audio track', error);
                    const reason =
                        error instanceof Error
                            ? error.message
                            : 'The format may be unsupported or the file may be corrupted.';
                    alert(`Unable to import ${audio.name}. ${reason}`);
                }
            }
            if (ignored > 0) {
                alert(
                    `Ignored ${ignored} file${ignored > 1 ? 's' : ''}. Only MIDI (.mid/.midi) and common audio formats are supported.`
                );
            }
            setHoverX(null);
        },
        [addMidiTrack, addAudioTrack, snapTicks, toTick, toX, width]
    );

    // Cross-track drag: ghost clips and row highlight
    const targetRowIndex = crossTrackDrag ? trackIds.indexOf(crossTrackDrag.targetTrackId) : -1;
    const w = Math.max(1, width);

    return (
        <div
            className="timeline-lanes relative border-t border-neutral-800 bg-neutral-900/40"
            ref={containerRef}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onBackgroundPointerMove}
            onPointerUp={onBackgroundPointerUp}
            style={{ minHeight: lanesHeight, width: '100%', transform: 'translateY(-1px)' }}
        >
            <GridLines width={width} height={effectiveHeight} startTick={dispStart} endTick={dispEnd} />

            {hoverX != null && (
                <div
                    className="absolute top-0 bottom-0 border-l border-blue-300/70 pointer-events-none"
                    style={{ left: hoverX }}
                />
            )}

            {selectionOverlays.map((ov, i) =>
                ov.type === 'range' ? (
                    <div
                        key={i}
                        className="absolute z-20 bg-cyan-300/10 border border-cyan-300/70 pointer-events-none"
                        style={{ left: ov.left, top: ov.top, width: ov.width, height: ov.height }}
                    />
                ) : (
                    <div
                        key={i}
                        className="absolute z-20 border-l-2 border-cyan-300 pointer-events-none"
                        style={{ left: ov.left, top: ov.top, height: ov.height }}
                    />
                )
            )}

            {activeTab === 'clips' && (
                <div className="relative">
                    {/* Cross-track drag: target row highlight */}
                    {crossTrackDrag && targetRowIndex >= 0 && (
                        <div
                            className="absolute z-10 bg-sky-400/15 border-y border-sky-400/50 pointer-events-none"
                            style={{ top: targetRowIndex * rowHeight, height: rowHeight, left: 0, right: 0 }}
                        />
                    )}
                    {trackIds.map((id, idx) => (
                        <div
                            key={id}
                            className={`relative ${
                                midiTracks[id]?.type === 'audio'
                                    ? idx % 2 === 0
                                        ? 'bg-emerald-950/20'
                                        : 'bg-emerald-950/15'
                                    : idx % 2 === 0
                                      ? 'bg-sky-950/20'
                                      : 'bg-sky-950/15'
                            }`}
                            style={{ height: rowHeight }}
                        >
                            <div className="absolute left-0 right-0 bottom-0 border-b border-neutral-800" />
                            <TrackRowBlock
                                trackId={id}
                                trackIndex={idx}
                                laneWidth={width}
                                laneHeight={rowHeight}
                                onHoverSnapX={setHoverX}
                            />
                        </div>
                    ))}
                    {/* Cross-track drag: ghost clips */}
                    {crossTrackDrag &&
                        crossTrackDrag.previews.map((preview) => {
                            const tIdx = trackIds.indexOf(preview.targetTrackId);
                            if (tIdx < 0) return null;
                            const kind = preview.kind ?? crossTrackDrag.kind ?? 'midi';
                            const localBounds =
                                kind === 'midi'
                                    ? getMidiClipLocalBounds(midiCache, {
                                          id: preview.clipId,
                                          type: 'midi',
                                          sourceId: preview.sourceId,
                                          offsetTicks: preview.previewOffsetTicks,
                                          regionStartTick: preview.regionStartTick,
                                          regionEndTick: preview.regionEndTick,
                                      })
                                    : getAudioClipTimelineBounds(
                                          audioCache,
                                          {
                                              id: preview.clipId,
                                              type: 'audio',
                                              sourceId: preview.sourceId,
                                              offsetTicks: preview.previewOffsetTicks,
                                              sourceStartSeconds: (preview as any).sourceStartSeconds,
                                              sourceEndSeconds: (preview as any).sourceEndSeconds,
                                          },
                                          createTimingContext(timelineTiming)
                                      );
                            if (!localBounds) return null;
                            const absStart =
                                kind === 'midi'
                                    ? preview.previewOffsetTicks + localBounds.startTick
                                    : localBounds.startTick;
                            const absEnd =
                                kind === 'midi'
                                    ? preview.previewOffsetTicks + localBounds.endTick
                                    : localBounds.endTick;
                            const leftPx = toX(absStart, w);
                            const rightPx = toX(absEnd, w);
                            const wPx = Math.max(8, rightPx - leftPx);
                            const clipHeight = Math.max(18, rowHeight * 0.6);
                            return (
                                <div
                                    key={`ghost-${preview.clipId}`}
                                    className={`absolute z-30 rounded border pointer-events-none ${kind === 'audio' ? 'border-emerald-200/80 bg-emerald-500/50' : 'border-sky-200/80 bg-sky-500/50'}`}
                                    style={{
                                        left: leftPx,
                                        top: tIdx * rowHeight + (rowHeight - clipHeight) / 2,
                                        width: wPx,
                                        height: clipHeight,
                                    }}
                                />
                            );
                        })}
                </div>
            )}

            {activeTab === 'automation' && (
                <div className="relative">
                    <AutomationLanes width={width} />
                </div>
            )}

            {activeTab === 'automation' && (
                <div className="relative border-t border-neutral-700">
                    <div className="border-b border-neutral-800" style={{ height: AUTOMATION_HEADER_HEIGHT }} />
                    {tempoEnabled && tempoLaneVisible && (
                        <div style={{ height: TEMPO_LANE_HEIGHT }}>
                            <TempoAutomationLane width={width} height={TEMPO_LANE_HEIGHT} />
                        </div>
                    )}
                </div>
            )}

            <div
                className="absolute top-0 bottom-0 w-0 border-l border-red-400 pointer-events-none"
                style={{ left: playheadX }}
            />

            {activeTab === 'clips' && marquee && (
                <div
                    className="absolute z-30 bg-cyan-300/10 border border-cyan-300/70 pointer-events-none"
                    style={{
                        left: Math.min(marquee.x1, marquee.x2),
                        top: Math.min(marquee.y1, marquee.y2),
                        width: Math.abs(marquee.x2 - marquee.x1),
                        height: Math.max(1, Math.abs(marquee.y2 - marquee.y1)),
                    }}
                />
            )}
        </div>
    );
};

export default TrackLanes;
