/**
 * AutomationCurvePane — expandable pane below a dope-sheet row showing the
 * full automation curve with draggable control points, bezier handles, and
 * segment interpolation editing.
 *
 * - Background: horizontal value grid lines (0/25/50/75/100%)
 * - Polyline/path between keyframes showing the interpolation-aware curve
 * - Control points at each keyframe (tick->x, value->y)
 * - Bezier handles shown when segment is in bezier mode
 * - Drag control point vertically -> updateKeyframe { value }
 * - Drag handle -> updateKeyframe { leftHandle/rightHandle }
 * - Click segment -> open interpolation picker
 * - Drag resize handle at bottom to change pane height
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
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useSceneStore } from '@state/sceneStore';
import InterpolationPicker from './InterpolationPicker';
import { resolveParametricEasing } from '@math/animation/easing-parametric';
import { evaluateSegmentBezier } from '@math/animation/cubic-bezier';
import { computeAutoHandles, DEFAULT_SEGMENT_INTERPOLATION } from '@automation/interpolation-defaults';
import easings from '@math/animation/easing';
import type { AutomationChannel, AutomationKeyframe, BezierHandle, SegmentInterpolation, HandleType } from '@automation/types';
import { useCurveHeight, useCurveHeightSetter } from './curveHeightContext';

interface AutomationCurvePaneProps {
    channel: AutomationChannel;
    width: number;
}

const PADDING_Y = 8;
const POINT_RADIUS = 5;
const HANDLE_RADIUS = 3.5;
const SAMPLE_COUNT = 80;

type EasingFn = (t: number) => number;
function resolveLegacyEasing(id: string): EasingFn {
    const fn = (easings as Record<string, EasingFn | undefined>)[id];
    return fn ?? easings.linear;
}

const AutomationCurvePane: React.FC<AutomationCurvePaneProps> = ({ channel, width }) => {
    const { toX, toTick } = useTickScale();
    const height = useCurveHeight(channel.id);
    const setHeight = useCurveHeightSetter();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

    const [dragging, setDragging] = useState<{
        tick: number; startY: number; baseValue: number;
        frozenMinVal: number; frozenMaxVal: number;
    } | null>(null);

    const [handleDrag, setHandleDrag] = useState<{
        tick: number; side: 'left' | 'right';
        frozenMinVal: number; frozenMaxVal: number;
    } | null>(null);

    const [interpolationPicker, setInterpolationPicker] = useState<{ tick: number } | null>(null);

    const { refs: pickerRefs, floatingStyles: pickerFloatingStyles } = useFloating({
        open: interpolationPicker !== null,
        placement: 'bottom-start',
        middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
    });

    // Close picker on outside click
    useEffect(() => {
        if (!interpolationPicker) return;
        const close = () => setInterpolationPicker(null);
        window.addEventListener('pointerdown', close);
        return () => window.removeEventListener('pointerdown', close);
    }, [interpolationPicker]);

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
        (y: number, frozenMin: number, frozenMax: number) => {
            const t = (height - PADDING_Y - y) / (height - PADDING_Y * 2);
            return frozenMin + t * (frozenMax - frozenMin);
        },
        [height],
    );

    // Build sampled curve path showing the actual interpolation
    const curvePath = useMemo(() => {
        const kfs = channel.keyframes;
        if (kfs.length < 2) return '';

        const pts: string[] = [];
        for (let i = 0; i < kfs.length - 1; i++) {
            const a = kfs[i];
            const b = kfs[i + 1];
            const aVal = typeof a.value === 'number' ? a.value : 0;
            const bVal = typeof b.value === 'number' ? b.value : 0;
            const segSamples = Math.max(4, Math.round(SAMPLE_COUNT / Math.max(1, kfs.length - 1)));

            const interp = a.segmentInterpolation;

            if (interp) {
                // New interpolation system
                if (interp.mode === 'constant') {
                    // Step shape: horizontal then vertical
                    const xA = toX(a.tick, width);
                    const yA = valueToY(aVal);
                    const xB = toX(b.tick, width);
                    const yB = valueToY(bVal);
                    pts.push(`${xA.toFixed(1)},${yA.toFixed(1)}`);
                    pts.push(`${xB.toFixed(1)},${yA.toFixed(1)}`);
                    pts.push(`${xB.toFixed(1)},${yB.toFixed(1)}`);
                    continue;
                }

                if (interp.mode === 'bezier') {
                    // Sample cubic bezier curve
                    const prevHandleType = a.rightHandleType ?? 'auto_clamped';
                    const nextHandleType = b.leftHandleType ?? 'auto_clamped';
                    let rHandle = a.rightHandle;
                    let lHandle = b.leftHandle;

                    if (!rHandle || prevHandleType === 'auto' || prevHandleType === 'auto_clamped') {
                        const prevPrev = i > 0 ? kfs[i - 1] : null;
                        const computed = computeAutoHandles(prevPrev, a, b, prevHandleType === 'auto' ? 'auto' : 'auto_clamped');
                        rHandle = computed.right;
                    }
                    if (!lHandle || nextHandleType === 'auto' || nextHandleType === 'auto_clamped') {
                        const nextNext = i + 2 < kfs.length ? kfs[i + 2] : null;
                        const computed = computeAutoHandles(a, b, nextNext, nextHandleType === 'auto' ? 'auto' : 'auto_clamped');
                        lHandle = computed.left;
                    }

                    for (let s = 0; s <= segSamples; s++) {
                        const localT = s / segSamples;
                        const val = evaluateSegmentBezier(localT, a.tick, aVal, rHandle, b.tick, bVal, lHandle);
                        const tick = a.tick + (b.tick - a.tick) * localT;
                        const x = toX(tick, width);
                        const y = valueToY(val);
                        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
                    }
                    continue;
                }

                // Semantic preset or linear
                const easingFn = resolveParametricEasing(interp.mode, interp.direction, interp.params);
                for (let s = 0; s <= segSamples; s++) {
                    const localT = s / segSamples;
                    const easedT = easingFn ? easingFn(localT) : localT;
                    const val = aVal + (bVal - aVal) * easedT;
                    const tick = a.tick + (b.tick - a.tick) * localT;
                    const x = toX(tick, width);
                    const y = valueToY(val);
                    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
                }
            } else {
                // Legacy fallback
                const easeFn = resolveLegacyEasing(a.easingId);
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
                segmentInterpolation: kf.segmentInterpolation,
            };
        });
    }, [channel.keyframes, toX, width, valueToY]);

    // Bezier handle visual data
    const handleVisuals = useMemo(() => {
        const kfs = channel.keyframes;
        const result: Array<{
            tick: number;
            kfX: number; kfY: number;
            leftX: number; leftY: number;
            rightX: number; rightY: number;
            showLeft: boolean; showRight: boolean;
            leftIsAuto: boolean; rightIsAuto: boolean;
        }> = [];

        for (let i = 0; i < kfs.length; i++) {
            const kf = kfs[i];
            const val = typeof kf.value === 'number' ? kf.value : 0;
            const kfX = toX(kf.tick, width);
            const kfY = valueToY(val);

            // Show right handle if this keyframe's outgoing segment is bezier
            const showRight = i < kfs.length - 1 && kf.segmentInterpolation?.mode === 'bezier';
            // Show left handle if the previous keyframe's outgoing segment is bezier
            const showLeft = i > 0 && kfs[i - 1].segmentInterpolation?.mode === 'bezier';

            if (!showLeft && !showRight) continue;

            const leftType = kf.leftHandleType ?? 'auto_clamped';
            const rightType = kf.rightHandleType ?? 'auto_clamped';
            const leftIsAuto = leftType === 'auto' || leftType === 'auto_clamped';
            const rightIsAuto = rightType === 'auto' || rightType === 'auto_clamped';

            let leftHandle = kf.leftHandle;
            let rightHandle = kf.rightHandle;

            // Auto-compute if needed
            if ((showLeft && (!leftHandle || leftIsAuto)) || (showRight && (!rightHandle || rightIsAuto))) {
                const prev = i > 0 ? kfs[i - 1] : null;
                const next = i < kfs.length - 1 ? kfs[i + 1] : null;
                const computed = computeAutoHandles(prev, kf, next, leftIsAuto && rightIsAuto ? (leftType === 'auto' ? 'auto' : 'auto_clamped') : 'auto_clamped');
                if (!leftHandle || leftIsAuto) leftHandle = computed.left;
                if (!rightHandle || rightIsAuto) rightHandle = computed.right;
            }

            const lh = leftHandle ?? { dt: 0, dv: 0 };
            const rh = rightHandle ?? { dt: 0, dv: 0 };

            result.push({
                tick: kf.tick,
                kfX, kfY,
                leftX: toX(kf.tick + lh.dt, width),
                leftY: valueToY(val + lh.dv),
                rightX: toX(kf.tick + rh.dt, width),
                rightY: valueToY(val + rh.dv),
                showLeft,
                showRight,
                leftIsAuto,
                rightIsAuto,
            });
        }
        return result;
    }, [channel.keyframes, toX, width, valueToY]);

    // --- Keyframe value drag handlers ---

    const handlePointDown = useCallback(
        (e: React.PointerEvent, tick: number, value: number) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            useSceneStore.getState().setInteractionState({ selectedElementIds: [channel.elementId] });
            setDragging({ tick, startY: e.clientY, baseValue: value, frozenMinVal: minVal, frozenMaxVal: maxVal });
        },
        [minVal, maxVal, channel.elementId],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (dragging && svgRef.current) {
                const rect = svgRef.current.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const newVal = yToValue(y, dragging.frozenMinVal, dragging.frozenMaxVal);
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: dragging.tick, patch: { value: newVal } },
                    { source: 'curve-editor', mergeKey: `curve-drag:${channel.id}:${dragging.tick}`, transient: true },
                );
                return;
            }
            if (handleDrag && svgRef.current) {
                const rect = svgRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const kf = channel.keyframes.find((k) => Math.abs(k.tick - handleDrag.tick) < 0.5);
                if (!kf) return;
                const kfVal = typeof kf.value === 'number' ? kf.value : 0;
                const handleTick = toTick(mouseX, width);
                const handleVal = yToValue(mouseY, handleDrag.frozenMinVal, handleDrag.frozenMaxVal);
                const dt = handleTick - kf.tick;
                const dv = handleVal - kfVal;
                const handle: BezierHandle = { dt, dv };

                const patch: Record<string, unknown> = {};
                if (handleDrag.side === 'left') {
                    patch.leftHandle = handle;
                    patch.leftHandleType = 'free';
                } else {
                    patch.rightHandle = handle;
                    patch.rightHandleType = 'free';
                }

                // For aligned handles, mirror the opposite side
                const handleType = handleDrag.side === 'left'
                    ? (kf.leftHandleType ?? 'auto_clamped')
                    : (kf.rightHandleType ?? 'auto_clamped');
                if (handleType === 'aligned') {
                    const dist = Math.sqrt(dt * dt + dv * dv);
                    if (dist > 0) {
                        const oppositeKey = handleDrag.side === 'left' ? 'rightHandle' : 'leftHandle';
                        const oppositeTypeKey = handleDrag.side === 'left' ? 'rightHandleType' : 'leftHandleType';
                        const currentOpposite = handleDrag.side === 'left' ? kf.rightHandle : kf.leftHandle;
                        const oppDist = currentOpposite ? Math.sqrt(currentOpposite.dt * currentOpposite.dt + currentOpposite.dv * currentOpposite.dv) : dist;
                        const scale = oppDist / dist;
                        patch[oppositeKey] = { dt: -dt * scale, dv: -dv * scale };
                        patch[oppositeTypeKey] = 'aligned';
                    }
                }

                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: handleDrag.tick, patch: patch as any },
                    { source: 'curve-editor', mergeKey: `handle-drag:${channel.id}:${handleDrag.tick}:${handleDrag.side}`, transient: true },
                );
            }
        },
        [dragging, handleDrag, channel, height, toTick, width, yToValue],
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (dragging) {
                try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                if (svgRef.current) {
                    const rect = svgRef.current.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const newVal = yToValue(y, dragging.frozenMinVal, dragging.frozenMaxVal);
                    dispatchSceneCommand(
                        { type: 'updateKeyframe', channelId: channel.id, tick: dragging.tick, patch: { value: newVal } },
                        { source: 'curve-editor', mergeKey: `curve-drag:${channel.id}:${dragging.tick}`, transient: false },
                    );
                }
                setDragging(null);
                return;
            }
            if (handleDrag) {
                try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                // Finalize handle drag (commit the last transient update)
                if (svgRef.current) {
                    const rect = svgRef.current.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const kf = channel.keyframes.find((k) => Math.abs(k.tick - handleDrag.tick) < 0.5);
                    if (kf) {
                        const kfVal = typeof kf.value === 'number' ? kf.value : 0;
                        const handleTick = toTick(mouseX, width);
                        const handleVal = yToValue(mouseY, handleDrag.frozenMinVal, handleDrag.frozenMaxVal);
                        const handle: BezierHandle = { dt: handleTick - kf.tick, dv: handleVal - kfVal };
                        const patch: Record<string, unknown> = handleDrag.side === 'left'
                            ? { leftHandle: handle, leftHandleType: 'free' }
                            : { rightHandle: handle, rightHandleType: 'free' };
                        dispatchSceneCommand(
                            { type: 'updateKeyframe', channelId: channel.id, tick: handleDrag.tick, patch: patch as any },
                            { source: 'curve-editor', mergeKey: `handle-drag:${channel.id}:${handleDrag.tick}:${handleDrag.side}`, transient: false },
                        );
                    }
                }
                setHandleDrag(null);
            }
        },
        [dragging, handleDrag, channel, height, toTick, width, yToValue],
    );

    // --- Handle drag start ---
    const handleHandleDown = useCallback(
        (e: React.PointerEvent, tick: number, side: 'left' | 'right') => {
            if (e.button !== 0) return;
            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            setHandleDrag({ tick, side, frozenMinVal: minVal, frozenMaxVal: maxVal });
        },
        [minVal, maxVal],
    );

    // --- Segment click → interpolation picker ---
    const handleSegmentClick = useCallback(
        (e: React.MouseEvent, tick: number) => {
            e.stopPropagation();
            pickerRefs.setReference({
                getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0),
            });
            setInterpolationPicker({ tick });
        },
        [pickerRefs],
    );

    const handleInterpolationSelect = useCallback(
        (interpolation: SegmentInterpolation) => {
            if (!interpolationPicker) return;
            dispatchSceneCommand(
                {
                    type: 'updateKeyframe',
                    channelId: channel.id,
                    tick: interpolationPicker.tick,
                    patch: { segmentInterpolation: interpolation },
                },
                { source: 'curve-editor' },
            );
        },
        [interpolationPicker, channel.id],
    );

    // Grid lines at 0%, 25%, 50%, 75%, 100%
    const gridLines = useMemo(() => {
        return [0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const val = minVal + frac * (maxVal - minVal);
            return { y: valueToY(val), label: val.toFixed(1) };
        });
    }, [minVal, maxVal, valueToY]);

    // Resize handle
    const handleResizeDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            resizeDragRef.current = { startY: e.clientY, startHeight: height };
        },
        [height],
    );

    const handleResizeMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!resizeDragRef.current) return;
            const { startY, startHeight } = resizeDragRef.current;
            setHeight(channel.id, startHeight + (e.clientY - startY));
        },
        [channel.id, setHeight],
    );

    const handleResizeUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!resizeDragRef.current) return;
            try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            resizeDragRef.current = null;
        },
        [],
    );

    // Get current interpolation for the selected segment
    const pickerCurrent = useMemo((): SegmentInterpolation => {
        if (!interpolationPicker) return DEFAULT_SEGMENT_INTERPOLATION;
        const kf = channel.keyframes.find((k) => Math.abs(k.tick - interpolationPicker.tick) < 0.5);
        return kf?.segmentInterpolation ?? DEFAULT_SEGMENT_INTERPOLATION;
    }, [interpolationPicker, channel.keyframes]);

    return (
        <div className="ae-curve-pane relative" style={{ height, width }}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                className="absolute inset-0"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                {/* Value grid lines */}
                {gridLines.map((gl, i) => (
                    <g key={i}>
                        <line x1={0} y1={gl.y} x2={width} y2={gl.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                        <text x={4} y={gl.y - 2} fill="rgba(255,255,255,0.25)" fontSize={9}>{gl.label}</text>
                    </g>
                ))}

                {/* Curve polyline */}
                {curvePath && (
                    <polyline
                        points={curvePath}
                        fill="none"
                        stroke="rgba(96,165,250,0.6)"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        pointerEvents="none"
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
                            fill="#00000000"
                            pointerEvents="all"
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => handleSegmentClick(e, pt.tick)}
                            data-seg="1"
                        />
                    );
                })}

                {/* Bezier handle arms and circles */}
                {handleVisuals.map((hv) => (
                    <g key={`handle-${hv.tick}`}>
                        {hv.showLeft && (
                            <>
                                <line
                                    x1={hv.kfX} y1={hv.kfY} x2={hv.leftX} y2={hv.leftY}
                                    stroke="rgba(250,204,21,0.5)" strokeWidth={1}
                                    pointerEvents="none"
                                />
                                <circle
                                    cx={hv.leftX} cy={hv.leftY} r={HANDLE_RADIUS}
                                    fill={hv.leftIsAuto ? 'transparent' : '#facc15'}
                                    stroke="#facc15" strokeWidth={1.5}
                                    style={{ cursor: 'grab' }}
                                    onPointerDown={(e) => handleHandleDown(e, hv.tick, 'left')}
                                />
                            </>
                        )}
                        {hv.showRight && (
                            <>
                                <line
                                    x1={hv.kfX} y1={hv.kfY} x2={hv.rightX} y2={hv.rightY}
                                    stroke="rgba(250,204,21,0.5)" strokeWidth={1}
                                    pointerEvents="none"
                                />
                                <circle
                                    cx={hv.rightX} cy={hv.rightY} r={HANDLE_RADIUS}
                                    fill={hv.rightIsAuto ? 'transparent' : '#facc15'}
                                    stroke="#facc15" strokeWidth={1.5}
                                    style={{ cursor: 'grab' }}
                                    onPointerDown={(e) => handleHandleDown(e, hv.tick, 'right')}
                                />
                            </>
                        )}
                    </g>
                ))}

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

            {/* Resize handle */}
            <div
                className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center hover:bg-blue-500/20 group"
                onPointerDown={handleResizeDown}
                onPointerMove={handleResizeMove}
                onPointerUp={handleResizeUp}
            >
                <div className="w-8 h-0.5 rounded bg-neutral-600 group-hover:bg-blue-400/60" />
            </div>

            {/* Interpolation picker popover */}
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
        </div>
    );
};

export default AutomationCurvePane;
