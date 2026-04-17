/**
 * AutomationCurvePane — expandable pane below a dope-sheet row showing the
 * full automation curve with draggable control points, bezier handles, and
 * segment interpolation editing.
 *
 * - Background: horizontal value grid lines (0/25/50/75/100%)
 * - Polyline/path between keyframes showing the interpolation-aware curve
 * - Control points at each keyframe (tick->x, value->y)
 * - Bezier handles shown when segment is in bezier mode
 * - Drag control point horizontally+vertically -> moveKeyframe + updateKeyframe { value }
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
import { useCurveRange, useCurveRangeControls } from './curveRangeContext';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useSceneStore } from '@state/sceneStore';
import InterpolationPicker from './InterpolationPicker';
import { resolveParametricEasing } from '@math/animation/easing-parametric';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { EnhancedConfigSchema } from '@core/types';
import { evaluateSegmentBezier } from '@math/animation/cubic-bezier';
import { computeAutoHandles, DEFAULT_SEGMENT_INTERPOLATION } from '@automation/interpolation-defaults';
import easings from '@math/animation/easing';
import type { AutomationChannel, SegmentInterpolation, HandleType } from '@automation/types';
import { useCurveHeight, useCurveHeightSetter } from './curveHeightContext';
import { useSnapTicks } from './useSnapTicks';

interface AutomationCurvePaneProps {
    channel: AutomationChannel;
    width: number;
}

const PADDING_Y = 8;
const POINT_RADIUS = 5;
const HANDLE_RADIUS = 3.5;
const HANDLE_HIT_RADIUS = 8;
const SAMPLE_COUNT = 150;
const COMPLEX_MODE_MIN_SAMPLES = 100;

type EasingFn = (t: number) => number;
function resolveLegacyEasing(id: string): EasingFn {
    const fn = (easings as Record<string, EasingFn | undefined>)[id];
    return fn ?? easings.linear;
}

/** Build the updateKeyframe patch for a handle drag frame, applying aligned mirroring if needed. */
function buildHandlePatch(
    dt: number, dv: number,
    side: 'left' | 'right',
    origType: HandleType,
    frozenOppLength: number,
): Record<string, unknown> {
    const effectiveType = origType === 'aligned' ? 'aligned' : 'free';
    const patch: Record<string, unknown> = side === 'left'
        ? { leftHandle: { dt, dv }, leftHandleType: effectiveType }
        : { rightHandle: { dt, dv }, rightHandleType: effectiveType };

    if (origType === 'aligned') {
        const dist = Math.sqrt(dt * dt + dv * dv);
        if (dist > 0) {
            const scale = frozenOppLength / dist;
            const oppKey = side === 'left' ? 'rightHandle' : 'leftHandle';
            const oppTypeKey = side === 'left' ? 'rightHandleType' : 'leftHandleType';
            patch[oppKey] = { dt: -dt * scale, dv: -dv * scale };
            patch[oppTypeKey] = 'aligned';
        }
    }
    return patch;
}

