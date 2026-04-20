/**
 * AutomationLaneRow — SVG dope-sheet row for a single automation channel.
 *
 * Renders keyframe diamonds along the timeline with:
 * - Click empty space → add keyframe at snapped tick
 * - Drag empty space → draw selection box, select enclosed keyframes
 * - Click diamond → select keyframe (shift-click to multi-select)
 * - Drag diamond → move keyframe(s) — delta-based, all selected kfs move together
 * - Right-click diamond → interpolation picker (same as segment right-click)
 * - Click segment line → interpolation picker
 * - Delete key → remove selected keyframes
 *
 * Each keyframe diamond is split into two halves whose shapes reflect the
 * interpolation type of the adjacent segments:
 *   diamond   → linear or sharp end of an easing curve
 *   square    → constant (stepped)
 *   hourglass → soft end of an easing curve
 *   circle    → bezier 
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    useFloating,
    autoUpdate,
    flip,
    shift,
    offset,
    FloatingPortal,
} from '@floating-ui/react';
import { useTickScale } from '../hooks/useTickScale';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { quantizeSettingToBeats, type QuantizeSetting } from '@state/timeline/quantize';
import { copyChannel, getClipboard } from '@automation/clipboard';
import { useSnapTicks } from '../hooks/useSnapTicks';
import { useCurveEditorExpanded } from '@automation/hooks';
import type { AutomationChannel, AutomationKeyframe, SegmentInterpolation, HandleType } from '@automation/types';
import { DEFAULT_SEGMENT_INTERPOLATION } from '@automation/interpolation-defaults';
import InterpolationPicker from './InterpolationPicker';
import { AUTOMATION_ROW_HEIGHT } from '../constants';

interface AutomationLaneRowProps {
    channel: AutomationChannel;
    width: number;
}

const DIAMOND_SIZE = 7;

// ---------------------------------------------------------------------------
// Keyframe half-shape types
// ---------------------------------------------------------------------------

type KfHalfShape = 'diamond' | 'square' | 'hourglass' | 'circle';

const DYNAMIC_EASING_MODES = new Set(['back', 'bounce', 'elastic']);

/**
 * Determine the visual shape for one half of a keyframe icon.
 *
 * @param segInterp  The SegmentInterpolation of the segment adjacent to this half.
 * @param handleType The bezier handle type relevant to this half (left or right).
 * @param side       'right' = this keyframe is the outgoing/source of the segment.
 *                   'left'  = this keyframe is the incoming/destination of the segment.
 */
function getKfHalfShape(
    segInterp: SegmentInterpolation | undefined | null,
    handleType: HandleType | undefined,
    side: 'left' | 'right',
): KfHalfShape {
    if (!segInterp) return 'diamond';
    const { mode } = segInterp;
    if (mode === 'constant') return 'square';
    if (mode === 'linear') return 'diamond';
    if (mode === 'bezier') return 'circle';
    // Semantic easing — resolve 'auto' direction
    const resolvedDir =
        segInterp.direction === 'auto'
            ? DYNAMIC_EASING_MODES.has(mode)
                ? 'ease_out'
                : 'ease_in_out'
            : segInterp.direction;

    if (resolvedDir === 'ease_in_out') return 'hourglass';
    if (resolvedDir === 'ease_in') {
        // Source (right half) = soft start → hourglass; destination (left half) = sharp end → diamond
        return side === 'right' ? 'hourglass' : 'diamond';
    }
    // ease_out: source = sharp start → diamond; destination = soft end → hourglass
    return side === 'right' ? 'diamond' : 'hourglass';
}

/**
 * Build a unified SVG path string for a keyframe icon at position (x, cy).
 * Traces the left half downward from (x,t) to (x,b), then the right half
 * upward back to (x,t), forming a single closed path.
 */
