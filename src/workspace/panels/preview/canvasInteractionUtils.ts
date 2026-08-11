// Canvas interaction utilities extracted from PreviewPanel.tsx
// These functions are intentionally pure/decoupled from React component internals;
// all required dependencies are passed in explicitly.

import {
    elementHitTest,
    elementHoverId,
    findHandleUnderPoint,
    getCanvasWorldPoint,
} from '@math/transforms/interaction';
import {
    DEFAULT_SNAP_TOLERANCE,
    buildSnapTargets,
    snapPoint,
    snapTranslation,
    type SnapGuide,
} from '@core/interaction/snapping';
import { useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import type { SceneCommandOptions } from '@state/scene';
import type { SceneCommand } from '@state/scene';
import { dispatchSceneCommand } from '@state/scene';
import { useSelectionStore } from '@state/selectionStore';
import { marqueeNodeIds } from '@state/scene';
import { createKeyframe, findKeyframeAtTick, nodePropertyTarget } from '@automation/types';
import { useTimelineStore } from '@state/timelineStore';
import {
    cloneSceneGraph,
    applyMatrixToPoint,
    invertMatrix,
    matrixToNodeTransform,
    matrixAroundPoint,
    multiplyMatrices,
    nodeTransformToMatrix,
    rotationMatrix,
    scaleMatrix,
    subtreeNodeIds,
    transformSceneNodes,
    translationMatrix,
} from '@state/scene-graph';
import type { MouseEvent as ReactMouseEvent } from 'react';

// Types kept broad (any) to avoid tight coupling with visualizer internal shapes.
export interface InteractionDeps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any; // runtime visualizer instance
    selectElement: (id: string | null) => void;
    selectNode?: (id: string, options?: { toggle?: boolean }) => void;
    incrementPropertyPanelRefresh: () => void;
}

type DragCommandOptionsBase = Omit<SceneCommandOptions, 'source' | 'transient'>;

let dragSessionCounter = 0;

/**
 * Adds the pointer's shortest angular movement to an ongoing rotation drag.
 * Storing the accumulated angle avoids the atan2 -π/π seam resetting a group
 * transform after the pointer passes the opposite side of its pivot.
 */
export function accumulateRotationDrag(
    previousPointerAngle: number,
    pointerAngle: number,
    accumulatedAngle = 0
): number {
    const change = Math.atan2(
        Math.sin(pointerAngle - previousPointerAngle),
        Math.cos(pointerAngle - previousPointerAngle)
    );
    return accumulatedAngle + change;
}

type Point = { x: number; y: number };

const OPPOSITE_SCALE_HANDLE: Record<string, string> = {
    'scale-nw': 'scale-se',
    'scale-ne': 'scale-sw',
    'scale-se': 'scale-nw',
    'scale-sw': 'scale-ne',
    'scale-n': 'scale-s',
    'scale-e': 'scale-w',
    'scale-s': 'scale-n',
    'scale-w': 'scale-e',
};

function unitVector(from: Point, to: Point): Point {
    const x = to.x - from.x;
    const y = to.y - from.y;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
}

