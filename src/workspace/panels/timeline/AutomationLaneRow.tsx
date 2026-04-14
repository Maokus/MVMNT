/**
 * AutomationLaneRow — SVG dope-sheet row for a single automation channel.
 *
 * Renders keyframe diamonds along the timeline with:
 * - Click empty space → add keyframe at snapped tick
 * - Drag empty space → draw selection box, select enclosed keyframes
 * - Click diamond → select keyframe (shift-click to multi-select)
 * - Drag diamond → move keyframe(s) — delta-based, all selected kfs move together
 * - Right-click diamond → handle-type menu (same as curve pane)
 * - Click segment line → interpolation picker
 * - Delete key → remove selected keyframes
 *
 * Each keyframe diamond is split into two halves whose shapes reflect the
 * interpolation type of the adjacent segments:
 *   diamond   → linear or sharp end of an easing curve
 *   square    → constant (stepped)
 *   hourglass → bezier or soft end of an easing curve
 *   circle    → bezier with auto / auto-clamped handles
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
import { useTickScale } from './useTickScale';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { quantizeSettingToBeats, type QuantizeSetting } from '@state/timeline/quantize';
import { copyChannel, getClipboard } from '@automation/clipboard';
import type { AutomationChannel, AutomationKeyframe, SegmentInterpolation, HandleType } from '@automation/types';
import { DEFAULT_SEGMENT_INTERPOLATION } from '@automation/interpolation-defaults';
import InterpolationPicker from './InterpolationPicker';
import { AUTOMATION_ROW_HEIGHT } from './constants';

interface AutomationLaneRowProps {
    channel: AutomationChannel;
    width: number;
}

const DIAMOND_SIZE = 7;
/** Minimum pixel movement before a background drag is treated as a selection box. */
const SEL_DRAG_THRESHOLD = 4;

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
    if (mode === 'bezier') {
        const ht = handleType ?? 'auto_clamped';
        return ht === 'auto' || ht === 'auto_clamped' ? 'circle' : 'hourglass';
    }
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
}

interface SelBoxState {
    startX: number;
    endX: number;
    /** True once the cursor has moved beyond the drag threshold. */
    moved: boolean;
    /** Whether shift was held when the drag started. */
    shiftKey: boolean;
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