function shapePath(
    leftShape: KfHalfShape,
    rightShape: KfHalfShape,
    x: number,
    cy: number,
    size: number,
): string {
    const l = x - size, r = x + size, t = cy - size, b = cy + size;

    // Left half: segments from (x,t) down to (x,b)
    let leftSeg: string;
    switch (leftShape) {
        case 'diamond': leftSeg = `L${l},${cy} L${x},${b}`; break;
        case 'hourglass': leftSeg = `L${l},${t} L${x},${cy} L${l},${b} L${x},${b}`; break;
        case 'square': leftSeg = `L${l},${t} L${l},${b} L${x},${b}`; break;
        default: leftSeg = `A${size},${size} 0 0,0 ${x},${b}`; break; // circle: left semicircle (x,t)→(x,b)
    }

    // Right half: segments from (x,b) back up to (x,t)
    let rightSeg: string;
    switch (rightShape) {
        case 'diamond': rightSeg = `L${r},${cy} L${x},${t}`; break;
        case 'hourglass': rightSeg = `L${r},${b} L${x},${cy} L${r},${t} L${x},${t}`; break;
        case 'square': rightSeg = `L${r},${b} L${r},${t} L${x},${t}`; break;
        default: rightSeg = `A${size},${size} 0 0,0 ${x},${t}`; break; // circle: right semicircle (x,b)→(x,t)
    }

    return `M${x},${t} ${leftSeg} ${rightSeg} Z`;
}

// ---------------------------------------------------------------------------
// Drag state types
// ---------------------------------------------------------------------------

interface PeerKf {
    channelId: string;
    /** Original tick at drag start — never changes, used for delta computation. */
    baseTick: number;
    /** Current (live) tick — updated each pointermove. */
    curTick: number;
}