/** Selects the closest CSS resize cursor to the handle's actual screen-space axis. */
export function resizeCursorForHandle(handleType: string, handles: readonly any[]): string | null {
    if (!handleType.startsWith('scale-')) return null;
    const handle = handles.find((candidate) => candidate.type === handleType);
    if (!handle) return null;
    const northWest = handles.find((candidate) => candidate.type === 'scale-nw');
    const northEast = handles.find((candidate) => candidate.type === 'scale-ne');
    const rotation =
        northWest && northEast ? Math.atan2(northEast.cy - northWest.cy, northEast.cx - northWest.cx) : null;
    const offsetByHandle: Record<string, number> = {
        'scale-e': 0,
        'scale-w': 0,
        'scale-n': Math.PI / 2,
        'scale-s': Math.PI / 2,
        'scale-nw': Math.PI / 4,
        'scale-se': Math.PI / 4,
        'scale-ne': -Math.PI / 4,
        'scale-sw': -Math.PI / 4,
    };
    const opposite = handles.find((candidate) => candidate.type === OPPOSITE_SCALE_HANDLE[handleType]);
    const angle =
        rotation === null
            ? opposite
                ? Math.atan2(handle.cy - opposite.cy, handle.cx - opposite.cx)
                : null
            : rotation + offsetByHandle[handleType];
    if (angle === null) return null;
    const direction = ((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4;
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][direction];
}

/** Computes a one-axis resize factor from pointer movement along the object's local axes. */
export function sideHandleScaleFactors(
    handleType: string,
    origin: Point,
    start: Point,
    current: Point,
    axisX: Point,
    axisY: Point
): { scaleX: number; scaleY: number } {
    const axis = handleType === 'scale-e' || handleType === 'scale-w' ? axisX : axisY;
    const startProjection = (start.x - origin.x) * axis.x + (start.y - origin.y) * axis.y;
    const currentProjection = (current.x - origin.x) * axis.x + (current.y - origin.y) * axis.y;
    const factor = Math.max(0.001, currentProjection / (Math.abs(startProjection) > 1e-8 ? startProjection : 1));
    return handleType === 'scale-e' || handleType === 'scale-w'
        ? { scaleX: factor, scaleY: 1 }
        : { scaleX: 1, scaleY: factor };
}

/** Builds a world-space scale aligned to an object's local x/y axes. */
export function orientedScaleMatrix(scaleX: number, scaleY: number, axisX: Point) {
    const angle = Math.atan2(axisX.y, axisX.x);
    return multiplyMatrices(
        rotationMatrix(angle),
        multiplyMatrices(scaleMatrix(scaleX, scaleY), rotationMatrix(-angle))
    );
}

function selectedSubtreeElementIds(): string[] {
    const scene = useSceneStore.getState();
    return subtreeNodeIds(scene.graph, useSelectionStore.getState().selectedNodeIds)
        .map((nodeId) => scene.elementIdByNodeId[nodeId])
        .filter(Boolean);
}

function ensureDragCommandOptions(meta: any, elementId: string): DragCommandOptionsBase {
    if (meta.dragCommandOptionsBase) {
        return meta.dragCommandOptionsBase as DragCommandOptionsBase;
    }
    const sessionId = meta.dragSessionId ?? `drag-${++dragSessionCounter}`;
    meta.dragSessionId = sessionId;
    const mode = typeof meta.mode === 'string' && meta.mode.length > 0 ? meta.mode : 'drag';
    const base: DragCommandOptionsBase = {
        mergeKey: `${mode}:${sessionId}`,
        canMergeWith: (other) => {
            if (other.command.type === 'batch') return true;
            if (other.command.type === 'updateElementConfig') return other.command.elementId === elementId;
            if (other.command.type === 'updateNodeTransform') {
                return useSceneStore.getState().nodeIdByElementId[elementId] === other.command.nodeId;
            }
            if (other.command.type === 'replaceGraph') return true;
            if (other.command.type === 'addKeyframe') return other.command.channelId.startsWith(`${elementId}.`);
            return false;
        },
    };
    meta.dragCommandOptionsBase = base;
    return base;
}

function applyGraphDragUpdate(meta: any, graph: ReturnType<typeof cloneSceneGraph>, transient = true) {
    const baseOptions = ensureDragCommandOptions(meta, meta.dragElementId ?? meta.nodeIds[0]);
    const store = useSceneStore.getState();
    const comparisonGraph = transient
        ? (meta.lastGraph ?? meta.originalGraph ?? store.graph)
        : (meta.originalGraph ?? store.graph);
    const tick = useTimelineStore.getState().timeline.currentTick;
    const autoKeying = useTimelineStore.getState().transport.autoKeying;
    const commands: SceneCommand[] = [];
    for (const nodeId of meta.nodeIds as string[]) {
        const previous = comparisonGraph.nodesById[nodeId]?.userNodeTransform;
        const next = graph.nodesById[nodeId]?.userNodeTransform;
        if (!previous || !next) continue;
        const staticPatch: Record<string, number> = {};
        const transientPatch: Record<string, number> = {};
        for (const path of Object.keys(next) as Array<keyof typeof next>) {
            const nextValue = next[path];
            if (typeof nextValue !== 'number' || !Number.isFinite(nextValue) || Object.is(previous[path], nextValue)) {
                continue;
            }
            const binding = store.nodeBindings[nodeId]?.[path];
            if (binding?.type === 'keyframes') {
                const existing = findKeyframeAtTick(
                    store.automation.channels[binding.channelId]?.keyframes ?? [],
                    tick
                );
                // A key at this frame is always the authored value being edited.
                // Auto Key controls creation of *new* keys, not updates to an existing one.
                if (autoKeying || existing) {
                    commands.push({
                        type: 'addKeyframe',
                        channelId: binding.channelId,
                        keyframe: existing ? { ...existing, tick, value: nextValue } : createKeyframe(tick, nextValue),
                    });
                } else {
                    transientPatch[path] = nextValue;
                }
            } else if (binding?.type === 'macro') {
                // Macro values are authoritative until the user explicitly detaches the macro in the inspector.
                continue;
            } else if (binding) {
                commands.push({
                    type: 'updatePropertyTargetBinding',
                    target: nodePropertyTarget(nodeId, path),
                    binding: { type: 'constant', value: nextValue },
                });
            } else if (autoKeying) {
                commands.push({
                    type: 'enablePropertyAutomation',
                    target: nodePropertyTarget(nodeId, path),
                    valueType: 'number',
                    initialKeyframes: [createKeyframe(tick, nextValue)],
                });
            } else {
                staticPatch[path] = nextValue;
            }
        }
        if (Object.keys(staticPatch).length) {
            commands.push({ type: 'updateNodeTransform', nodeId, transform: staticPatch });
        }
        if (Object.keys(transientPatch).length)
            useSceneEditorStore.getState().setTransientNodeTransform(nodeId, transientPatch);
    }
    if (commands.length) {
        dispatchSceneCommand(commands.length === 1 ? commands[0] : { type: 'batch', commands }, {
            source: 'canvas.aggregateTransform',
            ...baseOptions,
            transient,
        });
    }
    meta.lastGraph = graph;
}

function graphWithDisplayedNodeTransforms(vis: any, nodeIds: readonly string[]) {
    const graph = cloneSceneGraph(useSceneStore.getState().graph);
    const frame = vis.getResolvedSceneFrame?.(vis.getCurrentTime?.() ?? 0);
    for (const nodeId of nodeIds) {
        const displayed = frame?.byNodeId?.get(nodeId)?.node?.userNodeTransform;
        if (displayed)
            graph.nodesById[nodeId] = { ...graph.nodesById[nodeId], userNodeTransform: { ...displayed } } as any;
    }
    return graph;
}

// ----- Helper functions -----

function getWorldPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    return getCanvasWorldPoint(canvas, clientX, clientY);
}

