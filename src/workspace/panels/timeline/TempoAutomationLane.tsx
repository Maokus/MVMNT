import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useFloating, autoUpdate, flip, shift, offset, FloatingPortal } from '@floating-ui/react';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from './useTickScale';
import { AUTOMATION_HEADER_HEIGHT } from './constants';
import TempoKeyframeLabel from './TempoKeyframeLabel';
import type { TempoKeyframe } from '@core/timing/types';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { quantizeSettingToBeats } from '@state/timeline/quantize';

const DIAMOND_SIZE = 7;
const PADDING_Y = 12;
const BPM_CLAMP_MIN = 20;
const BPM_CLAMP_MAX = 400;
const BPM_PADDING = 20;

interface DragState {
    kfIndex: number;
    startClientX: number;
    startClientY: number;
    startTick: number;
    startBpm: number;
    axis: 'none' | 'horizontal' | 'vertical';
}

interface TempoAutomationLaneProps {
    width: number;
    height: number;
}

const TempoAutomationLane: React.FC<TempoAutomationLaneProps> = ({ width, height }) => {
    const tempoAutomation = useTimelineStore((s) => s.timeline.tempoAutomation);
    const addTempoKeyframe = useTimelineStore((s) => s.addTempoKeyframe);
    const removeTempoKeyframe = useTimelineStore((s) => s.removeTempoKeyframe);
    const moveTempoKeyframe = useTimelineStore((s) => s.moveTempoKeyframe);
    const updateTempoKeyframeBpm = useTimelineStore((s) => s.updateTempoKeyframeBpm);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const ppq = CANONICAL_PPQ;
    const { toX, toTick } = useTickScale();

    const snapTick = useCallback(
        (candidateTick: number, altKey?: boolean) => {
            if (altKey) return Math.max(0, Math.round(candidateTick));
            if (quantize === 'off') return Math.max(0, Math.round(candidateTick));
            const beatLength = quantizeSettingToBeats(quantize, bpb);
            if (!beatLength) return Math.max(0, Math.round(candidateTick));
            const resolution = Math.max(1, Math.round(beatLength * ppq));
            return Math.max(0, Math.round(candidateTick / resolution) * resolution);
        },
        [quantize, bpb, ppq],
    );

    const keyframes = tempoAutomation?.keyframes ?? [];
    const [selectedTick, setSelectedTick] = useState<number | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [draftPos, setDraftPos] = useState<{ tick: number; bpm: number } | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    // Live refs so global pointerup handler always sees latest drag state
    const dragStateRef = useRef<DragState | null>(null);
    const draftPosRef = useRef<{ tick: number; bpm: number } | null>(null);
    dragStateRef.current = dragState;
    draftPosRef.current = draftPos;

    // Context menu
    const [interpNotAvailMenu, setInterpNotAvailMenu] = useState<{ tick?: number } | null>(null);

    const { refs: interpRefs, floatingStyles: interpFloatingStyles } = useFloating({
        open: interpNotAvailMenu !== null,
        placement: 'bottom-start',
        middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
    });

    useEffect(() => {
        if (!interpNotAvailMenu) return;
        const close = (e: PointerEvent) => {
            const el = interpRefs.floating.current;
            if (el && el.contains(e.target as Node)) return;
            setInterpNotAvailMenu(null);
        };
        window.addEventListener('pointerdown', close, true);
        return () => window.removeEventListener('pointerdown', close, true);
    }, [interpNotAvailMenu, interpRefs.floating]);

    // BPM axis range (auto-fit)
    const { bpmMin, bpmMax } = useMemo(() => {
        if (keyframes.length === 0) return { bpmMin: 100, bpmMax: 140 };
        const bpms = keyframes.map((kf) => kf.bpm);
        const rawMin = Math.min(...bpms);
        const rawMax = Math.max(...bpms);
        return {
            bpmMin: Math.max(BPM_CLAMP_MIN, rawMin - BPM_PADDING),
            bpmMax: Math.min(BPM_CLAMP_MAX, rawMax + BPM_PADDING),
        };
    }, [keyframes]);

    const bpmRange = Math.max(1, bpmMax - bpmMin);

    const bpmToY = useCallback(
        (bpm: number) => {
            const t = (bpm - bpmMin) / bpmRange;
            return height - PADDING_Y - t * (height - 2 * PADDING_Y);
        },
        [bpmMin, bpmRange, height],
    );

    const yToBpm = useCallback(
        (y: number) => {
            const t = (height - PADDING_Y - y) / (height - 2 * PADDING_Y);
            return bpmMin + t * bpmRange;
        },
        [bpmMin, bpmRange, height],
    );

    // Build stepped curve path
    const curvePath = useMemo(() => {
        if (keyframes.length === 0) return '';
        const segments: string[] = [];
        for (let i = 0; i < keyframes.length; i++) {
            const kf = keyframes[i];
            const x = toX(kf.tick, width);
            const y = bpmToY(kf.bpm);
            if (i === 0) {
                // Start from left edge at first BPM
                segments.push(`M 0 ${y}`);
                segments.push(`L ${x} ${y}`);
            }
            // Vertical transition to this BPM
            if (i > 0) {
                segments.push(`L ${x} ${bpmToY(keyframes[i - 1].bpm)}`);
                segments.push(`L ${x} ${y}`);
            }
            // Horizontal hold line to next keyframe or right edge
            const nextX = i < keyframes.length - 1 ? toX(keyframes[i + 1].tick, width) : width;
            segments.push(`L ${nextX} ${y}`);
        }
        return segments.join(' ');
    }, [keyframes, toX, width, bpmToY]);

    // BPM gridlines
    const gridLines = useMemo(() => {
        const lines: number[] = [];
        const step = bpmRange > 200 ? 40 : bpmRange > 100 ? 20 : 10;
        const start = Math.ceil(bpmMin / step) * step;
        for (let bpm = start; bpm <= bpmMax; bpm += step) {
            lines.push(bpm);
        }
        return lines;
    }, [bpmMin, bpmMax, bpmRange]);

    // Get the keyframes to render (applying draft position if dragging)
    const renderKeyframes = useMemo((): TempoKeyframe[] => {
        if (!dragState || !draftPos) return keyframes;
        return keyframes.map((kf, i) =>
            i === dragState.kfIndex ? { tick: draftPos.tick, bpm: draftPos.bpm } : kf,
        );
    }, [keyframes, dragState, draftPos]);

    // Double-click to add
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest('[data-kf]')) return;
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const tick = snapTick(toTick(localX, width), e.altKey);
            const bpm = Math.max(1, Math.min(999, Math.round(yToBpm(localY))));
            addTempoKeyframe(tick, bpm);
        },
        [toTick, width, yToBpm, addTempoKeyframe],
    );

    // Diamond pointer down (drag start)
    const handleDiamondPointerDown = useCallback(
        (e: React.PointerEvent, kfIndex: number) => {
            e.stopPropagation();
            e.preventDefault();
            const target = e.currentTarget as SVGElement;
            target.setPointerCapture(e.pointerId);
            const kf = keyframes[kfIndex];
            setSelectedTick(kf.tick);
            setDragState({
                kfIndex,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startTick: kf.tick,
                startBpm: kf.bpm,
                axis: 'none',
            });
            setDraftPos({ tick: kf.tick, bpm: kf.bpm });
        },
        [keyframes],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragState || !svgRef.current) return;
            const dx = e.clientX - dragState.startClientX;
            const dy = e.clientY - dragState.startClientY;

            // Determine axis lock after threshold
            let axis = dragState.axis;
            if (axis === 'none' && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
                axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
                setDragState((prev) => prev ? { ...prev, axis } : prev);
            }

            const rect = svgRef.current.getBoundingClientRect();
            let newTick = dragState.startTick;
            let newBpm = dragState.startBpm;

            if (axis === 'horizontal' || axis === 'none') {
                const localX = e.clientX - rect.left;
                newTick = snapTick(toTick(localX, width), e.altKey);
            }
            if (axis === 'vertical' || axis === 'none') {
                const localY = e.clientY - rect.top;
                newBpm = Math.max(1, Math.min(999, Math.round(yToBpm(localY))));
            }

            setDraftPos({ tick: newTick, bpm: newBpm });
        },
        [dragState, toTick, width, yToBpm],
    );

    const handlePointerUp = useCallback(
        (_e: React.PointerEvent) => {
            if (!dragState || !draftPos) {
                setDragState(null);
                setDraftPos(null);
                return;
            }

            const kf = keyframes[dragState.kfIndex];
            if (kf) {
                // Commit the drag
                if (draftPos.tick !== kf.tick) {
                    moveTempoKeyframe(kf.tick, draftPos.tick);
                }
                if (draftPos.bpm !== kf.bpm) {
                    // After move, the keyframe is at draftPos.tick
                    updateTempoKeyframeBpm(draftPos.tick, draftPos.bpm);
                }
            }

            // Null refs immediately so the global window pointerup handler won't double-commit
            dragStateRef.current = null;
            draftPosRef.current = null;
            setDragState(null);
            setDraftPos(null);
        },
        [dragState, draftPos, keyframes, moveTempoKeyframe, updateTempoKeyframeBpm],
    );

    // Context menu
    const handleContextMenu = useCallback(
        (e: React.MouseEvent, tick: number) => {
            e.preventDefault();
            e.stopPropagation();
            interpRefs.setReference({ getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0) });
            setInterpNotAvailMenu({ tick });
            setSelectedTick(tick);
        },
        [interpRefs],
    );

    const handleDeleteKeyframe = useCallback(() => {
        if (interpNotAvailMenu?.tick != null) {
            removeTempoKeyframe(interpNotAvailMenu.tick);
            setInterpNotAvailMenu(null);
            setSelectedTick(null);
        }
    }, [interpNotAvailMenu, removeTempoKeyframe]);

    // Background click to deselect
    const handleBackgroundClick = useCallback(() => {
        setSelectedTick(null);
        setInterpNotAvailMenu(null);
    }, []);

    const handleSvgContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        interpRefs.setReference({ getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0) });
        setInterpNotAvailMenu({});
    }, [interpRefs]);

    // Keyboard delete
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTick !== null) {
                e.preventDefault();
                removeTempoKeyframe(selectedTick);
                setSelectedTick(null);
            }
        },
        [selectedTick, removeTempoKeyframe],
    );

    // Global safety net: commit the drag if pointer is released outside the SVG/window
    const isDragging = dragState !== null;
    useEffect(() => {
        if (!isDragging) return;
        const handleWindowPointerUp = () => {
            const ds = dragStateRef.current;
            const dp = draftPosRef.current;
            // If refs are null, React's synthetic onPointerUp already handled this
            if (!ds || !dp) return;
            const kf = keyframes[ds.kfIndex];
            if (kf) {
                if (dp.tick !== kf.tick) moveTempoKeyframe(kf.tick, dp.tick);
                if (dp.bpm !== kf.bpm) updateTempoKeyframeBpm(dp.tick, dp.bpm);
            }
            setDragState(null);
            setDraftPos(null);
        };
        window.addEventListener('pointerup', handleWindowPointerUp);
        return () => window.removeEventListener('pointerup', handleWindowPointerUp);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDragging]);

    return (
        <div
            className="relative w-full h-full"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={handleSvgContextMenu}
        >
            {/* Header spacer (mirrors left-column header) */}
            <div className="border-b border-neutral-800" style={{ height: AUTOMATION_HEADER_HEIGHT }} />

            <svg
                ref={svgRef}
                width={width}
                height={height}
                className="block"
                onDoubleClick={handleDoubleClick}
                onClick={handleBackgroundClick}
                onContextMenu={handleSvgContextMenu}
                onPointerMove={isDragging ? handlePointerMove : undefined}
                onPointerUp={isDragging ? handlePointerUp : undefined}
                onPointerCancel={isDragging ? () => { setDragState(null); setDraftPos(null); } : undefined}
            >
                {/* BPM gridlines */}
                {gridLines.map((bpm) => {
                    const y = bpmToY(bpm);
                    return (
                        <g key={bpm}>
                            <line
                                x1={0} y1={y} x2={width} y2={y}
                                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                            />
                            <text x={4} y={y - 2} className="fill-neutral-600 text-[8px] select-none">
                                {bpm}
                            </text>
                        </g>
                    );
                })}

                {/* Empty state hint */}
                {keyframes.length === 0 && (
                    <text
                        x={width / 2}
                        y={height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-neutral-600 text-[11px] select-none pointer-events-none"
                        fontSize={11}
                    >
                        Double-click to add a tempo keyframe
                    </text>
                )}

                {/* Stepped curve — right-click shows interpolation-not-available */}
                {curvePath && (
                    <path
                        d={curvePath}
                        fill="none"
                        stroke="rgba(251,191,36,0.5)"
                        strokeWidth={8}
                        strokeLinecap="round"
                        opacity={0}
                        className="cursor-pointer"
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            interpRefs.setReference({ getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0) });
                            setInterpNotAvailMenu({});
                        }}
                    />
                )}
                {/* Stepped curve visible */}
                {curvePath && (
                    <path
                        d={curvePath}
                        fill="none"
                        stroke="rgba(251,191,36,0.5)"
                        strokeWidth={1.5}
                        className="pointer-events-none"
                    />
                )}

                {/* Fill under the curve */}
                {curvePath && (
                    <path
                        d={`${curvePath} L ${width} ${height} L 0 ${height} Z`}
                        fill="rgba(251,191,36,0.06)"
                    />
                )}

                {/* Keyframe diamonds */}
                {renderKeyframes.map((kf, i) => {
                    const x = toX(kf.tick, width);
                    const y = bpmToY(kf.bpm);
                    const isSelected = selectedTick !== null && Math.abs(kf.tick - selectedTick) <= 1;
                    const dSize = isSelected ? DIAMOND_SIZE + 2 : DIAMOND_SIZE;

                    return (
                        <g key={`${kf.tick}-${i}`} data-kf>
                            {/* Hit area */}
                            <rect
                                x={x - dSize - 2}
                                y={y - dSize - 2}
                                width={(dSize + 2) * 2}
                                height={(dSize + 2) * 2}
                                fill="transparent"
                                className="cursor-grab"
                                onPointerDown={(e) => handleDiamondPointerDown(e, i)}
                                onContextMenu={(e) => handleContextMenu(e, kf.tick)}
                            />
                            {/* Diamond shape */}
                            <path
                                d={`M${x} ${y - dSize} L${x + dSize} ${y} L${x} ${y + dSize} L${x - dSize} ${y} Z`}
                                fill={isSelected ? '#fbbf24' : 'rgba(251,191,36,0.6)'}
                                stroke={isSelected ? '#f59e0b' : 'rgba(251,191,36,0.4)'}
                                strokeWidth={isSelected ? 2 : 1}
                                className="pointer-events-none"
                            />
                            {/* BPM label */}
                            <TempoKeyframeLabel
                                tick={kf.tick}
                                bpm={kf.bpm}
                                x={x}
                                y={y}
                                selected={isSelected}
                            />
                        </g>
                    );
                })}
            </svg>

            {/* Interpolation not available notice */}
            {interpNotAvailMenu && (
                <FloatingPortal>
                    <div
                        ref={interpRefs.setFloating}
                        className="z-50 min-w-[200px] rounded border border-neutral-700 bg-neutral-900/95 shadow-xl text-[12px] overflow-hidden"
                        style={interpFloatingStyles}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="px-3 py-2 text-neutral-400 border-b border-neutral-800">
                            Interpolation not available for tempo automation
                        </div>
                        {interpNotAvailMenu.tick != null && (
                            <button
                                className="w-full px-3 py-1.5 text-left text-neutral-200 hover:bg-red-900/40 hover:text-red-300"
                                onClick={handleDeleteKeyframe}
                            >
                                Delete keyframe
                            </button>
                        )}
                    </div>
                </FloatingPortal>
            )}
        </div>
    );
};

export default TempoAutomationLane;