interface DragState {
    /** Current tick position of the dragged keyframe. */
    kfTick: number;
    /** Original tick at drag start — never changes, used for merge key and delta. */
    baseTick: number;
    /** Click offset (SVG px) from the keyframe's centre — for delta-based dragging. */
    offsetX: number;
    /** All other selected keyframes (across all channels) that should move with the primary. */
    peers: PeerKf[];
    /** Unique ID for this drag session — shared across all merge keys so all moves undo together. */
    sessionId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AutomationLaneRow: React.FC<AutomationLaneRowProps> = ({ channel, width }) => {
    const { toX, toTick } = useTickScale();
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const ppq = CANONICAL_PPQ;

    const selectedKeyframes = useSelectionStore(
        useCallback(
            (s) =>
                s.selectedKeyframes.filter(
                    (k) => k.channelId === channel.id,
                ),
            [channel.id],
        ),
    );

    // -----------------------------------------------------------------------
    // State — kept in refs so pointer-event handlers never close over stale values
    // -----------------------------------------------------------------------
    const [dragging, _setDragging] = useState<DragState | null>(null);
    const draggingRef = useRef<DragState | null>(null);
    const setDragging = useCallback((next: DragState | null) => {
        draggingRef.current = next;
        _setDragging(next);
    }, []);

    const svgRef = useRef<SVGSVGElement | null>(null);

    // -----------------------------------------------------------------------
    // Snap helper
    // -----------------------------------------------------------------------
    const snapTick = useSnapTicks();

    // Toggle curve pane (same behavior as double-clicking the label)
    const curveExpanded = useCurveEditorExpanded(channel.id);
    const toggleCurve = useCallback(() => {
        useSceneStore.setState((state) => {
            const list = state.interaction.automationExpandedCurves;
            const next = curveExpanded
                ? list.filter((id) => id !== channel.id)
                : [...list, channel.id];
            return { interaction: { ...state.interaction, automationExpandedCurves: next } };
        });
    }, [channel.id, curveExpanded]);

    const isSelected = useCallback(
        (tick: number) => selectedKeyframes.some((k) => Math.abs(k.tick - tick) < 0.5),
        [selectedKeyframes],
    );

    // Set of selected keyframe ticks for this channel — a segment is highlighted when its outgoing kf is selected.
    const selectedKfTickSet = useMemo(() => {
        return new Set(selectedKeyframes.map((k) => k.tick));
    }, [selectedKeyframes]);

    // Diamonds (with half-shapes) and segment hit areas
    const elements = useMemo(() => {
        const kfs = channel.keyframes;
        const diamonds: Array<{
            kf: AutomationKeyframe;
            x: number;
            leftShape: KfHalfShape;
            rightShape: KfHalfShape;
        }> = [];
        const segments: Array<{ x1: number; x2: number; tick: number }> = [];

        for (let i = 0; i < kfs.length; i++) {
            const kf = kfs[i];
            const x = toX(kf.tick, width);
            const prevKf = i > 0 ? kfs[i - 1] : null;
            const nextKf = i < kfs.length - 1 ? kfs[i + 1] : null;

            // Left half: shape determined by the PREVIOUS segment's interpolation
            const leftShape: KfHalfShape = channel.valueType === 'string'
                ? (prevKf ? 'square' : 'diamond')
                : prevKf
                    ? getKfHalfShape(prevKf.segmentInterpolation, kf.leftHandleType, 'left')
                    : 'diamond';

            // Right half: shape determined by THIS keyframe's outgoing segment
            const rightShape: KfHalfShape = channel.valueType === 'string'
                ? (nextKf ? 'square' : 'diamond')
                : nextKf
                    ? getKfHalfShape(kf.segmentInterpolation, kf.rightHandleType, 'right')
                    : 'diamond';

            diamonds.push({ kf, x, leftShape, rightShape });

            if (i > 0) {
                const prevX = toX(kfs[i - 1].tick, width);
                segments.push({ x1: prevX, x2: x, tick: kfs[i - 1].tick });
            }
        }
        return { diamonds, segments };
    }, [channel.keyframes, toX, width]);

    // -----------------------------------------------------------------------
    // Keyframe pointer-down — sets up drag state
    // -----------------------------------------------------------------------
    const handleKfPointerDown = useCallback(
        (e: React.PointerEvent, kf: AutomationKeyframe) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            // Capture on the <g> so pointermove/up are delivered here and bubble to SVG
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

            // Update store selection
            let newSelected: Array<{ channelId: string; tick: number }>;
            const existing = useSelectionStore.getState().selectedKeyframes;

            // Set inspector context to the element owning this channel (low-level setter,
            // does not disturb existing keyframe selection or activeTarget).
            useSelectionStore.getState().setSelectedElementIds([channel.elementId]);
            const clickedIsSelected = existing.some(
                (k) => k.channelId === channel.id && Math.abs(k.tick - kf.tick) < 0.5,
            );

            if (e.shiftKey) {
                // Toggle this kf in/out
                const idx = existing.findIndex(
                    (k) => k.channelId === channel.id && Math.abs(k.tick - kf.tick) < 0.5,
                );
                newSelected =
                    idx >= 0
                        ? existing.filter((_, i) => i !== idx)
                        : [...existing, { channelId: channel.id, tick: kf.tick }];
            } else if (clickedIsSelected) {
                // Already selected → keep full selection for bulk drag
                newSelected = existing;
            } else {
                // Plain click on unselected kf → single-select
                newSelected = [{ channelId: channel.id, tick: kf.tick }];
            }

            useSelectionStore.getState().selectKeyframes(newSelected);

            // Build peers list (all selected kfs except this one)
            const peers: PeerKf[] = newSelected
                .filter(
                    (k) =>
                        !(k.channelId === channel.id && Math.abs(k.tick - kf.tick) < 0.5),
                )
                .map((k) => ({ channelId: k.channelId, baseTick: k.tick, curTick: k.tick }));

            // Compute click offset from diamond centre (for delta-based dragging)
            const rect = svgRef.current?.getBoundingClientRect();
            const svgX = rect ? e.clientX - rect.left : 0;
            const kfX = toX(kf.tick, width);
            const offsetX = svgX - kfX;

            setDragging({ kfTick: kf.tick, baseTick: kf.tick, offsetX, peers, sessionId: `${Date.now()}-${Math.random()}` });
        },
        [channel.id, channel.elementId, toX, width, setDragging],
    );