function startHandleDrag(vis: any, handleHit: any, x: number, y: number) {
    const selectedId = vis._interactionState?.selectedElementId;
    const selectedNodeIds = useSelectionStore.getState().selectedNodeIds;
    const fallbackNodeId = selectedId ? useSceneStore.getState().nodeIdByElementId[selectedId] : undefined;
    const nodeIds = selectedNodeIds.length ? selectedNodeIds : fallbackNodeId ? [fallbackNodeId] : [];
    if (!selectedId && !nodeIds.length) return;
    vis.setInteractionState({ activeHandle: handleHit.id, draggingElementId: selectedId ?? nodeIds[0] });
    const selection = vis.getNodeSelectionAtTime?.(nodeIds, vis.getCurrentTime?.() ?? 0);
    if (!selection) return;
    const pivot = useSelectionStore.getState().selectionPivot ?? selection.pivot;
    const b = selection.bounds;
    const corners = selection.corners;
    const axisX = corners?.length === 4 ? unitVector(corners[0], corners[1]) : { x: 1, y: 0 };
    const axisY = corners?.length === 4 ? unitVector(corners[0], corners[3]) : { x: 0, y: 1 };
    const midpoint = (first: Point, second: Point) => ({
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
    });
    const oppositeByHandle: Record<string, { x: number; y: number }> =
        corners?.length === 4
            ? {
                  'scale-nw': corners[2],
                  'scale-ne': corners[3],
                  'scale-se': corners[0],
                  'scale-sw': corners[1],
                  'scale-n': midpoint(corners[2], corners[3]),
                  'scale-e': midpoint(corners[0], corners[3]),
                  'scale-s': midpoint(corners[0], corners[1]),
                  'scale-w': midpoint(corners[1], corners[2]),
              }
            : {
                  'scale-nw': { x: b.x + b.width, y: b.y + b.height },
                  'scale-ne': { x: b.x, y: b.y + b.height },
                  'scale-se': { x: b.x, y: b.y },
                  'scale-sw': { x: b.x + b.width, y: b.y },
                  'scale-n': { x: b.x + b.width / 2, y: b.y + b.height },
                  'scale-e': { x: b.x, y: b.y + b.height / 2 },
                  'scale-s': { x: b.x + b.width / 2, y: b.y },
                  'scale-w': { x: b.x + b.width, y: b.y + b.height / 2 },
              };
    const scaleOrigin = oppositeByHandle[handleHit.type] ?? pivot;
    vis._dragMeta = {
        mode: handleHit.type,
        startX: x,
        startY: y,
        bounds: { ...selection.bounds },
        pivot: { ...pivot },
        startDistance: Math.hypot(x - scaleOrigin.x, y - scaleOrigin.y) || 1,
        startAngle: Math.atan2(y - pivot.y, x - pivot.x),
        scaleOrigin,
        scaleAxisX: axisX,
        scaleAxisY: axisY,
        nodeIds: [...nodeIds],
        originalGraph: graphWithDisplayedNodeTransforms(vis, nodeIds),
        pivotRecord: nodeIds.length === 1 ? selection.records?.[0] : null,
        dragElementId: selectedId ?? nodeIds[0],
        snapTargets: buildSnapTargets(vis, useSelectionStore.getState().getSelectedElementIds()),
        snapTolerance: DEFAULT_SNAP_TOLERANCE,
    };
    vis.setInteractionState({ snapGuides: [] });
}

