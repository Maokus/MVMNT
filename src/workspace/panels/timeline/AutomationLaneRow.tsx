/**
 * AutomationLaneRow — SVG dope-sheet row for a single automation channel.
 *
 * Renders keyframe diamonds along the timeline with:
 * - Click empty space → add keyframe at snapped tick
 * - Click diamond → select keyframe
 * - Drag diamond → move keyframe (pointer capture, snap, merge key coalescing)
 * - Delete key → remove selected keyframes
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const AutomationLaneRow: React.FC<AutomationLaneRowProps> = ({ channel, width }) => {
    const { view, toX, toTick } = useTickScale();
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

    const [dragging, setDragging] = useState<{
        kfTick: number;
        startX: number;
        baseTick: number;
    } | null>(null);

    const svgRef = useRef<SVGSVGElement | null>(null);

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

    const handlePointerDown = useCallback(
        (e: React.PointerEvent, kf: AutomationKeyframe) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

            // Select this keyframe
            if (e.shiftKey) {
                // Multi-select toggle
                useSceneStore.setState((state) => {
                    const existing = state.interaction.automationSelectedKeyframes;
                    const idx = existing.findIndex(
                        (k) => k.channelId === channel.id && Math.abs(k.tick - kf.tick) < 0.5,
                    );
                    const next =
                        idx >= 0
                            ? existing.filter((_, i) => i !== idx)
                            : [...existing, { channelId: channel.id, tick: kf.tick }];
                    return {
                        interaction: {
                            ...state.interaction,
                            automationSelectedKeyframes: next,
                        },
                    };
                });
            } else {
                useSceneStore.setState((state) => ({
                    interaction: {
                        ...state.interaction,
                        automationSelectedKeyframes: [
                            { channelId: channel.id, tick: kf.tick },
                        ],
                    },
                }));
            }

            setDragging({ kfTick: kf.tick, startX: e.clientX, baseTick: kf.tick });
        },
        [channel.id],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragging || !svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const candTick = toTick(x, width);
            const snapped = snapTick(candTick, e.altKey);

            if (snapped !== dragging.baseTick) {
                dispatchSceneCommand(
                    {
                        type: 'moveKeyframe',
                        channelId: channel.id,
                        fromTick: dragging.kfTick,
                        toTick: snapped,
                    },
                    {
                        source: 'automation-lane',
                        mergeKey: `kf-move:${channel.id}:${dragging.baseTick}`,
                        transient: true,
                    },
                );
                setDragging((prev) => (prev ? { ...prev, kfTick: snapped } : null));
            }
        },
        [dragging, channel.id, toTick, width, snapTick],
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!dragging) return;
            try {
                (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
            } catch { /* ignore */ }

            // Finalize the move
            if (dragging.kfTick !== dragging.baseTick) {
                dispatchSceneCommand(
                    {
                        type: 'moveKeyframe',
                        channelId: channel.id,
                        fromTick: dragging.kfTick,
                        toTick: dragging.kfTick,
                    },
                    {
                        source: 'automation-lane',
                        mergeKey: `kf-move:${channel.id}:${dragging.baseTick}`,
                        transient: false,
                    },
                );
            }
            setDragging(null);
        },
        [dragging, channel.id],
    );

    // Click on background → add keyframe at snapped tick
    const handleBackgroundClick = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            if (!svgRef.current) return;
            // Don't add if clicking a diamond
            const target = e.target as SVGElement;
            if (target.closest('[data-kf]')) return;

            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const candTick = toTick(x, width);
            const snapped = snapTick(candTick, e.altKey);

            // Interpolate value from surrounding keyframes
            const interpolatedValue = interpolateAtTick(channel, snapped);

            dispatchSceneCommand(
                {
                    type: 'addKeyframe',
                    channelId: channel.id,
                    keyframe: { tick: snapped, value: interpolatedValue, easingId: 'linear' },
                },
                { source: 'automation-lane' },
            );
        },
        [channel, toTick, width, snapTick],
    );

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        },
        [],
    );

    // Close context menu on outside click
    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        window.addEventListener('pointerdown', close);
        return () => window.removeEventListener('pointerdown', close);
    }, [contextMenu]);

    const height = AUTOMATION_ROW_HEIGHT;
    const cy = height / 2;

    return (
        <div className="relative" style={{ width, height }}>
            <svg
                ref={svgRef}
                className="automation-lane-row"
                width={width}
                height={height}
                onClick={handleBackgroundClick}
                onContextMenu={handleContextMenu}
                style={{ display: 'block', cursor: 'crosshair' }}
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
                        style={{ cursor: 'grab' }}
                        onPointerDown={(e) => handlePointerDown(e, kf)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
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
            </svg>

            {/* Context menu */}
            {contextMenu && (
                <div
                    className="ae-context-menu absolute z-50"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className="ae-context-menu-item"
                        onClick={() => {
                            copyChannel(channel);
                            setContextMenu(null);
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
                                setContextMenu(null);
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
                            setContextMenu(null);
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
                            setContextMenu(null);
                        }}
                    >
                        Delete automation
                    </button>
                </div>
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
