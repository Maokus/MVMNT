// Canvas interaction utilities extracted from PreviewPanel.tsx
// These functions are intentionally pure/decoupled from React component internals;
// all required dependencies are passed in explicitly.

import {
    computeConstrainedMoveDelta,
    computeScaleHandleReferencePoints,
    elementHitTest,
    elementHoverId,
    findHandleUnderPoint,
    getCanvasWorldPoint,
} from '@math/interaction';
import { computeAnchorAdjustment, computeRotation, computeScaledTransform } from '@core/interaction/mouse-transforms';
import { beginHistoryGroup, endHistoryGroup, updateSceneElement } from '@state/document/actions';
import { createThrottledAction } from '@utils/throttle';

// Types kept broad (any) to avoid tight coupling with visualizer internal shapes.
export interface InteractionDeps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any; // runtime visualizer instance
    sceneBuilder?: any;
    selectElement: (id: string | null) => void;
    updateElementConfig?: (id: string, cfg: any) => void;
    incrementPropertyPanelRefresh: () => void;
}

// ----- Helper functions -----

function getWorldPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    return getCanvasWorldPoint(canvas, clientX, clientY);
}

function startHandleDrag(vis: any, handleHit: any, x: number, y: number) {
    const selectedId = vis._interactionState?.selectedElementId;
    if (!selectedId) return;
    vis.setInteractionState({ activeHandle: handleHit.id, draggingElementId: selectedId });
    const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
    const rec = boundsList.find((b: any) => b.id === selectedId);
    const { geom, fixedWorldPoint, fixedLocalPoint, dragLocalPoint } = computeScaleHandleReferencePoints(
        handleHit.type,
        rec
    );
    const el = rec?.element;
    vis._dragMeta = {
        mode: handleHit.type,
        startX: x,
        startY: y,
        origOffsetX: el?.getProperty('offsetX') ?? 0,
        origOffsetY: el?.getProperty('offsetY') ?? 0,
        origWidth: rec?.bounds?.width ?? 0,
        origHeight: rec?.bounds?.height ?? 0,
        origScaleX: el?.getProperty('elementScaleX') ?? el?.getProperty('globalScaleX') ?? 1,
        origScaleY: el?.getProperty('elementScaleY') ?? el?.getProperty('globalScaleY') ?? 1,
        origRotation: el?.getProperty('elementRotation') ?? 0,
        origSkewX: el?.getProperty('elementSkewX') ?? 0,
        origSkewY: el?.getProperty('elementSkewY') ?? 0,
        origAnchorX: el?.getProperty('anchorX') ?? 0.5,
        origAnchorY: el?.getProperty('anchorY') ?? 0.5,
        bounds: rec?.bounds,
        corners: rec?.corners || null,
        baseBounds: rec?.baseBounds || null,
        geom,
        fixedWorldPoint,
        fixedLocalPoint,
        dragLocalPoint,
    };
}

function attemptHandleHit(vis: any, x: number, y: number): boolean {
    const selectedId = vis._interactionState?.selectedElementId || null;
    if (!selectedId) return false;
    const handles = vis.getSelectionHandlesAtTime?.(selectedId, vis.getCurrentTime?.() ?? 0) || [];
    const handleHit = findHandleUnderPoint(handles, x, y) as any;
    if (handleHit) {
        startHandleDrag(vis, handleHit, x, y);
        return true;
    }
    return false;
}

function performElementHitTest(vis: any, x: number, y: number, deps: InteractionDeps) {
    const { selectElement } = deps;
    const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
    const hit = elementHitTest(boundsList, x, y);
    if (hit) {
        selectElement(hit.id);
        vis.setInteractionState({ draggingElementId: hit.id, activeHandle: 'move' });
        vis._dragMeta = {
            mode: 'move',
            startX: x,
            startY: y,
            origOffsetX: hit.element?.offsetX || 0,
            origOffsetY: hit.element?.offsetY || 0,
            origRotation: hit.element?.elementRotation || 0,
            origSkewX: hit.element?.elementSkewX || 0,
            origSkewY: hit.element?.elementSkewY || 0,
        };
        // Phase 2: start a history group for the drag gesture and build a throttled doc updater
        if (!vis._dragHistoryGroup) {
            vis._dragHistoryGroup = true;
            beginHistoryGroup('dragElement');
        }
        const elId = hit.id;
        vis._docMoveThrottled = createThrottledAction((nx: number, ny: number) => {
            updateSceneElement(
                elId,
                (el: any) => {
                    el.offsetX = nx;
                    el.offsetY = ny;
                },
                { label: 'dragElement', id: elId }
            );
        });
    } else {
        selectElement(null);
        vis.setInteractionState({ hoverElementId: null, draggingElementId: null, activeHandle: null });
    }
}

