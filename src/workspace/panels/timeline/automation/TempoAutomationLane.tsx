import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from '../hooks/useTickScale';
import { AUTOMATION_HEADER_HEIGHT } from '../constants';
import { useSnapTicks } from '../hooks/useSnapTicks';

const DIAMOND_SIZE = 7;
const PADDING_Y = 12;
const BPM_MIN = 20;
const BPM_MAX = 400;
const TICK_TOLERANCE = 1;

interface TempoAutomationLaneProps {
    width: number;
    height: number;
}

interface DragState {
    tick: number;
    bpm: number;
    startX: number;
    startY: number;
    moved: boolean;
}

const isBasePoint = (tick: number) => Math.abs(tick) <= TICK_TOLERANCE;

/** A compact, step-only editor for the project's master tempo map. */
const TempoAutomationLane: React.FC<TempoAutomationLaneProps> = ({ width, height }) => {
    const tempoAutomation = useTimelineStore((s) => s.timeline.tempoAutomation);
    const addTempoKeyframe = useTimelineStore((s) => s.addTempoKeyframe);
    const removeTempoKeyframe = useTimelineStore((s) => s.removeTempoKeyframe);
    const updateTempoKeyframe = useTimelineStore((s) => s.updateTempoKeyframe);
    const { toX, toTick } = useTickScale();
    const snapTick = useSnapTicks();
    const keyframes = tempoAutomation?.keyframes ?? [];
    const chartHeight = Math.max(40, height - AUTOMATION_HEADER_HEIGHT);

    const [selectedTick, setSelectedTick] = useState<number | null>(null);
    const [drag, setDrag] = useState<DragState | null>(null);
    const [draft, setDraft] = useState<{ tick: number; bpm: number } | null>(null);
    const [bpmRange, setBpmRange] = useState({ min: 60, max: 180 });
    const [menu, setMenu] = useState<{ tick: number; x: number; y: number } | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const laneRef = useRef<HTMLDivElement>(null);
    const initialRangeSet = useRef(false);

    const selected = keyframes.find(
        (kf) => selectedTick !== null && Math.abs(kf.tick - selectedTick) <= TICK_TOLERANCE
    );

    const fitBpmRange = useCallback(() => {
        const bpms = keyframes.map((kf) => kf.bpm);
        if (!bpms.length) return setBpmRange({ min: 60, max: 180 });
        const low = Math.min(...bpms);
        const high = Math.max(...bpms);
        const padding = Math.max(10, (high - low) * 0.2);
        setBpmRange({
            min: Math.max(BPM_MIN, Math.floor(low - padding)),
            max: Math.min(BPM_MAX, Math.ceil(high + padding)),
        });
    }, [keyframes]);

    // Fit imported/existing maps once, then keep the ruler stable while users edit.
    useEffect(() => {
        if (!keyframes.length) {
            initialRangeSet.current = false;
            return;
        }
        if (!initialRangeSet.current) {
            initialRangeSet.current = true;
            fitBpmRange();
        }
    }, [fitBpmRange, keyframes.length]);

    const range = Math.max(1, bpmRange.max - bpmRange.min);
    const bpmToY = useCallback(
        (bpm: number) => chartHeight - PADDING_Y - ((bpm - bpmRange.min) / range) * (chartHeight - PADDING_Y * 2),
        [bpmRange.min, chartHeight, range]
    );
    const yToBpm = useCallback(
        (y: number) => bpmRange.min + ((chartHeight - PADDING_Y - y) / (chartHeight - PADDING_Y * 2)) * range,
        [bpmRange.min, chartHeight, range]
    );

    const curvePath = useMemo(() => {
        if (!keyframes.length) return '';
        return keyframes
            .reduce<string[]>((segments, kf, index) => {
                const x = toX(kf.tick, width);
                const y = bpmToY(kf.bpm);
                if (index === 0) segments.push(`M 0 ${y} L ${x} ${y}`);
                if (index > 0) segments.push(`L ${x} ${bpmToY(keyframes[index - 1].bpm)} L ${x} ${y}`);
                segments.push(`L ${index < keyframes.length - 1 ? toX(keyframes[index + 1].tick, width) : width} ${y}`);
                return segments;
            }, [])
            .join(' ');
    }, [bpmToY, keyframes, toX, width]);

    const gridLines = useMemo(() => {
        const step = range > 160 ? 40 : range > 80 ? 20 : 10;
        const first = Math.ceil(bpmRange.min / step) * step;
        const lines: number[] = [];
        for (let bpm = first; bpm <= bpmRange.max; bpm += step) lines.push(bpm);
        return lines;
    }, [bpmRange.max, bpmRange.min, range]);

    const selectAtTick = useCallback((tick: number) => {
        setSelectedTick(tick);
        setMenu(null);
        laneRef.current?.focus({ preventScroll: true });
    }, []);

    const handleDoubleClick = useCallback(
        (event: React.MouseEvent) => {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const tick = snapTick(toTick(event.clientX - rect.left, width), event.ctrlKey || event.metaKey);
            const existing = keyframes.find((kf) => Math.abs(kf.tick - tick) <= TICK_TOLERANCE);
            if (existing) return selectAtTick(existing.tick);
            const bpm = Math.round(Math.max(1, Math.min(999, yToBpm(event.clientY - rect.top))));
            addTempoKeyframe(tick, bpm);
            selectAtTick(tick);
        },
        [addTempoKeyframe, keyframes, selectAtTick, snapTick, toTick, width, yToBpm]
    );

    const handlePointerDown = useCallback((event: React.PointerEvent, tick: number, bpm: number) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        svgRef.current?.setPointerCapture(event.pointerId);
        laneRef.current?.focus({ preventScroll: true });
        setDrag({ tick, bpm, startX: event.clientX, startY: event.clientY, moved: false });
        setDraft({ tick, bpm });
    }, []);

    const handlePointerMove = useCallback(
        (event: React.PointerEvent) => {
            if (!drag || !svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!drag.moved && Math.max(Math.abs(dx), Math.abs(dy)) < 3) return;
            if (!drag.moved) setDrag((current) => (current ? { ...current, moved: true } : current));
            const constrainHorizontal = event.shiftKey && Math.abs(dx) >= Math.abs(dy);
            const constrainVertical = event.shiftKey && Math.abs(dy) > Math.abs(dx);
            const tick =
                isBasePoint(drag.tick) || constrainVertical
                    ? drag.tick
                    : snapTick(toTick(event.clientX - rect.left, width), event.ctrlKey || event.metaKey);
            const bpm = constrainHorizontal
                ? drag.bpm
                : Math.round(Math.max(1, Math.min(999, yToBpm(event.clientY - rect.top))));
            setDraft({ tick, bpm });
        },
        [drag, snapTick, toTick, width, yToBpm]
    );

    const finishDrag = useCallback(() => {
        if (!drag || !draft) return;
        if (!drag.moved) {
            selectAtTick(drag.tick);
            setDrag(null);
            setDraft(null);
            return;
        }
        const changed = drag.tick !== draft.tick || drag.bpm !== draft.bpm;
        if (changed && !updateTempoKeyframe(drag.tick, draft)) {
            setStatus('A tempo point already exists at that position.');
            window.setTimeout(() => setStatus(null), 2200);
        } else if (changed) {
            setSelectedTick(draft.tick);
        }
        setDrag(null);
        setDraft(null);
    }, [drag, draft, selectAtTick, updateTempoKeyframe]);

    const deleteSelected = useCallback(() => {
        if (!selected || isBasePoint(selected.tick)) return;
        removeTempoKeyframe(selected.tick);
        setSelectedTick(null);
        setMenu(null);
    }, [removeTempoKeyframe, selected]);

    const updateSelected = useCallback(
        (next: Partial<{ tick: number; bpm: number }>) => {
            if (!selected) return;
            const tick = next.tick ?? selected.tick;
            const bpm = next.bpm ?? selected.bpm;
            if (!Number.isFinite(tick) || !Number.isFinite(bpm)) return;
            const result = updateTempoKeyframe(selected.tick, { tick, bpm });
            if (result && next.tick != null) setSelectedTick(tick);
        },
        [selected, updateTempoKeyframe]
    );

    useEffect(() => {
        const onPointerUp = () => finishDrag();
        window.addEventListener('pointerup', onPointerUp);
        return () => window.removeEventListener('pointerup', onPointerUp);
    }, [finishDrag]);

    return (
        <div
            ref={laneRef}
            className="relative h-full w-full outline-none"
            tabIndex={0}
            onKeyDown={(event) => {
                if ((event.key === 'Delete' || event.key === 'Backspace') && selected && !isBasePoint(selected.tick)) {
                    event.preventDefault();
                    deleteSelected();
                }
                if (event.key === 'Escape') {
                    setSelectedTick(null);
                    setMenu(null);
                }
            }}
        >
            <div className="border-b border-neutral-800" style={{ height: AUTOMATION_HEADER_HEIGHT }} />
            <svg
                ref={svgRef}
                width={width}
                height={chartHeight}
                className="block"
                onDoubleClick={handleDoubleClick}
                onPointerMove={handlePointerMove}
                onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        setSelectedTick(null);
                        setMenu(null);
                    }
                }}
            >
                {gridLines.map((bpm) => (
                    <g key={bpm}>
                        <line x1={0} x2={width} y1={bpmToY(bpm)} y2={bpmToY(bpm)} stroke="rgba(255,255,255,0.06)" />
                        <text x={4} y={bpmToY(bpm) - 2} className="fill-neutral-600 text-[8px] select-none">
                            {bpm}
                        </text>
                    </g>
                ))}
                {curvePath && (
                    <path
                        d={curvePath}
                        fill="none"
                        stroke="rgba(251,191,36,0.55)"
                        strokeWidth={1.5}
                        className="pointer-events-none"
                    />
                )}
                {curvePath && (
                    <path
                        d={`${curvePath} L ${width} ${chartHeight} L 0 ${chartHeight} Z`}
                        fill="rgba(251,191,36,0.06)"
                        className="pointer-events-none"
                    />
                )}
                {keyframes.map((kf) => {
                    const point = drag && draft && drag.tick === kf.tick ? draft : kf;
                    const x = toX(point.tick, width);
                    const y = bpmToY(point.bpm);
                    const active = selectedTick !== null && Math.abs(point.tick - selectedTick) <= TICK_TOLERANCE;
                    const base = isBasePoint(kf.tick);
                    return (
                        <g key={kf.tick}>
                            <rect
                                x={x - 11}
                                y={y - 11}
                                width={22}
                                height={22}
                                fill="transparent"
                                className={base ? 'cursor-ns-resize' : 'cursor-grab'}
                                onPointerDown={(event) => handlePointerDown(event, kf.tick, kf.bpm)}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    selectAtTick(kf.tick);
                                    if (!base) setMenu({ tick: kf.tick, x: event.clientX, y: event.clientY });
                                }}
                            />
                            <path
                                d={`M${x} ${y - DIAMOND_SIZE} L${x + DIAMOND_SIZE} ${y} L${x} ${y + DIAMOND_SIZE} L${x - DIAMOND_SIZE} ${y} Z`}
                                fill={active ? '#fbbf24' : 'rgba(251,191,36,0.65)'}
                                stroke={active ? '#f59e0b' : 'rgba(251,191,36,0.45)'}
                                strokeWidth={active ? 2 : 1}
                                className="pointer-events-none"
                            />
                            <text
                                x={x}
                                y={y - 12}
                                textAnchor="middle"
                                className={`text-[9px] select-none pointer-events-none ${active ? 'fill-white' : 'fill-neutral-400'}`}
                            >
                                {Math.round(point.bpm * 10) / 10}
                            </text>
                        </g>
                    );
                })}
                {keyframes.length === 0 && (
                    <text
                        x={width / 2}
                        y={chartHeight / 2}
                        textAnchor="middle"
                        className="fill-neutral-500 text-[11px] select-none"
                    >
                        Double-click to add a tempo change
                    </text>
                )}
            </svg>

            <button
                type="button"
                onClick={fitBpmRange}
                className="absolute bottom-1 left-1 rounded border border-neutral-700 bg-neutral-900/90 px-1.5 py-0.5 text-[8px] text-neutral-400 hover:text-neutral-200"
            >
                Fit BPM
            </button>
            {selected && (
                <div
                    key={selected.tick}
                    className="absolute right-2 top-1 flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900/95 px-1.5 py-1 text-[9px] shadow-lg"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="text-amber-300">
                        {isBasePoint(selected.tick) ? 'Bar 1 base' : `Tick ${selected.tick}`}
                    </span>
                    {!isBasePoint(selected.tick) && (
                        <input
                            aria-label="Tempo point tick"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={selected.tick}
                            className="w-14 rounded bg-neutral-800 px-1 text-white"
                            onBlur={(event) => updateSelected({ tick: Number(event.target.value) })}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.currentTarget.blur();
                            }}
                        />
                    )}
                    <input
                        aria-label="Tempo point BPM"
                        type="number"
                        min={1}
                        max={999}
                        step={0.1}
                        defaultValue={selected.bpm}
                        className="w-12 rounded bg-neutral-800 px-1 text-white"
                        onBlur={(event) => updateSelected({ bpm: Number(event.target.value) })}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                    />
                    {!isBasePoint(selected.tick) && (
                        <button type="button" onClick={deleteSelected} className="text-red-300 hover:text-red-100">
                            Delete
                        </button>
                    )}
                </div>
            )}
            {menu && (
                <button
                    type="button"
                    className="fixed z-50 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-left text-[11px] text-red-300 shadow-xl hover:bg-red-900/40"
                    style={{ left: menu.x, top: menu.y }}
                    onClick={deleteSelected}
                >
                    Delete tempo change
                </button>
            )}
            {status && (
                <div className="absolute bottom-1 right-2 rounded bg-neutral-900 px-2 py-1 text-[9px] text-amber-200 shadow">
                    {status}
                </div>
            )}
        </div>
    );
};

export default TempoAutomationLane;
