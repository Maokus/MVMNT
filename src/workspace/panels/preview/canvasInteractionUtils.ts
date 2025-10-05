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
import type { GeometryInfo } from '@math/transforms/types';
import { useSceneStore } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { MouseEvent as ReactMouseEvent } from 'react';

// Types kept broad (any) to avoid tight coupling with visualizer internal shapes.
export interface InteractionDeps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any; // runtime visualizer instance
    selectElement: (id: string | null) => void;
    updateElementConfig?: (
        id: string,
        cfg: any,
        options?: Omit<SceneCommandOptions, 'source'>,
    ) => void;
    incrementPropertyPanelRefresh: () => void;
}

type DragCommandOptionsBase = Omit<SceneCommandOptions, 'source' | 'transient'>;

let dragSessionCounter = 0;

function ensureDragCommandOptions(meta: any, elementId: string): DragCommandOptionsBase {
    if (meta.dragCommandOptionsBase) {
        return meta.dragCommandOptionsBase as DragCommandOptionsBase;
    }
    const sessionId = meta.dragSessionId ?? `drag-${++dragSessionCounter}`;
    meta.dragSessionId = sessionId;
    const mode = typeof meta.mode === 'string' && meta.mode.length > 0 ? meta.mode : 'drag';
    const base: DragCommandOptionsBase = {
        mergeKey: `${mode}:${sessionId}`,
        canMergeWith: (other) =>
            other.command.type === 'updateElementConfig' && other.command.elementId === elementId,
    };
    meta.dragCommandOptionsBase = base;
    return base;
}

function applyDragUpdate(
    meta: any,
    elementId: string,
    cfg: Record<string, unknown>,
    deps: InteractionDeps,
) {
    const { updateElementConfig } = deps;
    if (!updateElementConfig) return;
    meta.dragElementId = elementId;
    const baseOptions = ensureDragCommandOptions(meta, elementId);
    updateElementConfig(elementId, cfg, { ...baseOptions, transient: true });
    meta.lastConfig = { ...cfg };
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
    const baseBounds = rec?.baseBounds || null;
    const geometry: GeometryInfo | null =
        geom && typeof geom === 'object' && (geom as any).widthVec ? (geom as GeometryInfo) : null; // eslint-disable-line @typescript-eslint/no-explicit-any
    const corners = geometry?.corners ?? null;
    const centerWorld = corners
        ? {
              x: (corners.TL.x + corners.TR.x + corners.BR.x + corners.BL.x) / 4,
              y: (corners.TL.y + corners.TR.y + corners.BR.y + corners.BL.y) / 4,
          }
        : rec?.bounds
        ? {
              x: (rec.bounds.x || 0) + (rec.bounds.width || 0) / 2,
              y: (rec.bounds.y || 0) + (rec.bounds.height || 0) / 2,
          }
        : null;
    const centerLocal = baseBounds
        ? { x: baseBounds.x + baseBounds.width / 2, y: baseBounds.y + baseBounds.height / 2 }
        : null;
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
        baseBounds,
        geom: geometry,
        fixedWorldPoint,
        fixedLocalPoint,
        dragLocalPoint,
        centerWorld,
        centerLocal,
        dragElementId: selectedId,
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
            dragElementId: hit.id,
        };
    } else {
        selectElement(null);
        vis.setInteractionState({ hoverElementId: null, draggingElementId: null, activeHandle: null });
    }
}

function updateMoveDrag(
    meta: any,
    _vis: any,
    elId: string,
    dx: number,
    dy: number,
    shiftKey: boolean,
    deps: InteractionDeps
) {
    const constrained = computeConstrainedMoveDelta(dx, dy, meta.origRotation || 0, shiftKey);
    const newX = meta.origOffsetX + constrained.dx;
    const newY = meta.origOffsetY + constrained.dy;
    applyDragUpdate(meta, elId, { offsetX: newX, offsetY: newY }, deps);
}

function updateScaleDrag(
    meta: any,
    _vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    altKey: boolean,
    deps: InteractionDeps
) {
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
            centerWorldPoint: meta.centerWorld,
            centerLocalPoint: meta.centerLocal,
            geom: meta.geom,
            origRotation: meta.origRotation,
            origSkewX: meta.origSkewX,
            origSkewY: meta.origSkewY,
            origAnchorX: meta.origAnchorX,
            origAnchorY: meta.origAnchorY,
        },
        shiftKey,
        altKey &&
            (meta.mode === 'scale-ne' ||
                meta.mode === 'scale-nw' ||
                meta.mode === 'scale-se' ||
                meta.mode === 'scale-sw')
    );
    if (r) {
        const cfg = {
            elementScaleX: r.newScaleX,
            elementScaleY: r.newScaleY,
            offsetX: r.newOffsetX,
            offsetY: r.newOffsetY,
        };
        applyDragUpdate(meta, elId, cfg, deps);
    }
}

function updateAnchorDrag(
    meta: any,
    _vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    deps: InteractionDeps
) {
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
    applyDragUpdate(meta, elId, cfg, deps);
}

function updateRotateDrag(
    meta: any,
    _vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    deps: InteractionDeps
) {
    if (!meta.bounds) return;
    const newRotationDeg = computeRotation(x, y, meta, shiftKey);
    applyDragUpdate(meta, elId, { elementRotation: newRotationDeg }, deps);
}

