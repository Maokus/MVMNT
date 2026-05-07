/**
 * AutomationCurvePane — expandable pane below a dope-sheet row showing the
 * full automation curve with draggable control points, bezier handles, and
 * segment interpolation editing.
 *
 * - Background: horizontal value grid lines at nice round values (chart-axis style)
 * - Polyline/path between keyframes showing the interpolation-aware curve
 * - Control points at each keyframe (tick → x, value → y)
 * - Bezier handles shown when segment is in bezier mode
 * - Drag control point horizontally+vertically → moveKeyframe + updateKeyframe { value }
 * - Drag handle → updateKeyframe { leftHandle/rightHandle }
 * - Click segment → open interpolation picker
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
import { useTickScale } from '../hooks/useTickScale';
import { useCurveRange, useCurveRangeControls } from '../context/curveRangeContext';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import InterpolationPicker from './InterpolationPicker';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { EnhancedConfigSchema } from '@core/types';
import { computeAutoHandles, DEFAULT_SEGMENT_INTERPOLATION } from '@automation/interpolation-defaults';
import type { AutomationChannel, SegmentInterpolation, HandleType } from '@automation/types';
import { useCurveHeight, useCurveHeightSetter } from '../context/curveHeightContext';
import { useSnapTicks } from '../hooks/useSnapTicks';

import {
    PADDING_Y,
    computeAutoRange,
    enforceMinSpan,
    generateYTicks,
    buildCurveSegments,
    buildHandleVisuals,
    valueToYCoord,
} from './automationCurveUtils';
import { useAutomationCurveDrag } from './useAutomationCurveDrag';
import { useResizeHandle } from './useResizeHandle';

// ─── Visual constants ─────────────────────────────────────────────────────────

const POINT_RADIUS = 5;
const HANDLE_RADIUS = 3.5;
const HANDLE_HIT_RADIUS = 8;

// ─── Props ────────────────────────────────────────────────────────────────────

interface AutomationCurvePaneProps {
    channel: AutomationChannel;
    width: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

const AutomationCurvePane: React.FC<AutomationCurvePaneProps> = ({ channel, width }) => {
    const { toX, toTick } = useTickScale();
    const snapTick = useSnapTicks();
    const height = useCurveHeight(channel.id);
    const setHeight = useCurveHeightSetter();
    const svgRef = useRef<SVGSVGElement | null>(null);

    const [interpolationPicker, setInterpolationPicker] = useState<{ tick: number } | null>(null);

    // ── Range controls ────────────────────────────────────────────────────────
    const { autoRange, manualMin, manualMax } = useCurveRange(channel.id);
    const { setAutoRange, setManualRange, displayedRefs } = useCurveRangeControls();

    // ── Interpolation picker floating UI ──────────────────────────────────────
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

    // ── Property schema (step / min / max) ────────────────────────────────────
    const elementType = useSceneStore(
        useCallback((s) => s.elements[channel.elementId]?.type, [channel.elementId]),
    );
    const { propertyStep, propertyMin, propertyMax } = useMemo(() => {
        if (!elementType) return { propertyStep: undefined, propertyMin: undefined, propertyMax: undefined };
        const schema = sceneElementRegistry.getSchema(elementType) as EnhancedConfigSchema | null;
        if (!schema?.tabs) return { propertyStep: undefined, propertyMin: undefined, propertyMax: undefined };
        for (const group of schema.tabs.flatMap((t) => t.groups)) {
            const prop = group.properties?.find((p) => p.key === channel.propertyKey);
            if (prop) {
                return {
                    propertyStep: prop.step !== undefined && prop.step > 0 ? prop.step : undefined,
                    propertyMin: prop.min,
                    propertyMax: prop.max,
                };
            }
        }
        return { propertyStep: undefined, propertyMin: undefined, propertyMax: undefined };
    }, [elementType, channel.propertyKey]);

    // ── Displayed value range (smoothly animated) ─────────────────────────────

    // Auto range from keyframe data
    const { minVal: autoMinVal, maxVal: autoMaxVal } = useMemo(
        () => computeAutoRange(channel, propertyMin, propertyMax),
        [channel, propertyMin, propertyMax],
    );

    // Target range: auto (with min span) or manual (with min span)
    const [targetMin, targetMax] = useMemo(() => {
        const [autoMin, autoMax] = enforceMinSpan(autoMinVal, autoMaxVal, propertyStep);
        if (autoRange) return [autoMin, autoMax];
        return enforceMinSpan(manualMin, manualMax, propertyStep);
    }, [autoRange, autoMinVal, autoMaxVal, manualMin, manualMax, propertyStep]);

    // Lerp toward target each animation frame (~150ms visual half-life at 60fps)
    const animMinRef = useRef(targetMin);
    const animMaxRef = useRef(targetMax);
    const [displayedMin, setDisplayedMin] = useState(targetMin);
    const [displayedMax, setDisplayedMax] = useState(targetMax);
    const smoothAnimRef = useRef<number | null>(null);

    useEffect(() => {
        // Snap immediately in manual mode for responsive scroll panning; smooth lerp for auto-range transitions.
        const LERP = autoRange ? 0.12 : 1;
        const SNAP_THRESHOLD = 1e-4;

        const animate = () => {
            const dMin = targetMin - animMinRef.current;
            const dMax = targetMax - animMaxRef.current;
            if (Math.abs(dMin) < SNAP_THRESHOLD && Math.abs(dMax) < SNAP_THRESHOLD) {
                animMinRef.current = targetMin;
                animMaxRef.current = targetMax;
                displayedRefs.current[channel.id] = { min: targetMin, max: targetMax };
                setDisplayedMin(targetMin);
                setDisplayedMax(targetMax);
                smoothAnimRef.current = null;
                return;
            }
            animMinRef.current += dMin * LERP;
            animMaxRef.current += dMax * LERP;
            displayedRefs.current[channel.id] = {
                min: animMinRef.current,
                max: animMaxRef.current,
            };
            setDisplayedMin(animMinRef.current);
            setDisplayedMax(animMaxRef.current);
            smoothAnimRef.current = requestAnimationFrame(animate);
        };

        if (smoothAnimRef.current !== null) cancelAnimationFrame(smoothAnimRef.current);
        smoothAnimRef.current = requestAnimationFrame(animate);
        return () => {
            if (smoothAnimRef.current !== null) cancelAnimationFrame(smoothAnimRef.current);
        };
    }, [targetMin, targetMax, autoRange, channel.id, displayedRefs]);

    const minVal = displayedMin;
    const maxVal = displayedMax;

    // ── Coordinate helpers ────────────────────────────────────────────────────

    const valueToY = useCallback(
        (val: number) => valueToYCoord(val, minVal, maxVal, height),
        [minVal, maxVal, height],
    );

    // ── Derived rendering data ─────────────────────────────────────────────────

    const curveSegments = useMemo(
        () => buildCurveSegments(channel, toX, width, valueToY),
        [channel, toX, width, valueToY],
    );

    const controlPoints = useMemo(
        () =>
            channel.keyframes.map((kf) => {
                const val = typeof kf.value === 'number' ? kf.value : 0;
                return {
                    tick: kf.tick,
                    x: toX(kf.tick, width),
                    y: valueToY(val),
                    value: val,
                    segmentInterpolation: kf.segmentInterpolation,
                };
            }),
        [channel.keyframes, toX, width, valueToY],
    );

    const handleVisuals = useMemo(
        () => buildHandleVisuals(channel.keyframes, toX, width, valueToY),
        [channel.keyframes, toX, width, valueToY],
    );

    // Grid ticks at "nice" round values derived from the current display range
    const gridTicks = useMemo(
        () => generateYTicks(minVal, maxVal),
        [minVal, maxVal],
    );

    // ── Selection state ───────────────────────────────────────────────────────

    const selectedKeyframeTicks = useSelectionStore(
        useCallback(
            (s) =>
                new Set(
                    s.selectedKeyframes
                        .filter((k) => k.channelId === channel.id)
                        .map((k) => k.tick),
                ),
            [channel.id],
        ),
    );

    // ── Drag handlers ─────────────────────────────────────────────────────────

    const {
        hoveredHandle,
        liveTickRef,
        handlePointDown,
        handleHandleDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerCancel,
        setHoveredHandle,
    } = useAutomationCurveDrag({
        channel,
        width,
        minVal,
        maxVal,
        svgRef,
        toX,
        toTick,
        valueToY,
        snapTick,
        height,
        propertyMin,
        propertyMax,
    });

    // ── Wheel scroll — pan value range ───────────────────────────────────────

    // Use a ref for autoRange so the native listener below can always see the latest value
    // without needing to be recreated on every autoRange change.
    const autoRangeRef = useRef(autoRange);
    autoRangeRef.current = autoRange;

    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            // Stop propagation natively so the timeline's native wheel listener (attached to
            // a parent DOM element) never sees this event.
            e.stopPropagation();
            e.preventDefault();
            const currentMin = animMinRef.current;
            const currentMax = animMaxRef.current;
            const rangeSpan = currentMax - currentMin;
            const shift = (e.deltaY / 100) * rangeSpan * 0.3;
            if (autoRangeRef.current) {
                setAutoRange(channel.id, false);
            }
            setManualRange(channel.id, currentMin + shift, currentMax + shift);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [channel.id, setAutoRange, setManualRange]);

    // ── Resize handle ─────────────────────────────────────────────────────────

    const { handleResizeDown, handleResizeMove, handleResizeUp } = useResizeHandle({
        channelId: channel.id,
        height,
        setHeight,
    });

    // ── Interpolation picker commands ─────────────────────────────────────────

    const handleSegmentClick = useCallback(
        (e: React.MouseEvent, tick: number) => {
            e.stopPropagation();
            const kfs = useSceneStore.getState().automation.channels[channel.id]?.keyframes ?? [];
            const idx = kfs.findIndex((kf) => Math.abs(kf.tick - tick) < 0.5);
            if (idx < 0 || idx >= kfs.length - 1) return;
            const leftTick = kfs[idx].tick;
            if (e.shiftKey) {
                const existing = useSelectionStore.getState().selectedKeyframes;
                const hasLeft = existing.some(
                    (k) => k.channelId === channel.id && Math.abs(k.tick - leftTick) < 0.5,
                );
                const toAdd = hasLeft ? [] : [{ channelId: channel.id, tick: leftTick }];
                useSelectionStore.getState().selectKeyframes([...existing, ...toAdd]);
            } else {
                useSelectionStore.getState().selectKeyframes([{ channelId: channel.id, tick: leftTick }]);
            }
        },
        [channel.id],
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
                        { source: 'curve-editor' },
                    );
                }
            } else {
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: interpolationPicker.tick, patch: { segmentInterpolation: interpolation } },
                    { source: 'curve-editor' },
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
                (k) =>
                    k.channelId === channel.id && Math.abs(k.tick - interpolationPicker.tick) < 0.5,
            );
            if (isPartOfSelection && allSelected.length > 1) {
                for (const { channelId, tick } of allSelected) {
                    dispatchSceneCommand(
                        { type: 'updateKeyframe', channelId, tick, patch },
                        { source: 'curve-editor' },
                    );
                }
            } else {
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: interpolationPicker.tick, patch },
                    { source: 'curve-editor' },
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

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div ref={containerRef} className="ae-curve-pane relative" style={{ height, width }}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                className="absolute inset-0"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
            >
                {/* Y-axis grid lines at nice round values */}
                {gridTicks.map((tick) => {
                    const y = valueToY(tick.value);
                    return (
                        <g key={tick.value}>
                            <line
                                x1={0} y1={y} x2={width} y2={y}
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth={1}
                            />
                            <text
                                x={54} y={y - 2}
                                fill="rgba(255,255,255,0.25)"
                                fontSize={9}
                            >
                                {tick.label}
                            </text>
                        </g>
                    );
                })}

                {/* Curve polyline — per-segment for selection highlighting */}
                {curveSegments.map((seg) => {
                    const isSelected = selectedKeyframeTicks.has(seg.tick);
                    return (
                        <polyline
                            key={`curve-${seg.tick}`}
                            points={seg.points}
                            fill="none"
                            stroke={isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(96,165,250,0.6)'}
                            strokeWidth={isSelected ? 2 : 1.5}
                            strokeLinejoin="round"
                            pointerEvents="none"
                            style={isSelected ? { filter: 'drop-shadow(0 0 3px rgba(147,197,253,0.7))' } : undefined}
                        />
                    );
                })}

                {/* Clickable segment hit areas */}
                {controlPoints.map((pt, i) => {
                    if (i >= controlPoints.length - 1) return null;
                    const next = controlPoints[i + 1];
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
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                pickerRefs.setReference({
                                    getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0),
                                });
                                setInterpolationPicker({ tick: pt.tick });
                            }}
                            data-seg="1"
                        />
                    );
                })}

                {/* Bezier handle arms and hit circles */}
                {handleVisuals.map((hv) => {
                    const isHoverLeft = hoveredHandle?.tick === hv.tick && hoveredHandle?.side === 'left';
                    const isHoverRight = hoveredHandle?.tick === hv.tick && hoveredHandle?.side === 'right';
                    return (
                        <g key={`handle-${hv.tick}`}>
                            {hv.showLeft && (
                                <>
                                    <line
                                        x1={hv.kfX} y1={hv.kfY} x2={hv.leftX} y2={hv.leftY}
                                        stroke={isHoverLeft ? 'rgba(250,204,21,0.9)' : 'rgba(250,204,21,0.5)'}
                                        strokeWidth={1}
                                        pointerEvents="none"
                                    />
                                    <circle
                                        cx={hv.leftX} cy={hv.leftY} r={HANDLE_RADIUS}
                                        fill={isHoverLeft ? '#fde047' : (hv.leftIsAuto ? 'transparent' : '#facc15')}
                                        stroke={isHoverLeft ? '#fef08a' : '#facc15'}
                                        strokeWidth={isHoverLeft ? 2 : 1.5}
                                        pointerEvents="none"
                                    />
                                    <circle
                                        cx={hv.leftX} cy={hv.leftY} r={HANDLE_HIT_RADIUS}
                                        fill="transparent"
                                        style={{ cursor: 'grab' }}
                                        onPointerDown={(e) => handleHandleDown(e, hv.tick, 'left')}
                                        onPointerEnter={() => setHoveredHandle({ tick: hv.tick, side: 'left' })}
                                        onPointerLeave={() => setHoveredHandle(null)}
                                    />
                                </>
                            )}
                            {hv.showRight && (
                                <>
                                    <line
                                        x1={hv.kfX} y1={hv.kfY} x2={hv.rightX} y2={hv.rightY}
                                        stroke={isHoverRight ? 'rgba(250,204,21,0.9)' : 'rgba(250,204,21,0.5)'}
                                        strokeWidth={1}
                                        pointerEvents="none"
                                    />
                                    <circle
                                        cx={hv.rightX} cy={hv.rightY} r={HANDLE_RADIUS}
                                        fill={isHoverRight ? '#fde047' : (hv.rightIsAuto ? 'transparent' : '#facc15')}
                                        stroke={isHoverRight ? '#fef08a' : '#facc15'}
                                        strokeWidth={isHoverRight ? 2 : 1.5}
                                        pointerEvents="none"
                                    />
                                    <circle
                                        cx={hv.rightX} cy={hv.rightY} r={HANDLE_HIT_RADIUS}
                                        fill="transparent"
                                        style={{ cursor: 'grab' }}
                                        onPointerDown={(e) => handleHandleDown(e, hv.tick, 'right')}
                                        onPointerEnter={() => setHoveredHandle({ tick: hv.tick, side: 'right' })}
                                        onPointerLeave={() => setHoveredHandle(null)}
                                    />
                                </>
                            )}
                        </g>
                    );
                })}

                {/* Control points */}
                {controlPoints.map((pt) => {
                    const isSelected = selectedKeyframeTicks.has(pt.tick);
                    return (
                        <circle
                            key={pt.tick}
                            cx={pt.x}
                            cy={pt.y}
                            r={POINT_RADIUS}
                            fill={isSelected ? '#ffffff' : '#60a5fa'}
                            stroke="#93bbfc"
                            strokeWidth={isSelected ? 2 : 1.5}
                            style={{
                                cursor: 'grab',
                                filter: isSelected
                                    ? 'drop-shadow(0 0 3px rgba(147,197,253,0.7))'
                                    : undefined,
                            }}
                            onPointerDown={(e) => handlePointDown(e, pt.tick, pt.value)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const kfIdx = channel.keyframes.findIndex(
                                    (k) => Math.abs(k.tick - pt.tick) < 0.5,
                                );
                                if (kfIdx < 0 || channel.keyframes.length < 2) return;
                                const pickerTick =
                                    kfIdx < channel.keyframes.length - 1
                                        ? pt.tick
                                        : channel.keyframes[kfIdx - 1].tick;
                                pickerRefs.setReference({
                                    getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0),
                                });
                                setInterpolationPicker({ tick: pickerTick });
                            }}
                        />
                    );
                })}
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

export default AutomationCurvePane;