function attemptHandleHit(vis: any, x: number, y: number): boolean {
    const selectedId = vis._interactionState?.selectedElementId || null;
    const nodeIds = useSelectionStore.getState().selectedNodeIds;
    if (!selectedId && !nodeIds.length) return false;
    const handles = nodeIds.length
        ? vis.getSelectionHandlesForNodesAtTime?.(
              nodeIds,
              vis.getCurrentTime?.() ?? 0,
              useSelectionStore.getState().selectionPivot
          ) || []
        : vis.getSelectionHandlesAtTime?.(selectedId, vis.getCurrentTime?.() ?? 0) || [];
    const handleHit = findHandleUnderPoint(handles, x, y) as any;
    if (handleHit) {
        startHandleDrag(vis, handleHit, x, y);
        return true;
    }
    return false;
}

function performElementHitTest(vis: any, x: number, y: number, deps: InteractionDeps, toggle = false) {
    const { selectElement } = deps;
    const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
    const hit = elementHitTest(boundsList, x, y);
    if (hit) {
        const scene = useSceneStore.getState();
        const ownerNodeId = hit.nodeId ?? scene.nodeIdByElementId[hit.id];
        const ownerRecord = vis.getResolvedSceneFrame?.(vis.getCurrentTime?.() ?? 0)?.byNodeId?.get(ownerNodeId);
        if (!ownerNodeId || ownerRecord?.effectiveLocked) return false;
        const nodeTransform =
            ownerRecord?.node?.userNodeTransform ??
            (hit.nodeId ? useSceneStore.getState().graph.nodesById[hit.nodeId]?.userNodeTransform : undefined);
        if (toggle && deps.selectNode) deps.selectNode(ownerNodeId, { toggle: true });
        else selectElement(hit.id);
        const nodeIds = useSelectionStore.getState().selectedNodeIds;
        const selection = nodeIds.length ? vis.getNodeSelectionAtTime?.(nodeIds, vis.getCurrentTime?.() ?? 0) : null;
        vis.setInteractionState({ draggingElementId: hit.id, activeHandle: 'move', snapGuides: [] });
        vis._dragMeta = {
            mode: 'move',
            startX: x,
            startY: y,
            origOffsetX: nodeTransform?.translationX ?? 0,
            origOffsetY: nodeTransform?.translationY ?? 0,
            origRotation: nodeTransform?.rotation ?? 0,
            origSkewX: hit.element?.elementSkewX || 0,
            origSkewY: hit.element?.elementSkewY || 0,
            bounds: selection?.bounds ? { ...selection.bounds } : hit.bounds ? { ...hit.bounds } : null,
            corners: hit.corners || null,
            snapTargets: buildSnapTargets(
                vis,
                selectedSubtreeElementIds().length ? selectedSubtreeElementIds() : hit.id
            ),
            snapTolerance: DEFAULT_SNAP_TOLERANCE,
            dragElementId: hit.id,
            ...(nodeIds.length
                ? {
                      nodeIds: [...nodeIds],
                      originalGraph: graphWithDisplayedNodeTransforms(vis, nodeIds),
                      pivot: selection?.pivot,
                  }
                : {}),
        };
        return true;
    } else {
        selectElement(null);
        vis.setInteractionState({ hoverElementId: null, draggingElementId: null, activeHandle: null, snapGuides: [] });
        return false;
    }
}