function processDrag(vis: any, x: number, y: number, shiftKey: boolean, altKey: boolean, deps: InteractionDeps) {
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
            updateScaleDrag(meta, vis, elId, x, y, shiftKey, altKey, deps);
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
    const draggingId = vis._interactionState?.draggingElementId;
    const meta = vis._dragMeta;
    if (
        draggingId &&
        meta &&
        meta.lastConfig &&
        meta.dragCommandOptionsBase &&
        typeof deps.updateElementConfig === 'function'
    ) {
        const finalPatch = { ...meta.lastConfig };
        deps.updateElementConfig(draggingId, finalPatch, {
            ...meta.dragCommandOptionsBase,
            transient: false,
        });
    }
    if (draggingId) {
        vis.setInteractionState({ draggingElementId: null, activeHandle: null });
        vis._dragMeta = null;
        deps.incrementPropertyPanelRefresh();
        // Trigger undo snapshot capture after completing a drag interaction (move/scale/rotate/anchor)
        try {
            const undo: any = (window as any).__mvmntUndo;
            if (undo && typeof undo.markDirty === 'function') {
                undo.markDirty();
            }
        } catch {
            /* noop */
        }
    }
}

// ----- Exported top-level handlers -----

type CanvasMouseEvent = MouseEvent | ReactMouseEvent;

export function onCanvasMouseDown(e: CanvasMouseEvent, deps: InteractionDeps) {
    const { canvasRef, visualizer: vis } = deps;
    const canvas = canvasRef.current;
    if (!canvas || !vis) return;
    const { x, y } = getWorldPoint(canvas, e.clientX, e.clientY);
    // 1) If an element selected, attempt handle drag
    if (attemptHandleHit(vis, x, y)) return;
    // 2) Otherwise element hit test
    const beforeSelected = vis._interactionState?.selectedElementId || null;
    performElementHitTest(vis, x, y, deps);

    const afterSelected = vis._interactionState?.selectedElementId || null;

    // --- Double click detection for in-canvas text editing ---
    // We store last click timestamp + element id on the visualizer instance to avoid module globals.
    const now = performance.now();
    const DOUBLE_CLICK_MS = 400; // threshold window
    const lastClickTime: number | undefined = vis.__lastCanvasClickTime;
    const lastClickElement: string | null | undefined = vis.__lastCanvasClickElementId;
    const isDouble =
        afterSelected &&
        lastClickElement === afterSelected &&
        typeof lastClickTime === 'number' &&
        now - lastClickTime < DOUBLE_CLICK_MS;

    // Update stored click info early (will be used next time unless we early-return)
    vis.__lastCanvasClickTime = now;
    vis.__lastCanvasClickElementId = afterSelected;

    if (isDouble && afterSelected) {
        try {
            const bindings = useSceneStore.getState().bindings.byElement[afterSelected] ?? {};
            const hasTextProperty = Object.prototype.hasOwnProperty.call(bindings, 'text');
            if (hasTextProperty) {
                // Prevent initiating a drag after double-click
                vis.setInteractionState({ draggingElementId: null, activeHandle: null });

                // Clear the text property so user typing replaces it immediately
                deps.updateElementConfig?.(afterSelected, { text: '' });

                // Force property panel refresh (in case value cached)
                deps.incrementPropertyPanelRefresh();

                // Focus the corresponding property input after DOM updates
                setTimeout(() => {
                    // Expand the 'Content' group if it is collapsed so the input is visible
                    try {
                        const groupHeaders = document.querySelectorAll('.ae-property-group .ae-group-header');
                        groupHeaders.forEach((h) => {
                            const labelEl = h.querySelector('.ae-group-label');
                            if (labelEl && labelEl.textContent?.trim() === 'Content') {
                                const wrapper = h.parentElement;
                                if (
                                    wrapper &&
                                    wrapper.querySelector('.ae-property-list')?.classList.contains('hidden')
                                ) {
                                    // If implementation uses a hidden class we could toggle. Currently collapse toggling is via state; we can't easily change it here.
                                    // (Left intentionally minimal; future improvement: expose an imperative expansion API.)
                                }
                            }
                        });
                    } catch {
                        /* noop */
                    }
                    const input = document.getElementById('config-text') as HTMLInputElement | null;
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }, 0);
                return; // swallow event for double-click editing path
            }
        } catch (err) {
            // Non-fatal; fall back to normal behavior
            // eslint-disable-next-line no-console
            console.warn('[canvasInteraction] double-click text edit failed', err);
        }
    }
}

export function onCanvasMouseMove(e: CanvasMouseEvent, deps: InteractionDeps) {
    const { canvasRef, visualizer: vis } = deps;
    const canvas = canvasRef.current;
    if (!canvas || !vis) return;
    const { x, y } = getWorldPoint(canvas, e.clientX, e.clientY);
    if (processDrag(vis, x, y, e.shiftKey, e.altKey ?? false, deps)) return;
    updateHover(vis, x, y);
}

export function onCanvasMouseUp(_e: CanvasMouseEvent, deps: InteractionDeps) {
    const { visualizer: vis } = deps;
    if (!vis) return;
    finalizeDrag(vis, deps);
}

export function onCanvasMouseLeave(_e: CanvasMouseEvent, deps: InteractionDeps) {
    const { visualizer: vis } = deps;
    if (!vis) return;
    if (vis._interactionState?.draggingElementId) {
        vis.setInteractionState({ hoverElementId: null, activeHandle: null });
        return;
    }
    finalizeDrag(vis, deps);
    vis.setInteractionState({ hoverElementId: null, activeHandle: null });
}
