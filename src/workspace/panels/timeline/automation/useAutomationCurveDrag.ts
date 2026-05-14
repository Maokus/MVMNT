/**
 * Drag state and pointer-event handlers for AutomationCurvePane.
 *
 * Covers two drag types:
 *  - Keyframe control-point drag (position + value)
 *  - Bezier handle drag (with optional axis-snap and aligned mirroring)
 */

import { useCallback, useRef, useState } from 'react';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useSelectionStore } from '@state/selectionStore';
import { buildHandlePatch, yCoordToValue } from './automationCurveUtils';
import type { AutomationChannel, HandleType } from '@automation/types';
import { computeAutoHandles } from '@automation/interpolation-defaults';

interface UseDragOptions {
    channel: AutomationChannel;
    width: number;
    minVal: number;
    maxVal: number;
    svgRef: React.RefObject<SVGSVGElement | null>;
    toX: (tick: number, width: number) => number;
    toTick: (x: number, width: number) => number;
    valueToY: (val: number) => number;
    snapTick: (tick: number, bypass: boolean) => number;
    height: number;
    propertyMin?: number;
    propertyMax?: number;
}

interface KeyframeDragState {
    baseTick: number;
    startY: number;
    baseValue: number;
    frozenMinVal: number;
    frozenMaxVal: number;
}

interface HandleDragState {
    tick: number;
    side: 'left' | 'right';
    frozenMinVal: number;
    frozenMaxVal: number;
    origType: HandleType;
    frozenOppLength: number;
    startMouseX: number;
    startMouseY: number;
}

export interface DragHandlers {
    dragging: KeyframeDragState | null;
    handleDrag: HandleDragState | null;
    hoveredHandle: { tick: number; side: 'left' | 'right' } | null;
    liveTickRef: React.MutableRefObject<number>;
    handlePointDown: (e: React.PointerEvent, tick: number, value: number) => void;
    handleHandleDown: (e: React.PointerEvent, tick: number, side: 'left' | 'right') => void;
    handlePointerMove: (e: React.PointerEvent) => void;
    handlePointerUp: (e: React.PointerEvent) => void;
    handlePointerCancel: () => void;
    setHoveredHandle: React.Dispatch<React.SetStateAction<{ tick: number; side: 'left' | 'right' } | null>>;
}