    // -----------------------------------------------------------------------
    // SVG-level pointer-move — handles both kf drag and selection box
    // -----------------------------------------------------------------------
    const handlePointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const svgX = e.clientX - rect.left;

            const drag = draggingRef.current;
            if (drag) {
                // Delta-based: subtract click offset so kf sticks to where it was grabbed
                const targetSVGX = svgX - drag.offsetX;
                const candTick = toTick(targetSVGX, width);
                const snapped = snapTick(candTick, e.ctrlKey || e.metaKey);

                // Collision avoidance: if the snapped destination is occupied by a different
                // keyframe, bump by ±1 tick (direction of travel) until a free slot is found.
                const currentKeyframes =
                    useSceneStore.getState().automation.channels[channel.id]?.keyframes ?? [];
                const isOccupiedByOther = (t: number) =>
                    currentKeyframes.some(
                        (kf) => Math.abs(kf.tick - t) < 0.5
                            && Math.abs(kf.tick - drag.kfTick) >= 0.5,
                    );
                let resolvedSnap = snapped;
                if (isOccupiedByOther(resolvedSnap)) {
                    // Use mouse position (candTick) relative to snap point for stable direction.
                    // Comparing against drag.kfTick caused jitter because kfTick updates each frame.
                    const dir = candTick >= snapped ? 1 : -1;
                    let candidate = snapped + dir;
                    while (candidate >= 0 && isOccupiedByOther(candidate)) candidate += dir;
                    resolvedSnap = Math.max(0, candidate);
                }

                const delta = resolvedSnap - drag.baseTick;

                if (resolvedSnap !== drag.kfTick) {
                    dispatchSceneCommand(
                        {
                            type: 'moveKeyframe',
                            channelId: channel.id,
                            fromTick: drag.kfTick,
                            toTick: resolvedSnap,
                        },
                        {
                            source: 'automation-lane',
                            mergeKey: `kf-move:${drag.sessionId}`,
                            transient: true,
                        },
                    );

                    // Move peers by the same tick delta
                    const updatedPeers = drag.peers.map((peer) => {
                        const newPeerTick = snapTick(
                            Math.max(0, peer.baseTick + delta),
                            e.ctrlKey || e.metaKey,
                        );
                        if (newPeerTick !== peer.curTick) {
                            dispatchSceneCommand(
                                {
                                    type: 'moveKeyframe',
                                    channelId: peer.channelId,
                                    fromTick: peer.curTick,
                                    toTick: newPeerTick,
                                },
                                {
                                    source: 'automation-lane',
                                    mergeKey: `kf-move:${drag.sessionId}`,
                                    transient: true,
                                },
                            );
                        }
                        return { ...peer, curTick: newPeerTick };
                    });

                    // Update selection ticks in store so visual highlights track correctly
                    const newSelection = [
                        { channelId: channel.id, tick: resolvedSnap },
                        ...updatedPeers.map((p) => ({ channelId: p.channelId, tick: p.curTick })),
                    ];
                    useSelectionStore.getState().selectKeyframes(newSelection);

                    setDragging({ ...drag, kfTick: resolvedSnap, peers: updatedPeers });
                }
                return;
            }
        },
        // Only stable values in deps — dynamic state accessed via refs
        [channel.id, toTick, width, snapTick, setDragging],
    );

    // -----------------------------------------------------------------------
    // SVG-level pointer-up / cancel — finalises drag or selection box
    // -----------------------------------------------------------------------
    const handlePointerUp = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            const drag = draggingRef.current;
            if (drag) {
                try {
                    // Release capture (may already be auto-released after pointerup)
                    (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
                } catch { /* ignore */ }

                // Commit transient moves as permanent history entries
                if (drag.kfTick !== drag.baseTick) {
                    dispatchSceneCommand(
                        {
                            type: 'moveKeyframe',
                            channelId: channel.id,
                            fromTick: drag.kfTick,
                            toTick: drag.kfTick,
                        },
                        {
                            source: 'automation-lane',
                            mergeKey: `kf-move:${drag.sessionId}`,
                            transient: false,
                        },
                    );
                }
                for (const peer of drag.peers) {
                    if (peer.curTick !== peer.baseTick) {
                        dispatchSceneCommand(
                            {
                                type: 'moveKeyframe',
                                channelId: peer.channelId,
                                fromTick: peer.curTick,
                                toTick: peer.curTick,
                            },
                            {
                                source: 'automation-lane',
                                mergeKey: `kf-move:${drag.sessionId}`,
                                transient: false,
                            },
                        );
                    }
                }
                setDragging(null);
                return;
            }
        },
        [channel.id, setDragging],
    );

    // Cancel acts like pointerup for cleanup purposes
    const handlePointerCancel = useCallback(
        (_e: React.PointerEvent<SVGSVGElement>) => {
            setDragging(null);
        },
        [setDragging],
    );

    // -----------------------------------------------------------------------
    // Background pointer-down — selects this element; cross-lane selection box
    // is handled by AutomationLanes (parent). Keyframe/segment handlers call
    // stopPropagation so they do NOT reach here.
    // -----------------------------------------------------------------------
    const handleSvgPointerDown = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (e.button !== 0) return;
            const target = e.target as SVGElement;
            if (target.closest('[data-kf]')) return;
            if (target.closest('[data-seg]')) return;

            // Select the element that owns this automation channel
            useSelectionStore.getState().selectElements([channel.elementId]);
        },
        [channel.elementId],
    );

    // -----------------------------------------------------------------------
    // Double-click anywhere → toggle curve pane
    // -----------------------------------------------------------------------
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            e.stopPropagation();
            toggleCurve();
        },
        [toggleCurve],
    );

    // -----------------------------------------------------------------------
    // Safety net: if dragging is active and window loses the pointer (e.g. the
    // browser cancelled capture silently), clear drag state so it doesn't stick.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!dragging) return;
        const cleanup = () => {
            if (draggingRef.current) setDragging(null);
        };
        window.addEventListener('pointercancel', cleanup);
        return () => window.removeEventListener('pointercancel', cleanup);
    }, [dragging !== null, setDragging]);

    // -----------------------------------------------------------------------
    // Channel context menu (background right-click)
    // -----------------------------------------------------------------------
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const { refs: ctxRefs, floatingStyles: ctxFloatingStyles } = useFloating({
        open: contextMenuOpen,
        onOpenChange: setContextMenuOpen,
        placement: 'bottom-start',
        middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
    });

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            e.preventDefault();
            e.stopPropagation();
            const x = e.clientX;
            const y = e.clientY;
            ctxRefs.setReference({
                getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
            });
            setContextMenuOpen(true);
        },
        [ctxRefs],
    );

    useEffect(() => {
        if (!contextMenuOpen) return;
        const close = (e: PointerEvent) => {
            const el = ctxRefs.floating.current;
            if (el && el.contains(e.target as Node)) return;
            setContextMenuOpen(false);
        };
        window.addEventListener('pointerdown', close, true);
        return () => window.removeEventListener('pointerdown', close, true);
    }, [contextMenuOpen]);

    // -----------------------------------------------------------------------
    // Interpolation picker (segment click)
    // -----------------------------------------------------------------------
    const [interpolationPicker, setInterpolationPicker] = useState<{ tick: number } | null>(null);
    const [hoveredSegIndex, setHoveredSegIndex] = useState<number | null>(null);

    const { refs: pickerRefs, floatingStyles: pickerFloatingStyles } = useFloating({
        open: interpolationPicker !== null,
        placement: 'bottom-start',
        middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
    });

    useEffect(() => {
        if (!interpolationPicker) return;
        const close = (e: PointerEvent) => {
            const el = pickerRefs.floating.current;
            if (el && el.contains(e.target as Node)) return;
            setInterpolationPicker(null);
        };
        window.addEventListener('pointerdown', close, true);
        return () => window.removeEventListener('pointerdown', close, true);
    }, [interpolationPicker]);

    const handleSegmentClick = useCallback(
        (e: React.MouseEvent, tick: number) => {
            e.stopPropagation();
            useSelectionStore.getState().selectElements([channel.elementId]);
            const kfs = channel.keyframes;
            const idx = kfs.findIndex((kf) => Math.abs(kf.tick - tick) < 0.5);
            if (idx < 0 || idx >= kfs.length - 1) return;
            const leftTick = kfs[idx].tick;
            if (e.shiftKey) {
                // Shift+click: add left keyframe to existing selection
                const existing = useSelectionStore.getState().selectedKeyframes;
                const hasLeft = existing.some((k) => k.channelId === channel.id && Math.abs(k.tick - leftTick) < 0.5);
                useSelectionStore.getState().selectKeyframes(
                    hasLeft ? existing : [...existing, { channelId: channel.id, tick: leftTick }]
                );
            } else {
                // Plain click: select only this segment's left (outgoing) keyframe
                useSelectionStore.getState().selectKeyframes([{ channelId: channel.id, tick: leftTick }]);
            }
        },
        [channel.id, channel.elementId, channel.keyframes],
    );

    const handleInterpolationSelect = useCallback(
        (interpolation: SegmentInterpolation) => {
            if (!interpolationPicker) return;
            const allSelected = useSelectionStore.getState().selectedKeyframes;
            const channelTickSet = new Set(
                allSelected.filter((k) => k.channelId === channel.id).map((k) => k.tick),
            );
            const isPartOfSelection = channelTickSet.has(interpolationPicker.tick);
            if (isPartOfSelection && allSelected.length > 1) {
                for (const { channelId, tick } of allSelected) {
                    dispatchSceneCommand(
                        { type: 'updateKeyframe', channelId, tick, patch: { segmentInterpolation: interpolation } },
                        { source: 'automation-lane' },
                    );
                }
            } else {
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: interpolationPicker.tick, patch: { segmentInterpolation: interpolation } },
                    { source: 'automation-lane' },
                );
            }
        },
        [interpolationPicker, channel.id],
    );

    const handleHandleTypeChange = useCallback(
        (type: HandleType) => {
            if (!interpolationPicker) return;
            const patch = { leftHandleType: type, rightHandleType: type };
            const allSelected = useSelectionStore.getState().selectedKeyframes;
            const isPartOfSelection = allSelected.some(
                (k) => k.channelId === channel.id && Math.abs(k.tick - interpolationPicker.tick) < 0.5,
            );
            if (isPartOfSelection && allSelected.length > 1) {
                for (const { channelId, tick } of allSelected) {
                    dispatchSceneCommand({ type: 'updateKeyframe', channelId, tick, patch }, { source: 'automation-lane' });
                }
            } else {
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: interpolationPicker.tick, patch },
                    { source: 'automation-lane' },
                );
            }
        },
        [interpolationPicker, channel.id],
    );

    const pickerCurrent = useMemo((): SegmentInterpolation => {
        if (!interpolationPicker) return DEFAULT_SEGMENT_INTERPOLATION;
        const kf = channel.keyframes.find((k) => Math.abs(k.tick - interpolationPicker.tick) < 0.5);
        return kf?.segmentInterpolation ?? DEFAULT_SEGMENT_INTERPOLATION;
    }, [interpolationPicker, channel.keyframes]);

    const pickerHandleType = useMemo((): HandleType | null => {
        if (!interpolationPicker || pickerCurrent.mode !== 'bezier') return null;
        const kf = channel.keyframes.find((k) => Math.abs(k.tick - interpolationPicker.tick) < 0.5);
        if (!kf) return null;
        const l = kf.leftHandleType ?? 'auto_clamped';
        const r = kf.rightHandleType ?? 'auto_clamped';
        return l === r ? l : null;
    }, [interpolationPicker, channel.keyframes, pickerCurrent.mode]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    const height = AUTOMATION_ROW_HEIGHT;
    const cy = height / 2;

    return (
        <div className="relative" style={{ width, height }}>
            <svg
                ref={svgRef}
                className="automation-lane-row"
                width={width}
                height={height}
                onPointerDown={handleSvgPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
                style={{ display: 'block', cursor: dragging ? 'grabbing' : 'crosshair' }}
            >
                {/* Interpolation lines */}
                {elements.segments.map((seg, i) => {
                    const hovered = hoveredSegIndex === i;
                    const selected = selectedKfTickSet.has(seg.tick);
                    return (
                        <line
                            key={`line-${i}`}
                            x1={seg.x1}
                            y1={cy}
                            x2={seg.x2}
                            y2={cy}
                            stroke={
                                selected && hovered ? 'rgba(255,255,255,0.95)' :
                                    selected ? 'rgba(147,197,253,0.9)' :
                                        hovered ? 'rgba(147,197,253,0.9)' :
                                            'rgba(96,165,250,0.35)'
                            }
                            strokeWidth={selected || hovered ? 2 : 1}
                            style={{ pointerEvents: 'none', filter: (selected || hovered) ? 'drop-shadow(0 0 3px rgba(147,197,253,0.7))' : undefined }}
                        />
                    );
                })}

                {/* Segment hit areas — transparent tall rects for click/context-menu */}
                {elements.segments.map((seg, i) => (
                    <rect
                        key={`seg-${i}`}
                        data-seg="1"
                        x={seg.x1}
                        y={0}
                        width={Math.max(1, seg.x2 - seg.x1)}
                        height={height}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onPointerEnter={() => setHoveredSegIndex(i)}
                        onPointerLeave={() => setHoveredSegIndex(null)}
                        onClick={(e) => handleSegmentClick(e, seg.tick)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Right-click on segment also opens the interpolation picker
                            pickerRefs.setReference({
                                getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0),
                            });
                            setInterpolationPicker({ tick: seg.tick });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                ))}

                {/* Keyframe icons */}
                {elements.diamonds.map(({ kf, x, leftShape, rightShape }) => {
                    const sel = isSelected(kf.tick);
                    const atPlayhead = Math.abs(kf.tick - currentTick) < 0.5;
                    const dSize = sel ? DIAMOND_SIZE + 2 : DIAMOND_SIZE;
                    const fill = sel ? '#ffffff' : 'rgba(96,165,250,0.6)';
                    const stroke = sel ? '#60a5fa' : 'rgba(96,165,250,0.5)';
                    const strokeWidth = sel ? 2 : 1;
                    return (
                        <g
                            key={kf.tick}
                            data-kf="1"
                            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                            onPointerDown={(e) => handleKfPointerDown(e, kf)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const kfIdx = channel.keyframes.findIndex((k) => Math.abs(k.tick - kf.tick) < 0.5);
                                if (kfIdx < 0 || channel.keyframes.length < 2) return;
                                const pickerTick = kfIdx < channel.keyframes.length - 1
                                    ? kf.tick
                                    : channel.keyframes[kfIdx - 1].tick;
                                pickerRefs.setReference({ getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0) });
                                setInterpolationPicker({ tick: pickerTick });
                            }}
                        >
                            <path
                                d={shapePath(leftShape, rightShape, x, cy, dSize)}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={strokeWidth}
                                strokeLinejoin="round"
                            />
                            {atPlayhead && (
                                <circle
                                    cx={x}
                                    cy={cy}
                                    r={2.5}
                                    fill="#f87171"
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                            {/* Larger hit area */}
                            <rect
                                x={x - dSize - 2}
                                y={cy - dSize - 2}
                                width={dSize * 2 + 4}
                                height={dSize * 2 + 4}
                                fill="transparent"
                            />
                        </g>
                    );
                })}
            </svg>

            {/* Channel context menu (background right-click) */}
            {contextMenuOpen && (
                <FloatingPortal>
                    <div
                        ref={ctxRefs.setFloating}
                        className="ae-context-menu z-50"
                        style={ctxFloatingStyles}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="ae-context-menu-item"
                            onClick={() => {
                                copyChannel(channel);
                                setContextMenuOpen(false);
                            }}
                        >
                            Copy channel
                        </button>
                        {getClipboard() && (
                            <button
                                type="button"
                                className="ae-context-menu-item"
                                onClick={() => {
                                    const clip = getClipboard();
                                    if (clip) {
                                        dispatchSceneCommand(
                                            {
                                                type: 'batchUpdateKeyframes',
                                                channelId: channel.id,
                                                keyframes: clip.keyframes,
                                            },
                                            { source: 'automation-lane' },
                                        );
                                    }
                                    setContextMenuOpen(false);
                                }}
                            >
                                Paste keyframes
                            </button>
                        )}
                        <div className="ae-context-menu-divider" />
                        <button
                            type="button"
                            className="ae-context-menu-item"
                            onClick={() => {
                                dispatchSceneCommand(
                                    {
                                        type: 'batchUpdateKeyframes',
                                        channelId: channel.id,
                                        keyframes: [],
                                    },
                                    { source: 'automation-lane' },
                                );
                                setContextMenuOpen(false);
                            }}
                        >
                            Clear keyframes
                        </button>
                        <button
                            type="button"
                            className="ae-context-menu-item danger"
                            onClick={() => {
                                dispatchSceneCommand({
                                    type: 'disablePropertyAutomation',
                                    elementId: channel.elementId,
                                    propertyKey: channel.propertyKey,
                                });
                                setContextMenuOpen(false);
                            }}
                        >
                            Delete automation
                        </button>
                    </div>
                </FloatingPortal>
            )}

            {/* Interpolation picker popover (segment click) */}
            {interpolationPicker && (
                <FloatingPortal>
                    <div
                        ref={pickerRefs.setFloating}
                        className="ae-easing-picker-popover z-50"
                        style={pickerFloatingStyles}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <InterpolationPicker
                            current={pickerCurrent}
                            onSelect={handleInterpolationSelect}
                            handleType={pickerHandleType}
                            onHandleTypeChange={handleHandleTypeChange}
                        />
                        <button
                            type="button"
                            className="ae-easing-close"
                            onClick={() => setInterpolationPicker(null)}
                        >
                            Close
                        </button>
                    </div>
                </FloatingPortal>
            )}

        </div>
    );
};

/** Simple linear interpolation at a tick from surrounding keyframes. */
function interpolateAtTick(channel: AutomationChannel, tick: number): unknown {
    const kfs = channel.keyframes;
    if (kfs.length === 0) return 0;
    if (kfs.length === 1) return kfs[0].value;

    // Before first
    if (tick <= kfs[0].tick) return kfs[0].value;
    // After last
    if (tick >= kfs[kfs.length - 1].tick) return kfs[kfs.length - 1].value;

    // Find surrounding pair
    for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i];
        const b = kfs[i + 1];
        if (tick >= a.tick && tick <= b.tick) {
            if (typeof a.value === 'number' && typeof b.value === 'number') {
                const t = (tick - a.tick) / Math.max(1, b.tick - a.tick);
                return a.value + (b.value - a.value) * t;
            }
            // Non-numeric: use nearest
            return tick - a.tick <= b.tick - tick ? a.value : b.value;
        }
    }
    return kfs[kfs.length - 1].value;
}

export default AutomationLaneRow;