    const selectedKeyframes = useSceneStore(
        useCallback(
            (s) =>
                s.interaction.automationSelectedKeyframes.filter(
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

    const [selBox, _setSelBox] = useState<SelBoxState | null>(null);
    const selBoxRef = useRef<SelBoxState | null>(null);
    const setSelBox = useCallback((next: SelBoxState | null) => {
        selBoxRef.current = next;
        _setSelBox(next);
    }, []);

    const svgRef = useRef<SVGSVGElement | null>(null);

    // -----------------------------------------------------------------------
    // Snap helper
    // -----------------------------------------------------------------------
    const snapTick = useCallback(
        (candidateTick: number, altKey?: boolean) => {
            if (altKey) return Math.max(0, Math.round(candidateTick));
            const target: QuantizeSetting = quantize;
            if (target === 'off') return Math.max(0, Math.round(candidateTick));
            const beatLength = quantizeSettingToBeats(target, bpb);
            if (!beatLength) return Math.max(0, Math.round(candidateTick));
            const resolution = Math.max(1, Math.round(beatLength * ppq));
            return Math.max(0, Math.round(candidateTick / resolution) * resolution);
        },
        [quantize, bpb, ppq],
    );

    const isSelected = useCallback(
        (tick: number) => selectedKeyframes.some((k) => Math.abs(k.tick - tick) < 0.5),
        [selectedKeyframes],
    );

    // Set of outgoing-keyframe ticks for segments where both endpoints are selected.
    // A segment is selected when the user has selected two consecutive keyframes.
    const selectedSegmentTicks = useMemo(() => {
        const selectedTickSet = new Set(selectedKeyframes.map((k) => k.tick));
        const result = new Set<number>();
        const kfs = channel.keyframes;
        for (let i = 0; i < kfs.length - 1; i++) {
            if (selectedTickSet.has(kfs[i].tick) && selectedTickSet.has(kfs[i + 1].tick)) {
                result.add(kfs[i].tick);
            }
        }
        return result;
    }, [selectedKeyframes, channel.keyframes]);

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
            const leftShape = prevKf
                ? getKfHalfShape(prevKf.segmentInterpolation, kf.leftHandleType, 'left')
                : 'diamond';

            // Right half: shape determined by THIS keyframe's outgoing segment
            const rightShape = nextKf
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

            // Select the element that owns this automation channel
            useSceneStore.getState().setInteractionState({ selectedElementIds: [channel.elementId] });

            // Update store selection
            let newSelected: Array<{ channelId: string; tick: number }>;
            const existing = useSceneStore.getState().interaction.automationSelectedKeyframes;
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

            useSceneStore.setState((state) => ({
                interaction: {
                    ...state.interaction,
                    automationSelectedKeyframes: newSelected,
                },
            }));

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

            setDragging({ kfTick: kf.tick, baseTick: kf.tick, offsetX, peers });
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
                const snapped = snapTick(candTick, e.altKey);

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
                            mergeKey: `kf-move:${channel.id}:${drag.baseTick}`,
                            transient: true,
                        },
                    );

                    // Move peers by the same tick delta
                    const updatedPeers = drag.peers.map((peer) => {
                        const newPeerTick = snapTick(
                            Math.max(0, peer.baseTick + delta),
                            e.altKey,
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
                                    mergeKey: `kf-move:${peer.channelId}:${peer.baseTick}`,
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
                    useSceneStore.setState((state) => ({
                        interaction: {
                            ...state.interaction,
                            automationSelectedKeyframes: newSelection,
                        },
                    }));

                    setDragging({ ...drag, kfTick: resolvedSnap, peers: updatedPeers });
                }
                return;
            }

            // Selection box update
            const sb = selBoxRef.current;
            if (sb) {
                const moved = sb.moved || Math.abs(svgX - sb.startX) > SEL_DRAG_THRESHOLD;
                const next: SelBoxState = { ...sb, endX: svgX, moved };
                selBoxRef.current = next;
                _setSelBox(next);
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
                            mergeKey: `kf-move:${channel.id}:${drag.baseTick}`,
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
                                mergeKey: `kf-move:${peer.channelId}:${peer.baseTick}`,
                                transient: false,
                            },
                        );
                    }
                }
                setDragging(null);
                return;
            }

            // Selection box finalise
            const sb = selBoxRef.current;
            if (sb) {
                try {
                    (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
                } catch { /* ignore */ }

                if (!sb.moved) {
                    // Single click on background — no action (use double-click to add a keyframe)
                } else {
                    // Select all keyframes whose x position falls within the box
                    const minX = Math.min(sb.startX, sb.endX);
                    const maxX = Math.max(sb.startX, sb.endX);
                    const minTick = toTick(minX, width);
                    const maxTick = toTick(maxX, width);
                    const enclosed = channel.keyframes
                        .filter((kf) => kf.tick >= minTick - 0.5 && kf.tick <= maxTick + 0.5)
                        .map((kf) => ({ channelId: channel.id, tick: kf.tick }));

                    useSceneStore.setState((state) => {
                        if (sb.shiftKey) {
                            // Shift held — add to existing selection, replacing this channel's slice
                            const others = state.interaction.automationSelectedKeyframes.filter(
                                (k) => k.channelId !== channel.id,
                            );
                            return {
                                interaction: {
                                    ...state.interaction,
                                    automationSelectedKeyframes: [...others, ...enclosed],
                                },
                            };
                        }
                        // No shift — replace entire selection with just the enclosed keyframes
                        return {
                            interaction: {
                                ...state.interaction,
                                automationSelectedKeyframes: enclosed,
                            },
                        };
                    });
                }
                setSelBox(null);
            }
        },
        [channel, toTick, width, snapTick, setDragging, setSelBox],
    );

    // Cancel acts like pointerup for cleanup purposes
    const handlePointerCancel = useCallback(
        (_e: React.PointerEvent<SVGSVGElement>) => {
            setDragging(null);
            setSelBox(null);
        },
        [setDragging, setSelBox],
    );

    // -----------------------------------------------------------------------
    // Background pointer-down — starts a selection box drag
    // -----------------------------------------------------------------------
    const handleSvgPointerDown = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (e.button !== 0) return;
            // Let diamond and segment handlers handle their own events
            const target = e.target as SVGElement;
            if (target.closest('[data-kf]')) return;
            if (target.closest('[data-seg]')) return;

            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

            // Select the element that owns this automation channel
            useSceneStore.getState().setInteractionState({ selectedElementIds: [channel.elementId] });

            // Clicking on empty background clears keyframe selection unless shift is held
            if (!e.shiftKey) {
                useSceneStore.setState((state) => ({
                    interaction: { ...state.interaction, automationSelectedKeyframes: [] },
                }));
            }

            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const svgX = e.clientX - rect.left;
            setSelBox({ startX: svgX, endX: svgX, moved: false, shiftKey: e.shiftKey });
        },
        [channel.elementId, setSelBox],
    );

    // -----------------------------------------------------------------------
    // Double-click on background → add keyframe
    // -----------------------------------------------------------------------
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const target = e.target as SVGElement;
            if (target.closest('[data-kf]')) return;
            if (target.closest('[data-seg]')) return;
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const candTick = toTick(x, width);
            const snapped = snapTick(candTick, e.altKey);
            const interpolatedValue = interpolateAtTick(channel, snapped);
            const defaultInterp = channel.defaultInterpolation ?? { mode: 'bezier' as const, direction: 'auto' as const };
            dispatchSceneCommand(
                {
                    type: 'addKeyframe',
                    channelId: channel.id,
                    keyframe: {
                        tick: snapped,
                        value: interpolatedValue,
                        easingId: 'linear',
                        segmentInterpolation: { ...defaultInterp },
                        leftHandleType: 'auto_clamped',
                        rightHandleType: 'auto_clamped',
                    },
                },
                { source: 'automation-lane' },
            );
        },
        [channel, toTick, width, snapTick],
    );

    // -----------------------------------------------------------------------
    // Safety net: if dragging is active and window loses the pointer (e.g. the
    // browser cancelled capture silently), clear drag state so it doesn't stick.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!dragging && !selBox) return;
        const cleanup = () => {
            if (draggingRef.current) setDragging(null);
            if (selBoxRef.current) setSelBox(null);
        };
        window.addEventListener('pointercancel', cleanup);
        return () => window.removeEventListener('pointercancel', cleanup);
    }, [dragging !== null || selBox !== null, setDragging, setSelBox]);

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

            if (e.shiftKey) {
                // Shift+click: add both adjacent keyframes to selection, don't open picker
                useSceneStore.getState().setInteractionState({ selectedElementIds: [channel.elementId] });
                const kfs = channel.keyframes;
                const idx = kfs.findIndex((kf) => Math.abs(kf.tick - tick) < 0.5);
                if (idx >= 0 && idx < kfs.length - 1) {
                    const leftTick = kfs[idx].tick;
                    const rightTick = kfs[idx + 1].tick;
                    useSceneStore.setState((state) => {
                        const existing = state.interaction.automationSelectedKeyframes;
                        const hasLeft = existing.some((k) => k.channelId === channel.id && Math.abs(k.tick - leftTick) < 0.5);
                        const hasRight = existing.some((k) => k.channelId === channel.id && Math.abs(k.tick - rightTick) < 0.5);
                        const toAdd: Array<{ channelId: string; tick: number }> = [];
                        if (!hasLeft) toAdd.push({ channelId: channel.id, tick: leftTick });
                        if (!hasRight) toAdd.push({ channelId: channel.id, tick: rightTick });
                        return {
                            interaction: {
                                ...state.interaction,
                                automationSelectedKeyframes: [...existing, ...toAdd],
                            },
                        };
                    });
                }
                return;
            }

            pickerRefs.setReference({
                getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0),
            });
            setInterpolationPicker({ tick });
        },
        [pickerRefs, channel.id, channel.elementId, channel.keyframes],
    );

    const handleInterpolationSelect = useCallback(
        (interpolation: SegmentInterpolation) => {
            if (!interpolationPicker) return;
            // Read fresh selection from store to avoid stale-closure issues through
            // the InterpolationPicker → handleModeSelect → onSelect callback chain.
            const allSelected = useSceneStore.getState().interaction.automationSelectedKeyframes;
            const channelTickSet = new Set(
                allSelected.filter((k) => k.channelId === channel.id).map((k) => k.tick),
            );
            const kfs = useSceneStore.getState().automation.channels[channel.id]?.keyframes ?? [];
            const selectedSegs = new Set<number>();
            for (let i = 0; i < kfs.length - 1; i++) {
                if (channelTickSet.has(kfs[i].tick) && channelTickSet.has(kfs[i + 1].tick)) {
                    selectedSegs.add(kfs[i].tick);
                }
            }
            const isSelectedSeg = selectedSegs.has(interpolationPicker.tick);
            console.debug('[AutomationLaneRow] handleInterpolationSelect', {
                pickerTick: interpolationPicker.tick,
                channelId: channel.id,
                allSelectedTicks: allSelected.map(k => `${k.channelId}@${k.tick}`),
                channelTickSet: [...channelTickSet],
                selectedSegs: [...selectedSegs],
                isSelectedSeg,
            });
            if (isSelectedSeg && selectedSegs.size > 1) {
                selectedSegs.forEach((tick) => {
                    dispatchSceneCommand(
                        {
                            type: 'updateKeyframe',
                            channelId: channel.id,
                            tick,
                            patch: { segmentInterpolation: interpolation },
                        },
                        { source: 'automation-lane' },
                    );
                });
            } else {
                dispatchSceneCommand(
                    {
                        type: 'updateKeyframe',
                        channelId: channel.id,
                        tick: interpolationPicker.tick,
                        patch: { segmentInterpolation: interpolation },
                    },
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

    // -----------------------------------------------------------------------
    // Handle-type menu (right-click on keyframe)
    // -----------------------------------------------------------------------
    const [kfHandleMenu, setKfHandleMenu] = useState<{ tick: number } | null>(null);

    const { refs: kfMenuRefs, floatingStyles: kfMenuFloatingStyles } = useFloating({
        open: kfHandleMenu !== null,
        placement: 'right-start',
        middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
    });

    useEffect(() => {
        if (!kfHandleMenu) return;
        const close = (e: PointerEvent) => {
            const el = kfMenuRefs.floating.current;
            if (el && el.contains(e.target as Node)) return;
            setKfHandleMenu(null);
        };
        window.addEventListener('pointerdown', close, true);
        return () => window.removeEventListener('pointerdown', close, true);
    }, [kfHandleMenu]);

    const handleKfContextMenu = useCallback(
        (e: React.MouseEvent, kf: AutomationKeyframe) => {
            e.preventDefault();
            e.stopPropagation(); // prevent channel context menu from opening
            kfMenuRefs.setReference({
                getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0),
            });
            setKfHandleMenu({ tick: kf.tick });
        },
        [kfMenuRefs],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    const height = AUTOMATION_ROW_HEIGHT;
    const cy = height / 2;

    // Selection box visual
    const selBoxRect = selBox && selBox.moved ? {
        x: Math.min(selBox.startX, selBox.endX),
        width: Math.abs(selBox.endX - selBox.startX),
    } : null;

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
                    const selected = selectedSegmentTicks.has(seg.tick);
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
                            onContextMenu={(e) => handleKfContextMenu(e, kf)}
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

                {/* Selection box */}
                {selBoxRect && (
                    <rect
                        x={selBoxRect.x}
                        y={1}
                        width={selBoxRect.width}
                        height={height - 2}
                        fill="rgba(96,165,250,0.08)"
                        stroke="rgba(96,165,250,0.45)"
                        strokeWidth={1}
                        style={{ pointerEvents: 'none' }}
                    />
                )}
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

            {/* Handle-type menu (keyframe right-click) */}
            {kfHandleMenu && (() => {
                const kfIdx = channel.keyframes.findIndex(
                    (k) => Math.abs(k.tick - kfHandleMenu.tick) < 0.5,
                );
                const kf = kfIdx >= 0 ? channel.keyframes[kfIdx] : null;
                if (!kf) return null;
                const hasLeft = kfIdx > 0;
                const hasRight = kfIdx < channel.keyframes.length - 1;
                const currentLeft = kf.leftHandleType ?? 'auto_clamped';
                const currentRight = kf.rightHandleType ?? 'auto_clamped';
                const handleTypes: Array<{ type: HandleType; label: string }> = [
                    { type: 'auto_clamped', label: 'Auto (Clamped)' },
                    { type: 'auto', label: 'Auto' },
                    { type: 'free', label: 'Free' },
                    { type: 'aligned', label: 'Aligned' },
                    { type: 'vector', label: 'Vector' },
                ];
                const applyHandleType = (side: 'left' | 'right', type: HandleType) => {
                    const patch = side === 'left' ? { leftHandleType: type } : { rightHandleType: type };
                    dispatchSceneCommand(
                        { type: 'updateKeyframe', channelId: channel.id, tick: kfHandleMenu.tick, patch },
                        { source: 'automation-lane' },
                    );
                    setKfHandleMenu(null);
                };
                return (
                    <FloatingPortal>
                        <div
                            ref={kfMenuRefs.setFloating}
                            className="ae-context-menu z-50"
                            style={kfMenuFloatingStyles}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            {hasLeft && (
                                <>
                                    <div style={{ padding: '4px 8px 2px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
                                        Left Handle
                                    </div>
                                    {handleTypes.map(({ type, label }) => (
                                        <button
                                            key={type}
                                            type="button"
                                            className="ae-context-menu-item"
                                            style={currentLeft === type ? { fontWeight: 600, color: '#60a5fa' } : undefined}
                                            onClick={() => applyHandleType('left', type)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </>
                            )}
                            {hasLeft && hasRight && <div className="ae-context-menu-divider" />}
                            {hasRight && (
                                <>
                                    <div style={{ padding: '4px 8px 2px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
                                        Right Handle
                                    </div>
                                    {handleTypes.map(({ type, label }) => (
                                        <button
                                            key={type}
                                            type="button"
                                            className="ae-context-menu-item"
                                            style={currentRight === type ? { fontWeight: 600, color: '#60a5fa' } : undefined}
                                            onClick={() => applyHandleType('right', type)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </FloatingPortal>
                );
            })()}
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