function updateMoveDrag(
    meta: any,
    vis: any,
    elId: string,
    dx: number,
    dy: number,
    shiftKey: boolean,
    deps: InteractionDeps
) {
    const { sceneBuilder, updateElementConfig } = deps;
    const constrained = computeConstrainedMoveDelta(dx, dy, meta.origRotation || 0, shiftKey);
    const newX = meta.origOffsetX + constrained.dx;
    const newY = meta.origOffsetY + constrained.dy;
    sceneBuilder?.updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
    updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
    // Record last move and mirror updates into the document store at ~60fps
    vis._lastMoveX = newX;
    vis._lastMoveY = newY;
    vis._docMoveThrottled?.trigger(newX, newY);
}

function updateScaleDrag(
    meta: any,
    vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    deps: InteractionDeps
) {
    const { sceneBuilder } = deps;
    if (!meta.bounds) return;
    const r = computeScaledTransform(
        x,
        y,
        {
            mode: meta.mode,
            origScaleX: meta.origScaleX,
            origScaleY: meta.origScaleY,
            baseBounds: meta.baseBounds,
            fixedWorldPoint: meta.fixedWorldPoint,
            fixedLocalPoint: meta.fixedLocalPoint,
            dragLocalPoint: meta.dragLocalPoint,
            geom: meta.geom,
            origRotation: meta.origRotation,
            origSkewX: meta.origSkewX,
            origSkewY: meta.origSkewY,
            origAnchorX: meta.origAnchorX,
            origAnchorY: meta.origAnchorY,
        },
        shiftKey
    );
    if (r) {
        const cfg = {
            elementScaleX: r.newScaleX,
            elementScaleY: r.newScaleY,
            offsetX: r.newOffsetX,
            offsetY: r.newOffsetY,
        };
        sceneBuilder?.updateElementConfig?.(elId, cfg);
        deps.updateElementConfig?.(elId, cfg);
    }
}

function updateAnchorDrag(
    meta: any,
    vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    deps: InteractionDeps
) {
    const { sceneBuilder, updateElementConfig } = deps;
    if (!meta.bounds || !meta.baseBounds) return;
    const { newAnchorX, newAnchorY, newOffsetX, newOffsetY } = computeAnchorAdjustment(
        x,
        y,
        {
            baseBounds: meta.baseBounds,
            origAnchorX: meta.origAnchorX,
            origAnchorY: meta.origAnchorY,
            origOffsetX: meta.origOffsetX,
            origOffsetY: meta.origOffsetY,
            origRotation: meta.origRotation,
            origSkewX: meta.origSkewX,
            origSkewY: meta.origSkewY,
            origScaleX: meta.origScaleX,
            origScaleY: meta.origScaleY,
        },
        shiftKey
    );
    const cfg = { anchorX: newAnchorX, anchorY: newAnchorY, offsetX: newOffsetX, offsetY: newOffsetY };
    sceneBuilder?.updateElementConfig?.(elId, cfg);
    updateElementConfig?.(elId, cfg);
}

function updateRotateDrag(
    meta: any,
    vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    deps: InteractionDeps
) {
    const { sceneBuilder, updateElementConfig } = deps;
    if (!meta.bounds) return;
    const newRotationDeg = computeRotation(x, y, meta, shiftKey);
    sceneBuilder?.updateElementConfig?.(elId, { elementRotation: newRotationDeg });
    updateElementConfig?.(elId, { elementRotation: newRotationDeg });
}