function processDrag(
    vis: any,
    x: number,
    y: number,
    shiftKey: boolean,
    altKey: boolean,
    disableSnap: boolean,
    deps: InteractionDeps
) {
    if (!(vis._interactionState?.draggingElementId && vis._dragMeta)) return false;
    const meta = vis._dragMeta;
    const elId = vis._interactionState.draggingElementId;
    let guides: SnapGuide[] = [];
    if (meta.nodeIds?.length && meta.originalGraph) {
        if (meta.mode === 'move') {
            let dx = x - meta.startX;
            let dy = y - meta.startY;
            const snapped = disableSnap
                ? null
                : snapTranslation(
                      meta.bounds,
                      dx,
                      dy,
                      meta.snapTargets ?? [],
                      meta.snapTolerance ?? DEFAULT_SNAP_TOLERANCE
                  );
            if (snapped) {
                dx = snapped.dx;
                dy = snapped.dy;
                guides = snapped.guides;
            }
            applyGraphDragUpdate(
                meta,
                transformSceneNodes(meta.originalGraph, meta.nodeIds, translationMatrix(dx, dy))
            );
        } else if (meta.mode?.startsWith('scale') && meta.pivot) {
            const origin = altKey ? meta.pivot : (meta.scaleOrigin ?? meta.pivot);
            const isSideHandle = ['scale-n', 'scale-e', 'scale-s', 'scale-w'].includes(meta.mode);
            let scaleX: number;
            let scaleY: number;
            if (isSideHandle) {
                const factors = sideHandleScaleFactors(
                    meta.mode,
                    origin,
                    { x: meta.startX, y: meta.startY },
                    { x, y },
                    meta.scaleAxisX,
                    meta.scaleAxisY
                );
                scaleX = factors.scaleX;
                scaleY = factors.scaleY;
            } else {
                const startDistance = Math.hypot(meta.startX - origin.x, meta.startY - origin.y) || 1;
                const distance = Math.hypot(x - origin.x, y - origin.y);
                scaleX = scaleY = Math.max(0.001, distance / startDistance);
            }
            applyGraphDragUpdate(
                meta,
                transformSceneNodes(
                    meta.originalGraph,
                    meta.nodeIds,
                    matrixAroundPoint(orientedScaleMatrix(scaleX, scaleY, meta.scaleAxisX), origin.x, origin.y)
                )
            );
        } else if (meta.mode === 'rotate' && meta.pivot) {
            const pointerAngle = Math.atan2(y - meta.pivot.y, x - meta.pivot.x);
            meta.rotationDelta = accumulateRotationDrag(
                meta.lastPointerAngle ?? meta.startAngle,
                pointerAngle,
                meta.rotationDelta ?? 0
            );
            meta.lastPointerAngle = pointerAngle;
            let delta = meta.rotationDelta;
            if (shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
            applyGraphDragUpdate(
                meta,
                transformSceneNodes(
                    meta.originalGraph,
                    meta.nodeIds,
                    matrixAroundPoint(rotationMatrix(delta), meta.pivot.x, meta.pivot.y)
                )
            );
        } else if (meta.mode === 'pivot') {
            if (meta.nodeIds.length === 1 && meta.pivotRecord) {
                const record = meta.pivotRecord;
                const inverse = invertMatrix(record.nodeWorldTransform);
                const originalNode = meta.originalGraph.nodesById[meta.nodeIds[0]];
                if (inverse && originalNode) {
                    const beforeUser = nodeTransformToMatrix(originalNode.userNodeTransform);
                    const nextPivot = applyMatrixToPoint(inverse, { x, y });
                    const nextTransform = matrixToNodeTransform(
                        beforeUser,
                        nextPivot.x,
                        nextPivot.y,
                        originalNode.userNodeTransform
                    );
                    if (nextTransform) {
                        const nextGraph = cloneSceneGraph(meta.originalGraph);
                        nextGraph.nodesById[meta.nodeIds[0]].userNodeTransform = nextTransform;
                        nextGraph.revision += 1;
                        applyGraphDragUpdate(meta, nextGraph);
                    }
                }
            } else {
                useSelectionStore.getState().setSelectionPivot({ x, y });
                vis.setInteractionState({ selectionPivot: { x, y } });
            }
        }
        vis.setInteractionState({ snapGuides: guides });
        return true;
    }
    return false;
}

function updateHover(vis: any, x: number, y: number) {
    const selectedId = vis._interactionState?.selectedElementId || null;
    const nodeIds = useSelectionStore.getState().selectedNodeIds;
    if (selectedId || nodeIds.length) {
        const handles = nodeIds.length
            ? vis.getSelectionHandlesForNodesAtTime?.(
                  nodeIds,
                  vis.getCurrentTime?.() ?? 0,
                  useSelectionStore.getState().selectionPivot
              ) || []
            : vis.getSelectionHandlesAtTime?.(selectedId, vis.getCurrentTime?.() ?? 0) || [];
        const handleHover = findHandleUnderPoint(handles, x, y) as any;
        if (handleHover) {
            const cursors: Record<string, string> = {
                rotate: 'crosshair',
                pivot: 'crosshair',
                anchor: 'crosshair',
            };
            if (vis.canvas)
                vis.canvas.style.cursor =
                    resizeCursorForHandle(handleHover.type, handles) ?? cursors[handleHover.type] ?? 'move';
            if (vis._interactionState.activeHandle !== handleHover.id)
                vis.setInteractionState({ activeHandle: handleHover.id });
            return; // don't update element hover while over handle
        } else if (vis._interactionState.activeHandle) {
            vis.setInteractionState({ activeHandle: null });
        }
    }
    const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
    const hoverId = elementHoverId(boundsList, x, y);
    if (vis.canvas) vis.canvas.style.cursor = hoverId ? 'move' : 'default';
    if (hoverId !== vis._interactionState?.hoverElementId) vis.setInteractionState({ hoverElementId: hoverId });
}

function finalizeDrag(vis: any, deps: InteractionDeps) {
    const draggingId = vis._interactionState?.draggingElementId;
    const meta = vis._dragMeta;
    if (draggingId && meta?.lastGraph) applyGraphDragUpdate(meta, meta.lastGraph, false);
    if (draggingId) {
        vis.setInteractionState({ draggingElementId: null, activeHandle: null, snapGuides: [] });
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

function focusTextPropertyInput() {
    const attemptFocus = () => {
        const input = document.getElementById('config-text') as HTMLInputElement | null;
        if (!input) return;
        try {
            input.focus({ preventScroll: true });
        } catch {
            input.focus();
        }
        try {
            input.select();
        } catch {
            /* noop */
        }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.requestAnimationFrame(attemptFocus));
    } else {
        setTimeout(attemptFocus, 0);
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
    const hit = performElementHitTest(vis, x, y, deps, e.shiftKey);
    if (!hit) {
        vis._marqueeMeta = { start: { x, y }, end: { x, y } };
        vis.setInteractionState({ marqueeBounds: { x, y, width: 0, height: 0 } });
    }

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

                // Force property panel refresh (in case value cached)
                deps.incrementPropertyPanelRefresh();

                // Focus the corresponding property input after DOM updates
                const scheduleFocus = () => {
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
                    focusTextPropertyInput();
                };

                scheduleFocus();
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
    if (vis._marqueeMeta) {
        const meta = vis._marqueeMeta;
        meta.end = { x, y };
        const frame = vis.getResolvedSceneFrame?.(vis.getCurrentTime?.() ?? 0);
        if (frame) {
            const selection = useSelectionStore.getState();
            const store = useSceneStore.getState();
            const ids = marqueeNodeIds(frame, selection.editingContainerId ?? store.graph.rootId, meta.start, meta.end);
            selection.selectSceneNodes(ids, ids.at(-1) ?? null);
        }
        vis.setInteractionState({
            marqueeBounds: {
                x: Math.min(meta.start.x, x),
                y: Math.min(meta.start.y, y),
                width: Math.abs(x - meta.start.x),
                height: Math.abs(y - meta.start.y),
                direction: x >= meta.start.x ? 'containment' : 'intersection',
            },
        });
        return;
    }
    const disableSnap = Boolean(e.metaKey || e.ctrlKey);
    if (processDrag(vis, x, y, e.shiftKey, e.altKey ?? false, disableSnap, deps)) return;
    updateHover(vis, x, y);
}

export function onCanvasMouseUp(_e: CanvasMouseEvent, deps: InteractionDeps) {
    const { visualizer: vis } = deps;
    if (!vis) return;
    if (vis._marqueeMeta) {
        vis._marqueeMeta = null;
        vis.setInteractionState({ marqueeBounds: null });
    } else finalizeDrag(vis, deps);
}

export function onCanvasMouseLeave(_e: CanvasMouseEvent, deps: InteractionDeps) {
    const { visualizer: vis } = deps;
    if (!vis) return;
    if (vis._interactionState?.draggingElementId) {
        vis.setInteractionState({ hoverElementId: null, activeHandle: null, snapGuides: [] });
        return;
    }
    finalizeDrag(vis, deps);
    vis.setInteractionState({ hoverElementId: null, activeHandle: null, snapGuides: [] });
}