export function useAutomationCurveDrag({
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
}: UseDragOptions): DragHandlers {
    const [dragging, setDragging] = useState<KeyframeDragState | null>(null);
    const [handleDrag, setHandleDrag] = useState<HandleDragState | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<{ tick: number; side: 'left' | 'right' } | null>(null);

    // Tracks the live tick during a keyframe drag (updated on each moveKeyframe dispatch).
    const liveTickRef = useRef<number>(0);

    // ── Keyframe control-point drag ──────────────────────────────────────────

    const handlePointDown = useCallback(
        (e: React.PointerEvent, tick: number, value: number) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            useSelectionStore.getState().selectElements([channel.elementId]);

            const existing = useSelectionStore.getState().selectedKeyframes;
            const clickedIsSelected = existing.some(
                (k) => k.channelId === channel.id && Math.abs(k.tick - tick) < 0.5,
            );

            let newSelected: Array<{ channelId: string; tick: number }>;
            if (e.shiftKey) {
                const idx = existing.findIndex(
                    (k) => k.channelId === channel.id && Math.abs(k.tick - tick) < 0.5,
                );
                newSelected =
                    idx >= 0
                        ? existing.filter((_, i) => i !== idx)
                        : [...existing, { channelId: channel.id, tick }];
            } else if (clickedIsSelected) {
                newSelected = existing;
            } else {
                newSelected = [{ channelId: channel.id, tick }];
            }
            useSelectionStore.getState().selectKeyframes(newSelected);

            liveTickRef.current = tick;
            setDragging({
                baseTick: tick,
                startY: e.clientY,
                baseValue: value,
                frozenMinVal: minVal,
                frozenMaxVal: maxVal,
            });
        },
        [minVal, maxVal, channel.elementId, channel.id],
    );

    // ── Bezier handle drag ───────────────────────────────────────────────────

    const handleHandleDown = useCallback(
        (e: React.PointerEvent, tick: number, side: 'left' | 'right') => {
            if (e.button !== 0) return;
            e.stopPropagation();
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

            const kf = channel.keyframes.find((k) => Math.abs(k.tick - tick) < 0.5);
            const origType: HandleType = kf
                ? side === 'left'
                    ? (kf.leftHandleType ?? 'auto_clamped')
                    : (kf.rightHandleType ?? 'auto_clamped')
                : 'auto_clamped';

            // Freeze opposite handle length now so aligned mirroring stays stable
            let frozenOppLength = 0;
            if (origType === 'aligned' && kf) {
                const kfIdx = channel.keyframes.indexOf(kf);
                const prev = kfIdx > 0 ? channel.keyframes[kfIdx - 1] : null;
                const next = kfIdx < channel.keyframes.length - 1 ? channel.keyframes[kfIdx + 1] : null;
                const oppHandle = side === 'left' ? kf.rightHandle : kf.leftHandle;
                const oppType =
                    side === 'left'
                        ? (kf.rightHandleType ?? 'auto_clamped')
                        : (kf.leftHandleType ?? 'auto_clamped');
                let oppDt: number, oppDv: number;
                if (oppHandle && !(oppType === 'auto' || oppType === 'auto_clamped')) {
                    oppDt = oppHandle.dt;
                    oppDv = oppHandle.dv;
                } else {
                    const computed = computeAutoHandles(
                        prev, kf, next, oppType === 'auto' ? 'auto' : 'auto_clamped',
                    );
                    const eff = side === 'left' ? computed.right : computed.left;
                    oppDt = eff.dt;
                    oppDv = eff.dv;
                }
                frozenOppLength = Math.sqrt(oppDt * oppDt + oppDv * oppDv);
            }

            setHandleDrag({
                tick,
                side,
                frozenMinVal: minVal,
                frozenMaxVal: maxVal,
                origType,
                frozenOppLength,
                startMouseX: e.clientX,
                startMouseY: e.clientY,
            });
        },
        [minVal, maxVal, channel],
    );

    // ── Shared pointer move ──────────────────────────────────────────────────

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            // Guard: if no button is held, the drag state is stale (e.g. pointerup was
            // missed before React re-rendered). Clear it and bail out.
            if (e.buttons === 0) {
                setDragging(null);
                setHandleDrag(null);
                return;
            }
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();

            if (dragging) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const newTick = Math.max(0, snapTick(toTick(x, width), e.ctrlKey || e.metaKey));
                let newVal = yCoordToValue(y, dragging.frozenMinVal, dragging.frozenMaxVal, height);
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

            if (handleDrag) {
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const kf = channel.keyframes.find((k) => Math.abs(k.tick - handleDrag.tick) < 0.5);
                if (!kf) return;

                const kfVal = typeof kf.value === 'number' ? kf.value : 0;
                let dt = toTick(mouseX, width) - kf.tick;
                let dv = yCoordToValue(mouseY, handleDrag.frozenMinVal, handleDrag.frozenMaxVal, height) - kfVal;

                if (e.shiftKey) {
                    const kfX = toX(kf.tick, width);
                    const kfY = valueToY(kfVal);
                    const startX = handleDrag.startMouseX - rect.left;
                    const startY = handleDrag.startMouseY - rect.top;
                    const pixelDx = Math.abs(mouseX - kfX);
                    const pixelDy = Math.abs(mouseY - kfY);
                    const snapHorizontal =
                        pixelDy === 0
                            ? Math.abs(startX - kfX) >= Math.abs(startY - kfY)
                            : pixelDx >= pixelDy;
                    if (snapHorizontal) dv = 0;
                    else dt = 0;
                }

                const patch = buildHandlePatch(dt, dv, handleDrag.side, handleDrag.origType, handleDrag.frozenOppLength);
                dispatchSceneCommand(
                    { type: 'updateKeyframe', channelId: channel.id, tick: handleDrag.tick, patch: patch as any },
                    { source: 'curve-editor', mergeKey: `handle-drag:${channel.id}:${handleDrag.tick}:${handleDrag.side}`, transient: true },
                );
            }
        },
        [dragging, handleDrag, channel, width, height, toTick, toX, valueToY, snapTick, propertyMin, propertyMax, svgRef],
    );

    // ── Shared pointer up ────────────────────────────────────────────────────

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();

            if (dragging) {
                try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const newTick = Math.max(0, snapTick(toTick(x, width), e.ctrlKey || e.metaKey));
                let newVal = yCoordToValue(y, dragging.frozenMinVal, dragging.frozenMaxVal, height);
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
                setDragging(null);
                return;
            }

            if (handleDrag) {
                try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const kf = channel.keyframes.find((k) => Math.abs(k.tick - handleDrag.tick) < 0.5);
                if (kf) {
                    const kfVal = typeof kf.value === 'number' ? kf.value : 0;
                    let dt = toTick(mouseX, width) - kf.tick;
                    let dv = yCoordToValue(mouseY, handleDrag.frozenMinVal, handleDrag.frozenMaxVal, height) - kfVal;

                    if (e.shiftKey) {
                        const kfX = toX(kf.tick, width);
                        const kfY = valueToY(kfVal);
                        const startX = handleDrag.startMouseX - rect.left;
                        const startY = handleDrag.startMouseY - rect.top;
                        const pixelDx = Math.abs(mouseX - kfX);
                        const pixelDy = Math.abs(mouseY - kfY);
                        const snapHorizontal =
                            pixelDy === 0
                                ? Math.abs(startX - kfX) >= Math.abs(startY - kfY)
                                : pixelDx >= pixelDy;
                        if (snapHorizontal) dv = 0;
                        else dt = 0;
                    }

                    const patch = buildHandlePatch(dt, dv, handleDrag.side, handleDrag.origType, handleDrag.frozenOppLength);
                    dispatchSceneCommand(
                        { type: 'updateKeyframe', channelId: channel.id, tick: handleDrag.tick, patch: patch as any },
                        { source: 'curve-editor', mergeKey: `handle-drag:${channel.id}:${handleDrag.tick}:${handleDrag.side}`, transient: false },
                    );
                }
                setHandleDrag(null);
            }
        },
        [dragging, handleDrag, channel, width, height, toTick, toX, valueToY, snapTick, propertyMin, propertyMax, svgRef],
    );

    // ── Pointer cancel (browser gesture interrupt, e.g. scroll on touch) ───────

    const handlePointerCancel = useCallback(() => {
        setDragging(null);
        setHandleDrag(null);
    }, []);

    return {
        dragging,
        handleDrag,
        hoveredHandle,
        liveTickRef,
        handlePointDown,
        handleHandleDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerCancel,
        setHoveredHandle,
    };
}
