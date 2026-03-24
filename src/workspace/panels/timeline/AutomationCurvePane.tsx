/**
 * AutomationCurvePane — expandable pane below a dope-sheet row showing the
 * full automation curve with draggable control points and easing segments.
 *
 * - Background: horizontal value grid lines (0/25/50/75/100%)
 * - Polyline between keyframes showing the easing-evaluated curve
 * - Control points at each keyframe (tick→x, value→y)
 * - Drag control point vertically → updateKeyframe { value }
 * - Click segment → open easing picker
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTickScale } from './useTickScale';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { CURVE_EDITOR_HEIGHT } from './constants';
import EasingPicker from './EasingPicker';
import easings from '@animation/easing';
import type { AutomationChannel } from '@automation/types';

interface AutomationCurvePaneProps {
    channel: AutomationChannel;
    width: number;
}

const PADDING_Y = 8;
const POINT_RADIUS = 5;
const SAMPLE_COUNT = 80;

type EasingFn = (t: number) => number;
function resolveEasing(id: string): EasingFn {
    const fn = (easings as Record<string, EasingFn | undefined>)[id];
    return fn ?? easings.linear;
}

const AutomationCurvePane: React.FC<AutomationCurvePaneProps> = ({ channel, width }) => {
    const { toX } = useTickScale();
    const height = CURVE_EDITOR_HEIGHT;
    const svgRef = useRef<SVGSVGElement | null>(null);

    const [dragging, setDragging] = useState<{ tick: number; startY: number; baseValue: number } | null>(null);
    const [easingPicker, setEasingPicker] = useState<{ tick: number; x: number; y: number } | null>(null);

    // Compute value range for vertical mapping
    const { minVal, maxVal } = useMemo(() => {
        if (channel.valueType === 'boolean' || channel.valueType === 'color') {
            return { minVal: 0, maxVal: 1 };
        }
        const vals = channel.keyframes.map((kf) =>
            typeof kf.value === 'number' ? kf.value : 0,
        );
        if (vals.length === 0) return { minVal: 0, maxVal: 1 };
        let mn = Math.min(...vals);
        let mx = Math.max(...vals);
        if (mn === mx) {
            mn -= 0.5;
            mx += 0.5;
        }
        // Add some padding
        const pad = (mx - mn) * 0.1;
        return { minVal: mn - pad, maxVal: mx + pad };
    }, [channel.keyframes, channel.valueType]);

    const valueToY = useCallback(
        (val: number) => {
            const t = (val - minVal) / (maxVal - minVal);
            return height - PADDING_Y - t * (height - PADDING_Y * 2);
        },
        [minVal, maxVal, height],
    );

    const yToValue = useCallback(
        (y: number) => {
            const t = (height - PADDING_Y - y) / (height - PADDING_Y * 2);
            return minVal + t * (maxVal - minVal);
        },
        [minVal, maxVal, height],
    );

    // Build sampled polyline showing the eased curve
    const curvePath = useMemo(() => {
        const kfs = channel.keyframes;
        if (kfs.length < 2) return '';

        const pts: string[] = [];
        for (let i = 0; i < kfs.length - 1; i++) {
            const a = kfs[i];
            const b = kfs[i + 1];
            const aVal = typeof a.value === 'number' ? a.value : 0;
            const bVal = typeof b.value === 'number' ? b.value : 0;
            const easeFn = resolveEasing(a.easingId);

            const segSamples = Math.max(4, Math.round(SAMPLE_COUNT / Math.max(1, kfs.length - 1)));
            for (let s = 0; s <= segSamples; s++) {
                const localT = s / segSamples;
                const easedT = channel.interpolation === 'stepped' ? 0 : easeFn(localT);
                const val = aVal + (bVal - aVal) * easedT;
                const tick = a.tick + (b.tick - a.tick) * localT;
                const x = toX(tick, width);
                const y = valueToY(val);
                pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
            }
        }
        return pts.join(' ');
    }, [channel, toX, width, valueToY]);

    // Control points
    const points = useMemo(() => {
        return channel.keyframes.map((kf) => {
            const val = typeof kf.value === 'number' ? kf.value : 0;
            return {
                tick: kf.tick,
                x: toX(kf.tick, width),
                y: valueToY(val),
                value: val,
                easingId: kf.easingId,
            };
        });
    }, [channel.keyframes, toX, width, valueToY]);

    const handlePointDown = useCallback(
        (e: React.PointerEvent, tick: number, value: number) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            setDragging({ tick, startY: e.clientY, baseValue: value });
        },
        [],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragging || !svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const newVal = yToValue(y);
            dispatchSceneCommand(
                {
                    type: 'updateKeyframe',
                    channelId: channel.id,
                    tick: dragging.tick,
                    patch: { value: newVal },
                },
                {
                    source: 'curve-editor',
                    mergeKey: `curve-drag:${channel.id}:${dragging.tick}`,
                    transient: true,
                },
            );
        },
        [dragging, channel.id, yToValue],
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!dragging) return;
            try {
                (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
            } catch { /* ignore */ }
            // Finalize
            if (!svgRef.current) {
                setDragging(null);
                return;
            }
            const rect = svgRef.current.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const newVal = yToValue(y);
            dispatchSceneCommand(
                {
                    type: 'updateKeyframe',
                    channelId: channel.id,
                    tick: dragging.tick,
                    patch: { value: newVal },
                },
                {
                    source: 'curve-editor',
                    mergeKey: `curve-drag:${channel.id}:${dragging.tick}`,
                    transient: false,
                },
            );
            setDragging(null);
        },
        [dragging, channel.id, yToValue],
    );

    // Click on a segment to show easing picker
    const handleSegmentClick = useCallback(
        (e: React.MouseEvent, tick: number) => {
            e.stopPropagation();
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            setEasingPicker({
                tick,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        },
        [],
    );

    const handleEasingSelect = useCallback(
        (easingId: string) => {
            if (!easingPicker) return;
            dispatchSceneCommand(
                {
                    type: 'updateKeyframe',
                    channelId: channel.id,
                    tick: easingPicker.tick,
                    patch: { easingId },
                },
                { source: 'curve-editor' },
            );
            setEasingPicker(null);
        },
        [easingPicker, channel.id],
    );

    // Grid lines at 0%, 25%, 50%, 75%, 100% of value range
    const gridLines = useMemo(() => {
        return [0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const val = minVal + frac * (maxVal - minVal);
            return { y: valueToY(val), label: val.toFixed(1) };
        });
    }, [minVal, maxVal, valueToY]);

    return (
        <div className="ae-curve-pane relative" style={{ height, width }}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                className="absolute inset-0"
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                {/* Value grid lines */}
                {gridLines.map((gl, i) => (
                    <g key={i}>
                        <line
                            x1={0}
                            y1={gl.y}
                            x2={width}
                            y2={gl.y}
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth={1}
                        />
                        <text
                            x={4}
                            y={gl.y - 2}
                            fill="rgba(255,255,255,0.25)"
                            fontSize={9}
                        >
                            {gl.label}
                        </text>
                    </g>
                ))}

                {/* Eased curve polyline */}
                {curvePath && (
                    <polyline
                        points={curvePath}
                        fill="none"
                        stroke="rgba(96,165,250,0.6)"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                    />
                )}

                {/* Clickable segment hit areas */}
                {points.map((pt, i) => {
                    if (i >= points.length - 1) return null;
                    const next = points[i + 1];
                    return (
                        <rect
                            key={`seg-${pt.tick}`}
                            x={pt.x}
                            y={0}
                            width={Math.max(1, next.x - pt.x)}
                            height={height}
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => handleSegmentClick(e, pt.tick)}
                            data-seg="1"
                        />
                    );
                })}

                {/* Control points */}
                {points.map((pt) => (
                    <circle
                        key={pt.tick}
                        cx={pt.x}
                        cy={pt.y}
                        r={POINT_RADIUS}
                        fill="#60a5fa"
                        stroke="#93bbfc"
                        strokeWidth={1.5}
                        style={{ cursor: 'ns-resize' }}
                        onPointerDown={(e) => handlePointDown(e, pt.tick, pt.value)}
                    />
                ))}
            </svg>

            {/* Easing picker popover */}
            {easingPicker && (
                <div
                    className="absolute z-50"
                    style={{
                        left: Math.min(easingPicker.x, width - 260),
                        top: Math.min(easingPicker.y, height - 40),
                    }}
                >
                    <div className="ae-easing-picker-popover">
                        <EasingPicker
                            currentEasingId={
                                channel.keyframes.find(
                                    (kf) => Math.abs(kf.tick - easingPicker.tick) < 0.5,
                                )?.easingId ?? 'linear'
                            }
                            onSelect={handleEasingSelect}
                        />
                        <button
                            type="button"
                            className="ae-easing-close"
                            onClick={() => setEasingPicker(null)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AutomationCurvePane;
