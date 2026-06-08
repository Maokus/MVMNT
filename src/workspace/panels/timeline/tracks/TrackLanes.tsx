import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from '../hooks/useTickScale';
import { useSnapTicks } from '../hooks/useSnapTicks';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import { isMidiFile, isAudioFile } from '../utils/fileTypeUtils';
import AutomationLanes from '../automation/AutomationLanes';
import TempoAutomationLane from '../automation/TempoAutomationLane';
import { AUTOMATION_HEADER_HEIGHT, TEMPO_LANE_HEIGHT } from '../constants';
import GridLines from './GridLines';
import TrackRowBlock from './TrackRowBlock';

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

    const lanesHeight = activeTab === 'clips'
        ? (trackIds.length > 0 ? rowHeight * Math.max(1, trackIds.length) : Math.max(120, rowHeight))
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

    const rawRange = Math.max(1, view.endTick - view.startTick);
    const pad = Math.max(1, Math.floor(rawRange * 0.01));
    const dispStart = view.startTick - pad;
    const dispEnd = view.endTick + pad;

    const { marquee, onBackgroundPointerDown, onBackgroundPointerMove, onBackgroundPointerUp } =
        useMarqueeSelect({ containerRef, trackIds, width, activeTab });

    // DnD: drop MIDI/audio files at snapped tick positions
    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const snapped = snapTicks(toTick(x, width), e.ctrlKey || e.metaKey, true);
        setHoverX(toX(snapped, width));
    }, [snapTicks, toTick, toX, width]);

    const onDragLeave = useCallback(() => setHoverX(null), []);

    const onDrop = useCallback(async (e: React.DragEvent) => {
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
            if (!seen.has(key)) { seen.add(key); unique.push(file); }
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
                const reason = error instanceof Error ? error.message : 'The format may be unsupported or the file may be corrupted.';
                alert(`Unable to import ${audio.name}. ${reason}`);
            }
        }
        if (ignored > 0) {
            alert(`Ignored ${ignored} file${ignored > 1 ? 's' : ''}. Only MIDI (.mid/.midi) and common audio formats are supported.`);
        }
        setHoverX(null);
    }, [addMidiTrack, addAudioTrack, snapTicks, toTick, toX, width]);

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
                <div className="absolute top-0 bottom-0 border-l border-blue-300/70 pointer-events-none" style={{ left: hoverX }} />
            )}

            {activeTab === 'clips' && (
                <div className="relative">
                    {trackIds.map((id, idx) => (
                        <div
                            key={id}
                            className={`relative ${idx % 2 === 0 ? 'bg-neutral-800/15' : 'bg-neutral-800/5'}`}
                            style={{ height: rowHeight }}
                        >
                            <div className="absolute left-0 right-0 bottom-0 border-b border-neutral-800" />
                            <TrackRowBlock trackId={id} laneWidth={width} laneHeight={rowHeight} onHoverSnapX={setHoverX} />
                        </div>
                    ))}
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

            <div className="absolute top-0 bottom-0 w-0 border-l border-red-400 pointer-events-none" style={{ left: playheadX }} />

            {activeTab === 'clips' && marquee && (
                <div
                    className="absolute top-0 bottom-0 bg-blue-400/10 border-x border-blue-400 pointer-events-none"
                    style={{ left: Math.min(marquee.x1, marquee.x2), width: Math.abs(marquee.x2 - marquee.x1) }}
                />
            )}
        </div>
    );
};

export default TrackLanes;