const AutomationCurvePane: React.FC<AutomationCurvePaneProps> = ({ channel, width }) => {
    const { toX, toTick } = useTickScale();
    const snapTick = useSnapTicks();
    const height = useCurveHeight(channel.id);
    const setHeight = useCurveHeightSetter();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

    const [dragging, setDragging] = useState<{
        baseTick: number; startY: number; baseValue: number;
        frozenMinVal: number; frozenMaxVal: number;
    } | null>(null);
    // Tracks the live tick during a drag (updated each frame to follow moveKeyframe).
    const liveTickRef = useRef<number>(0);

    const [handleDrag, setHandleDrag] = useState<{
        tick: number; side: 'left' | 'right';
        frozenMinVal: number; frozenMaxVal: number;
        origType: HandleType;     // type of the dragged handle at drag-start
        frozenOppLength: number;  // effective length of opposite handle at drag-start (for aligned)
        startMouseX: number;      // client X at drag-start (for shift-axis-snap)
        startMouseY: number;      // client Y at drag-start
    } | null>(null);

    const [interpolationPicker, setInterpolationPicker] = useState<{ tick: number } | null>(null);

    const [hoveredHandle, setHoveredHandle] = useState<{ tick: number; side: 'left' | 'right' } | null>(null);

    const [kfHandleMenu, setKfHandleMenu] = useState<{ tick: number } | null>(null);

    // --- Range controls (state lives in CurveRangeContext, controls live in the label column) ---
    const { autoRange, manualMin, manualMax } = useCurveRange(channel.id);
    const { displayedRefs } = useCurveRangeControls();

    const { refs: pickerRefs, floatingStyles: pickerFloatingStyles } = useFloating({
        open: interpolationPicker !== null,
        placement: 'bottom-start',
        middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
    });

    const { refs: kfMenuRefs, floatingStyles: kfMenuFloatingStyles } = useFloating({
        open: kfHandleMenu !== null,
        placement: 'right-start',
        middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12 })],
        whileElementsMounted: autoUpdate,
    });

    // Close picker on outside click
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

    // Close handle-type menu on outside click
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

    // Resolve the property step, min, and max from the element schema
    const elementType = useSceneStore(useCallback((s) => s.elements[channel.elementId]?.type, [channel.elementId]));
    const { propertyStep, propertyMin, propertyMax } = useMemo(() => {
        if (!elementType) return { propertyStep: undefined, propertyMin: undefined, propertyMax: undefined };
        const schema = sceneElementRegistry.getSchema(elementType) as (EnhancedConfigSchema & { groups?: EnhancedConfigSchema['groups'] }) | null;
        if (!schema?.groups) return { propertyStep: undefined, propertyMin: undefined, propertyMax: undefined };
        for (const group of schema.groups) {
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

    // Compute auto value range for vertical mapping — includes handle positions so
    // handles never appear clipped beyond the curve pane height.
    // If property has explicit min/max constraints, use those as bounds.
    const { minVal: autoMinVal, maxVal: autoMaxVal } = useMemo(() => {
        if (channel.valueType === 'boolean' || channel.valueType === 'color') {
            return { minVal: 0, maxVal: 1 };
        }
        const kfs = channel.keyframes;
        const vals = kfs.map((kf) => typeof kf.value === 'number' ? kf.value : 0);
        if (vals.length === 0) return { minVal: propertyMin ?? 0, maxVal: propertyMax ?? 1 };

        // Include effective handle absolute values so they stay visible
        for (let i = 0; i < kfs.length; i++) {
            const kf = kfs[i];
            const val = typeof kf.value === 'number' ? kf.value : 0;
            const prev = i > 0 ? kfs[i - 1] : null;
            const next = i < kfs.length - 1 ? kfs[i + 1] : null;
            const showLeft = i > 0 && kfs[i - 1].segmentInterpolation?.mode === 'bezier';
            const showRight = i < kfs.length - 1 && kf.segmentInterpolation?.mode === 'bezier';

            if (showLeft) {
                const leftType = kf.leftHandleType ?? 'auto_clamped';
                const leftIsAuto = leftType === 'auto' || leftType === 'auto_clamped';
                let dv: number;
                if (!kf.leftHandle || leftIsAuto) {
                    const c = computeAutoHandles(prev, kf, next, leftType === 'auto' ? 'auto' : 'auto_clamped');
                    dv = c.left.dv;
                } else if (leftType === 'vector' && prev) {
                    dv = ((typeof prev.value === 'number' ? prev.value : 0) - val) / 3;
                } else {
                    dv = kf.leftHandle.dv;
                }
                vals.push(val + dv);
            }
            if (showRight) {
                const rightType = kf.rightHandleType ?? 'auto_clamped';
                const rightIsAuto = rightType === 'auto' || rightType === 'auto_clamped';
                let dv: number;
                if (!kf.rightHandle || rightIsAuto) {
                    const c = computeAutoHandles(prev, kf, next, rightType === 'auto' ? 'auto' : 'auto_clamped');
                    dv = c.right.dv;
                } else if (rightType === 'vector' && next) {
                    dv = ((typeof next.value === 'number' ? next.value : 0) - val) / 3;
                } else {
                    dv = kf.rightHandle.dv;
                }
                vals.push(val + dv);
            }
        }

        let mn = Math.min(...vals);
        let mx = Math.max(...vals);

        if (mn === mx) {
            mn -= 0.5;
            mx += 0.5;
        }
        const pad = (mx - mn) * 0.1;
        let paddedMin = mn - pad;
        let paddedMax = mx + pad;
        // Clamp to property min/max so view never goes beyond property bounds
        if (propertyMin !== undefined) paddedMin = Math.max(paddedMin, propertyMin);
        if (propertyMax !== undefined) paddedMax = Math.min(paddedMax, propertyMax);
        return { minVal: paddedMin, maxVal: paddedMax };
    }, [channel.keyframes, channel.valueType, propertyMin, propertyMax]);

    // Minimum visual span = property step (so the graph never collapses to a flat line)
    const enforceMinSpan = useCallback((mn: number, mx: number): [number, number] => {
        if (propertyStep === undefined) return [mn, mx];
        const span = mx - mn;
        if (span >= propertyStep) return [mn, mx];
        const mid = (mn + mx) / 2;
        return [mid - propertyStep / 2, mid + propertyStep / 2];
    }, [propertyStep]);

    // Raw auto range (computed from keyframes)
    const [rawAutoMin, rawAutoMax] = [autoMinVal, autoMaxVal];
    const [enforcedAutoMin, enforcedAutoMax] = enforceMinSpan(rawAutoMin, rawAutoMax);

    // Target range: auto (with min span) or manual (with min span)
    const [targetMin, targetMax] = useMemo(() => {
        if (autoRange) return [enforcedAutoMin, enforcedAutoMax];
        return enforceMinSpan(manualMin, manualMax);
    }, [autoRange, enforcedAutoMin, enforcedAutoMax, manualMin, manualMax, enforceMinSpan]);

    // Smoothed display range — lerps toward target each animation frame
    // Uses per-channel animated value refs (shared with label controls for seeding manual mode)
    const animMinRef = useRef(targetMin);
    const animMaxRef = useRef(targetMax);
    const [displayedMin, setDisplayedMin] = useState(targetMin);
    const [displayedMax, setDisplayedMax] = useState(targetMax);
    const smoothAnimRef = useRef<number | null>(null);

    useEffect(() => {
        const LERP = 0.12; // per-frame factor (~60fps → ~150ms visual half-life)
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
            displayedRefs.current[channel.id] = { min: animMinRef.current, max: animMaxRef.current };
            setDisplayedMin(animMinRef.current);
            setDisplayedMax(animMaxRef.current);
            smoothAnimRef.current = requestAnimationFrame(animate);
        };

        if (smoothAnimRef.current !== null) cancelAnimationFrame(smoothAnimRef.current);
        smoothAnimRef.current = requestAnimationFrame(animate);
        return () => {
            if (smoothAnimRef.current !== null) cancelAnimationFrame(smoothAnimRef.current);
        };
    }, [targetMin, targetMax, channel.id, displayedRefs]);

    const minVal = displayedMin;
    const maxVal = displayedMax;

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
            const interp = a.segmentInterpolation;
            const base = Math.max(4, Math.round(SAMPLE_COUNT / Math.max(1, kfs.length - 1)));
            const isComplexMode = interp?.mode === 'elastic' || interp?.mode === 'bounce' || interp?.mode === 'back';
            const segSamples = isComplexMode ? Math.max(base, COMPLEX_MODE_MIN_SAMPLES) : base;

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
                    } else if (prevHandleType === 'vector') {
                        const span = b.tick - a.tick;
                        rHandle = { dt: span / 3, dv: (bVal - aVal) / 3 };
                    }
                    if (!lHandle || nextHandleType === 'auto' || nextHandleType === 'auto_clamped') {
                        const nextNext = i + 2 < kfs.length ? kfs[i + 2] : null;
                        const computed = computeAutoHandles(a, b, nextNext, nextHandleType === 'auto' ? 'auto' : 'auto_clamped');
                        lHandle = computed.left;
                    } else if (nextHandleType === 'vector') {
                        const span = b.tick - a.tick;
                        lHandle = { dt: -span / 3, dv: -(bVal - aVal) / 3 };
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

            const prev = i > 0 ? kfs[i - 1] : null;
            const next = i < kfs.length - 1 ? kfs[i + 1] : null;

            // Compute left handle position
            if (showLeft) {
                if (!leftHandle || leftIsAuto) {
                    const computed = computeAutoHandles(prev, kf, next, leftType === 'auto' ? 'auto' : 'auto_clamped');
                    leftHandle = computed.left;
                } else if (leftType === 'vector' && prev) {
                    leftHandle = { dt: (prev.tick - kf.tick) / 3, dv: ((typeof prev.value === 'number' ? prev.value : 0) - val) / 3 };
                }
            }

            // Compute right handle position
            if (showRight) {
                if (!rightHandle || rightIsAuto) {
                    const computed = computeAutoHandles(prev, kf, next, rightType === 'auto' ? 'auto' : 'auto_clamped');
                    rightHandle = computed.right;
                } else if (rightType === 'vector' && next) {
                    rightHandle = { dt: (next.tick - kf.tick) / 3, dv: ((typeof next.value === 'number' ? next.value : 0) - val) / 3 };
                }
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
            liveTickRef.current = tick;
            setDragging({ baseTick: tick, startY: e.clientY, baseValue: value, frozenMinVal: minVal, frozenMaxVal: maxVal });
        },
        [minVal, maxVal, channel.elementId],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (dragging && svgRef.current) {
                const rect = svgRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const newTick = Math.max(0, snapTick(toTick(x, width), e.ctrlKey || e.metaKey));
                let newVal = yToValue(y, dragging.frozenMinVal, dragging.frozenMaxVal);
                if (propertyMin !== undefined) newVal = Math.max(newVal, propertyMin);
                if (propertyMax !== undefined) newVal = Math.min(newVal, propertyMax);
                const curTick = liveTickRef.current;
                if (newTick !== curTick) {
                    dispatchSceneCommand(
                        { type: 'moveKeyframe', channelId: channel.id, fromTick: curTick, toTick: newTick },
                        { source: 'curve-editor', mergeKey: `curve-drag-move:${channel.id}:${dragging.baseTick}`, transient: true },
                    );
                    liveTickRef.current = newTick;
                }
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: liveTickRef.current, patch: { value: newVal } },
                    { source: 'curve-editor', mergeKey: `curve-drag-val:${channel.id}:${dragging.baseTick}`, transient: true },
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
                let handleTick = toTick(mouseX, width);
                let handleVal = yToValue(mouseY, handleDrag.frozenMinVal, handleDrag.frozenMaxVal);
                let dt = handleTick - kf.tick;
                let dv = handleVal - kfVal;

                // Shift+drag: snap to horizontal or vertical relative to the keyframe
                if (e.shiftKey) {
                    const kfX = toX(kf.tick, width);
                    const kfY = valueToY(kfVal);
                    const startX = handleDrag.startMouseX - rect.left;
                    const startY = handleDrag.startMouseY - rect.top;
                    // Use the absolute pixel offset from the keyframe to pick the dominant axis
                    const pixelDx = Math.abs(mouseX - kfX);
                    const pixelDy = Math.abs(mouseY - kfY);
                    // Prefer the axis with the larger displacement; use start direction to break ties
                    const snapHorizontal = pixelDy === 0
                        ? Math.abs(startX - kfX) >= Math.abs(startY - kfY)
                        : pixelDx >= pixelDy;
                    if (snapHorizontal) {
                        dv = 0;
                    } else {
                        dt = 0;
                    }
                }

                const patch = buildHandlePatch(dt, dv, handleDrag.side, handleDrag.origType, handleDrag.frozenOppLength);
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: handleDrag.tick, patch: patch as any },
                    { source: 'curve-editor', mergeKey: `handle-drag:${channel.id}:${handleDrag.tick}:${handleDrag.side}`, transient: true },
                );
            }
        },
        [dragging, handleDrag, channel, height, toTick, toX, width, yToValue, valueToY, snapTick, propertyMin, propertyMax],
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (dragging) {
                try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                if (svgRef.current) {
                    const rect = svgRef.current.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const newTick = Math.max(0, snapTick(toTick(x, width), e.ctrlKey || e.metaKey));
                    let newVal = yToValue(y, dragging.frozenMinVal, dragging.frozenMaxVal);
                    if (propertyMin !== undefined) newVal = Math.max(newVal, propertyMin);
                    if (propertyMax !== undefined) newVal = Math.min(newVal, propertyMax);
                    const curTick = liveTickRef.current;
                    if (newTick !== curTick) {
                        dispatchSceneCommand(
                            { type: 'moveKeyframe', channelId: channel.id, fromTick: curTick, toTick: newTick },
                            { source: 'curve-editor', mergeKey: `curve-drag-move:${channel.id}:${dragging.baseTick}`, transient: false },
                        );
                        liveTickRef.current = newTick;
                    }
                    dispatchSceneCommand(
                        { type: 'updateKeyframe', channelId: channel.id, tick: liveTickRef.current, patch: { value: newVal } },
                        { source: 'curve-editor', mergeKey: `curve-drag-val:${channel.id}:${dragging.baseTick}`, transient: false },
                    );
                }
                setDragging(null);
                return;
            }
            if (handleDrag) {
                try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                if (svgRef.current) {
                    const rect = svgRef.current.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const kf = channel.keyframes.find((k) => Math.abs(k.tick - handleDrag.tick) < 0.5);
                    if (kf) {
                        const kfVal = typeof kf.value === 'number' ? kf.value : 0;
                        let dt = toTick(mouseX, width) - kf.tick;
                        let dv = yToValue(mouseY, handleDrag.frozenMinVal, handleDrag.frozenMaxVal) - kfVal;

                        if (e.shiftKey) {
                            const kfX = toX(kf.tick, width);
                            const kfY = valueToY(kfVal);
                            const pixelDx = Math.abs(mouseX - kfX);
                            const pixelDy = Math.abs(mouseY - kfY);
                            const startX = handleDrag.startMouseX - rect.left;
                            const startY = handleDrag.startMouseY - rect.top;
                            const snapHorizontal = pixelDy === 0
                                ? Math.abs(startX - kfX) >= Math.abs(startY - kfY)
                                : pixelDx >= pixelDy;
                            if (snapHorizontal) { dv = 0; } else { dt = 0; }
                        }

                        const patch = buildHandlePatch(dt, dv, handleDrag.side, handleDrag.origType, handleDrag.frozenOppLength);
                        dispatchSceneCommand(
                            { type: 'updateKeyframe', channelId: channel.id, tick: handleDrag.tick, patch: patch as any },
                            { source: 'curve-editor', mergeKey: `handle-drag:${channel.id}:${handleDrag.tick}:${handleDrag.side}`, transient: false },
                        );
                    }
                }
                setHandleDrag(null);
            }
        },
        [dragging, handleDrag, channel, height, toTick, toX, width, yToValue, valueToY, snapTick, propertyMin, propertyMax],
    );

    // --- Handle drag start ---
    const handleHandleDown = useCallback(
        (e: React.PointerEvent, tick: number, side: 'left' | 'right') => {
            if (e.button !== 0) return;
            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

            const kf = channel.keyframes.find((k) => Math.abs(k.tick - tick) < 0.5);
            const origType: HandleType = kf
                ? (side === 'left' ? (kf.leftHandleType ?? 'auto_clamped') : (kf.rightHandleType ?? 'auto_clamped'))
                : 'auto_clamped';

            // Freeze opposite handle length for aligned mode (stable across the full drag)
            let frozenOppLength = 0;
            if (origType === 'aligned' && kf) {
                const kfIdx = channel.keyframes.indexOf(kf);
                const prev = kfIdx > 0 ? channel.keyframes[kfIdx - 1] : null;
                const next = kfIdx < channel.keyframes.length - 1 ? channel.keyframes[kfIdx + 1] : null;
                const oppHandle = side === 'left' ? kf.rightHandle : kf.leftHandle;
                const oppType = side === 'left' ? (kf.rightHandleType ?? 'auto_clamped') : (kf.leftHandleType ?? 'auto_clamped');
                let oppDt: number, oppDv: number;
                if (oppHandle && !(oppType === 'auto' || oppType === 'auto_clamped')) {
                    oppDt = oppHandle.dt; oppDv = oppHandle.dv;
                } else {
                    const computed = computeAutoHandles(prev, kf, next, oppType === 'auto' ? 'auto' : 'auto_clamped');
                    const eff = side === 'left' ? computed.right : computed.left;
                    oppDt = eff.dt; oppDv = eff.dv;
                }
                frozenOppLength = Math.sqrt(oppDt * oppDt + oppDv * oppDv);
            }

            setHandleDrag({ tick, side, frozenMinVal: minVal, frozenMaxVal: maxVal, origType, frozenOppLength, startMouseX: e.clientX, startMouseY: e.clientY });
        },
        [minVal, maxVal, channel],
    );

    // --- Segment click → interpolation picker ---
    const handleSegmentClick = useCallback(
        (e: React.MouseEvent, tick: number) => {
            e.stopPropagation();
            const kfs = useSceneStore.getState().automation.channels[channel.id]?.keyframes ?? [];
            const idx = kfs.findIndex((kf) => Math.abs(kf.tick - tick) < 0.5);
            if (idx < 0 || idx >= kfs.length - 1) return;
            const leftTick = kfs[idx].tick;
            const rightTick = kfs[idx + 1].tick;
            if (e.shiftKey) {
                useSceneStore.setState((state) => {
                    const existing = state.interaction.automationSelectedKeyframes;
                    const hasLeft = existing.some((k) => k.channelId === channel.id && Math.abs(k.tick - leftTick) < 0.5);
                    const hasRight = existing.some((k) => k.channelId === channel.id && Math.abs(k.tick - rightTick) < 0.5);
                    const toAdd: Array<{ channelId: string; tick: number }> = [];
                    if (!hasLeft) toAdd.push({ channelId: channel.id, tick: leftTick });
                    if (!hasRight) toAdd.push({ channelId: channel.id, tick: rightTick });
                    return { interaction: { ...state.interaction, automationSelectedKeyframes: [...existing, ...toAdd] } };
                });
            } else {
                useSceneStore.setState((state) => ({
                    interaction: {
                        ...state.interaction,
                        automationSelectedKeyframes: [
                            { channelId: channel.id, tick: leftTick },
                            { channelId: channel.id, tick: rightTick },
                        ],
                    },
                }));
            }
        },
        [channel.id],
    );

    const handleInterpolationSelect = useCallback(
        (interpolation: SegmentInterpolation) => {
            if (!interpolationPicker) return;
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
            console.debug('[AutomationCurvePane] handleInterpolationSelect', {
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
                        { source: 'curve-editor' },
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
                    { source: 'curve-editor' },
                );
            }
            // Apply to selected segments in other channels
            if (isSelectedSeg) {
                const otherChannelIds = [...new Set(
                    allSelected.filter((k) => k.channelId !== channel.id).map((k) => k.channelId),
                )];
                for (const otherChannelId of otherChannelIds) {
                    const otherTickSet = new Set(
                        allSelected.filter((k) => k.channelId === otherChannelId).map((k) => k.tick),
                    );
                    const otherKfs = useSceneStore.getState().automation.channels[otherChannelId]?.keyframes ?? [];
                    for (let i = 0; i < otherKfs.length - 1; i++) {
                        if (otherTickSet.has(otherKfs[i].tick) && otherTickSet.has(otherKfs[i + 1].tick)) {
                            dispatchSceneCommand(
                                {
                                    type: 'updateKeyframe',
                                    channelId: otherChannelId,
                                    tick: otherKfs[i].tick,
                                    patch: { segmentInterpolation: interpolation },
                                },
                                { source: 'curve-editor' },
                            );
                        }
                    }
                }
            }
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
                        <text x={54} y={gl.y - 2} fill="rgba(255,255,255,0.25)" fontSize={9}>{gl.label}</text>
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
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                pickerRefs.setReference({ getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0) });
                                setInterpolationPicker({ tick: pt.tick });
                            }}
                            data-seg="1"
                        />
                    );
                })}

                {/* Bezier handle arms and circles */}
                {handleVisuals.map((hv) => {
                    const isHoverLeft = hoveredHandle?.tick === hv.tick && hoveredHandle?.side === 'left';
                    const isHoverRight = hoveredHandle?.tick === hv.tick && hoveredHandle?.side === 'right';
                    return (
                        <g key={`handle-${hv.tick}`}>
                            {hv.showLeft && (
                                <>
                                    <line
                                        x1={hv.kfX} y1={hv.kfY} x2={hv.leftX} y2={hv.leftY}
                                        stroke={isHoverLeft ? 'rgba(250,204,21,0.9)' : 'rgba(250,204,21,0.5)'} strokeWidth={1}
                                        pointerEvents="none"
                                    />
                                    <circle
                                        cx={hv.leftX} cy={hv.leftY} r={HANDLE_RADIUS}
                                        fill={isHoverLeft ? '#fde047' : (hv.leftIsAuto ? 'transparent' : '#facc15')}
                                        stroke={isHoverLeft ? '#fef08a' : '#facc15'} strokeWidth={isHoverLeft ? 2 : 1.5}
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
                                        stroke={isHoverRight ? 'rgba(250,204,21,0.9)' : 'rgba(250,204,21,0.5)'} strokeWidth={1}
                                        pointerEvents="none"
                                    />
                                    <circle
                                        cx={hv.rightX} cy={hv.rightY} r={HANDLE_RADIUS}
                                        fill={isHoverRight ? '#fde047' : (hv.rightIsAuto ? 'transparent' : '#facc15')}
                                        stroke={isHoverRight ? '#fef08a' : '#facc15'} strokeWidth={isHoverRight ? 2 : 1.5}
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
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            kfMenuRefs.setReference({ getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0) });
                            setKfHandleMenu({ tick: pt.tick });
                        }}
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
            {/* Handle type menu (right-click on keyframe) */}
            {kfHandleMenu && (() => {
                const kfIdx = channel.keyframes.findIndex((k) => Math.abs(k.tick - kfHandleMenu.tick) < 0.5);
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
                const setHandleType = (side: 'left' | 'right', type: HandleType) => {
                    const patch = side === 'left' ? { leftHandleType: type } : { rightHandleType: type };
                    const allSelected = useSceneStore.getState().interaction.automationSelectedKeyframes;
                    const isSelectedKf = allSelected.some(
                        (k) => k.channelId === channel.id && Math.abs(k.tick - kfHandleMenu.tick) < 0.5,
                    );
                    if (isSelectedKf && allSelected.length > 1) {
                        allSelected.forEach(({ channelId, tick }) => {
                            dispatchSceneCommand(
                                { type: 'updateKeyframe', channelId, tick, patch },
                                { source: 'curve-editor' },
                            );
                        });
                    } else {
                        dispatchSceneCommand(
                            { type: 'updateKeyframe', channelId: channel.id, tick: kfHandleMenu.tick, patch },
                            { source: 'curve-editor' },
                        );
                    }
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
                                            onClick={() => setHandleType('left', type)}
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
                                            onClick={() => setHandleType('right', type)}
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

export default AutomationCurvePane;