function processDrag(vis: any, x: number, y: number, shiftKey: boolean, deps: InteractionDeps) {
    if (!(vis._interactionState?.draggingElementId && vis._dragMeta)) return false;
    const meta = vis._dragMeta;
    const elId = vis._interactionState.draggingElementId;
    const dx = x - meta.startX;
    const dy = y - meta.startY;
    switch (true) {
        case meta.mode === 'move':
            updateMoveDrag(meta, vis, elId, dx, dy, shiftKey, deps);
            break;
        case meta.mode?.startsWith('scale') && !!meta.bounds:
            updateScaleDrag(meta, vis, elId, x, y, shiftKey, deps);
            break;
        case meta.mode === 'anchor' && !!meta.bounds:
            updateAnchorDrag(meta, vis, elId, x, y, shiftKey, deps);
            break;
        case meta.mode === 'rotate' && !!meta.bounds:
            updateRotateDrag(meta, vis, elId, x, y, shiftKey, deps);
            break;
        default:
            break;
    }
    vis.setInteractionState({}); // trigger update
    return true;
}

function updateHover(vis: any, x: number, y: number) {
    const selectedId = vis._interactionState?.selectedElementId || null;
    if (selectedId) {
        const handles = vis.getSelectionHandlesAtTime?.(selectedId, vis.getCurrentTime?.() ?? 0) || [];
        const handleHover = findHandleUnderPoint(handles, x, y) as any;
        if (handleHover) {
            if (vis._interactionState.activeHandle !== handleHover.id)
                vis.setInteractionState({ activeHandle: handleHover.id });
            return; // don't update element hover while over handle
        } else if (vis._interactionState.activeHandle) {
            vis.setInteractionState({ activeHandle: null });
        }
    }
    const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
    const hoverId = elementHoverId(boundsList, x, y);
    if (hoverId !== vis._interactionState?.hoverElementId) vis.setInteractionState({ hoverElementId: hoverId });
}

function finalizeDrag(vis: any, deps: InteractionDeps) {
    const activeId = vis._interactionState?.draggingElementId || null;
    const activeMode = vis._dragMeta?.mode || null;
    if (activeId) {
        // Ensure final state is committed to the document before closing the group
        if (activeMode === 'move' && typeof vis._lastMoveX === 'number' && typeof vis._lastMoveY === 'number') {
            updateSceneElement(
                activeId,
                (el: any) => {
                    el.offsetX = vis._lastMoveX;
                    el.offsetY = vis._lastMoveY;
                },
                { label: 'dragElement-final', id: activeId }
            );
        }
        vis._docMoveThrottled?.cancel?.();
        vis._docMoveThrottled = null;
        if (vis._dragHistoryGroup) {
            endHistoryGroup();
            vis._dragHistoryGroup = false;
        }
        vis.setInteractionState({ draggingElementId: null, activeHandle: null });
        vis._dragMeta = null;
        vis._lastMoveX = undefined;
        vis._lastMoveY = undefined;
        deps.incrementPropertyPanelRefresh();
    }
}

// ----- Exported top-level handlers -----

export function onCanvasMouseDown(e: React.MouseEvent, deps: InteractionDeps) {
    const { canvasRef, visualizer: vis } = deps;
    const canvas = canvasRef.current;
    if (!canvas || !vis) return;
    const { x, y } = getWorldPoint(canvas, e.clientX, e.clientY);
    // 1) If an element selected, attempt handle drag
    if (attemptHandleHit(vis, x, y)) return;
    // 2) Otherwise element hit test
    performElementHitTest(vis, x, y, deps);
}

export function onCanvasMouseMove(e: React.MouseEvent, deps: InteractionDeps) {
    const { canvasRef, visualizer: vis } = deps;
    const canvas = canvasRef.current;
    if (!canvas || !vis) return;
    const { x, y } = getWorldPoint(canvas, e.clientX, e.clientY);
    if (processDrag(vis, x, y, e.shiftKey, deps)) return;
    updateHover(vis, x, y);
}

export function onCanvasMouseUp(_e: React.MouseEvent, deps: InteractionDeps) {
    const { visualizer: vis } = deps;
    if (!vis) return;
    finalizeDrag(vis, deps);
}

export function onCanvasMouseLeave(_e: React.MouseEvent, deps: InteractionDeps) {
    const { visualizer: vis } = deps;
    if (!vis) return;
    finalizeDrag(vis, deps);
    vis.setInteractionState({ hoverElementId: null, activeHandle: null });
}
