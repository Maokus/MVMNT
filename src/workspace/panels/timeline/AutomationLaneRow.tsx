/**
 * AutomationLaneRow — SVG dope-sheet row for a single automation channel.
 *
 * Renders keyframe diamonds along the timeline with:
 * - Click empty space → add keyframe at snapped tick
 * - Drag empty space → draw selection box, select enclosed keyframes
 * - Click diamond → select keyframe (shift-click to multi-select)
 * - Drag diamond → move keyframe(s) — delta-based, all selected kfs move together
 * - Delete key → remove selected keyframes
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
import type { AutomationChannel, AutomationKeyframe } from '@automation/types';
import { AUTOMATION_ROW_HEIGHT } from './constants';

interface AutomationLaneRowProps {
    channel: AutomationChannel;
    width: number;
}

const DIAMOND_SIZE = 7;
/** Minimum pixel movement before a background drag is treated as a selection box. */
const SEL_DRAG_THRESHOLD = 4;

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AutomationLaneRow: React.FC<AutomationLaneRowProps> = ({ channel, width }) => {
    const { toX, toTick } = useTickScale();
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
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

    // Diamonds and interpolation lines
    const elements = useMemo(() => {
        const diamonds: Array<{ kf: AutomationKeyframe; x: number }> = [];
        const lines: Array<{ x1: number; x2: number }> = [];

        for (let i = 0; i < channel.keyframes.length; i++) {
            const kf = channel.keyframes[i];
            const x = toX(kf.tick, width);
            diamonds.push({ kf, x });

            if (i > 0) {
                const prevX = toX(channel.keyframes[i - 1].tick, width);
                lines.push({ x1: prevX, x2: x });
            }
        }
        return { diamonds, lines };
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
                const delta = snapped - drag.baseTick;

                if (snapped !== drag.kfTick) {
                    dispatchSceneCommand(
                        {
                            type: 'moveKeyframe',
                            channelId: channel.id,
                            fromTick: drag.kfTick,
                            toTick: snapped,
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
                        { channelId: channel.id, tick: snapped },
                        ...updatedPeers.map((p) => ({ channelId: p.channelId, tick: p.curTick })),
                    ];
                    useSceneStore.setState((state) => ({
                        interaction: {
                            ...state.interaction,
                            automationSelectedKeyframes: newSelection,
                        },
                    }));

                    setDragging({ ...drag, kfTick: snapped, peers: updatedPeers });
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
                    // Treat as a click on background → add keyframe
                    if (svgRef.current) {
                        const rect = svgRef.current.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const candTick = toTick(x, width);
                        const snapped = snapTick(candTick, e.altKey);
                        const interpolatedValue = interpolateAtTick(channel, snapped);
                        dispatchSceneCommand(
                            {
                                type: 'addKeyframe',
                                channelId: channel.id,
                                keyframe: { tick: snapped, value: interpolatedValue, easingId: 'linear' },
                            },
                            { source: 'automation-lane' },
                        );
                    }
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
                        // Preserve selections from other channels; replace this channel's selection
                        const others = state.interaction.automationSelectedKeyframes.filter(
                            (k) => k.channelId !== channel.id,
                        );
                        return {
                            interaction: {
                                ...state.interaction,
                                automationSelectedKeyframes: [...others, ...enclosed],
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
        (e: React.PointerEvent<SVGSVGElement>) => {
            // Just clean up state — don't commit any finalisation
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
            // Let diamond handlers handle their own events
            const target = e.target as SVGElement;
            if (target.closest('[data-kf]')) return;

            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

            // Select the element that owns this automation channel
            useSceneStore.getState().setInteractionState({ selectedElementIds: [channel.elementId] });

            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const svgX = e.clientX - rect.left;
            setSelBox({ startX: svgX, endX: svgX, moved: false });
        },
        [channel.elementId, setSelBox],
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
    // Context menu
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
        const close = () => setContextMenuOpen(false);
        window.addEventListener('pointerdown', close);
        return () => window.removeEventListener('pointerdown', close);
    }, [contextMenuOpen]);

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
                onContextMenu={handleContextMenu}
                style={{ display: 'block', cursor: dragging ? 'grabbing' : 'crosshair' }}
            >
            {/* Interpolation lines */}
            {elements.lines.map((line, i) => (
                <line
                    key={`line-${i}`}
                    x1={line.x1}
                    y1={cy}
                    x2={line.x2}
                    y2={cy}
                    stroke="rgba(96,165,250,0.35)"
                    strokeWidth={1}
                />
            ))}

            {/* Keyframe diamonds */}
            {elements.diamonds.map(({ kf, x }) => {
                const sel = isSelected(kf.tick);
                const fill = sel ? '#60a5fa' : 'rgba(96,165,250,0.6)';
                const stroke = sel ? '#93bbfc' : 'rgba(96,165,250,0.8)';
                return (
                    <g
                        key={kf.tick}
                        data-kf="1"
                        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                        onPointerDown={(e) => handleKfPointerDown(e, kf)}
                    >
                        <path
                            d={`M${x} ${cy - DIAMOND_SIZE} L${x + DIAMOND_SIZE} ${cy} L${x} ${cy + DIAMOND_SIZE} L${x - DIAMOND_SIZE} ${cy} Z`}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={1}
                        />
                        {/* Larger hit area */}
                        <rect
                            x={x - DIAMOND_SIZE - 2}
                            y={cy - DIAMOND_SIZE - 2}
                            width={DIAMOND_SIZE * 2 + 4}
                            height={DIAMOND_SIZE * 2 + 4}
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

            {/* Context menu */}
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
