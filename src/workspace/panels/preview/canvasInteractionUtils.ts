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
} from '@math/transforms/interaction';
import { computeAnchorAdjustment, computeRotation, computeScaledTransform } from '@core/interaction/mouse-transforms';
import {
    DEFAULT_SNAP_TOLERANCE,
    buildSnapTargets,
    snapPoint,
    snapTranslation,
    type SnapGuide,
} from '@core/interaction/snapping';
import type { GeometryInfo } from '@math/transforms/types';
import { useSceneStore } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { SceneCommand } from '@state/scene';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useSelectionStore } from '@state/selectionStore';
import { marqueeNodeIds } from '@state/scene';
import { createKeyframe, nodePropertyTarget } from '@automation/types';
import { useTimelineStore } from '@state/timelineStore';
import {
    cloneSceneGraph,
    applyMatrixToPoint,
    invertMatrix,
    matrixToNodeTransform,
    matrixAroundPoint,
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
    updateElementConfig?: (id: string, cfg: any, options?: Omit<SceneCommandOptions, 'source'>) => void;
    incrementPropertyPanelRefresh: () => void;
}

type DragCommandOptionsBase = Omit<SceneCommandOptions, 'source' | 'transient'>;

let dragSessionCounter = 0;

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

function applyDragUpdate(meta: any, elementId: string, cfg: Record<string, unknown>, deps: InteractionDeps) {
    const { updateElementConfig } = deps;
    if (!updateElementConfig) return;
    meta.dragElementId = elementId;
    const baseOptions = ensureDragCommandOptions(meta, elementId);
    updateElementConfig(elementId, cfg, { ...baseOptions, transient: true });
    meta.lastConfig = { ...cfg };
}

function applyNodeDragUpdate(meta: any, elementId: string, transform: Record<string, number>, transient = true) {
    const nodeId = useSceneStore.getState().nodeIdByElementId[elementId];
    if (!nodeId) return;
    meta.dragElementId = elementId;
    const baseOptions = ensureDragCommandOptions(meta, elementId);
    dispatchSceneCommand(
        { type: 'updateNodeTransform', nodeId, transform },
        { source: 'canvas.nodeTransform', ...baseOptions, transient }
    );
    meta.lastNodeTransform = { ...transform };
}

function applyGraphDragUpdate(meta: any, graph: ReturnType<typeof cloneSceneGraph>, transient = true) {
    const baseOptions = ensureDragCommandOptions(meta, meta.dragElementId ?? meta.nodeIds[0]);
    const store = useSceneStore.getState();
    const comparisonGraph = transient ? store.graph : (meta.originalGraph ?? store.graph);
    const tick = useTimelineStore.getState().timeline.currentTick;
    const autoKeying = useTimelineStore.getState().transport.autoKeying;
    const commands: SceneCommand[] = [];
    for (const nodeId of meta.nodeIds as string[]) {
        const previous = comparisonGraph.nodesById[nodeId]?.userNodeTransform;
        const next = graph.nodesById[nodeId]?.userNodeTransform;
        if (!previous || !next) continue;
        const staticPatch: Record<string, number> = {};
        for (const path of Object.keys(next) as Array<keyof typeof next>) {
            const nextValue = next[path];
            if (typeof nextValue !== 'number' || !Number.isFinite(nextValue) || Object.is(previous[path], nextValue)) {
                continue;
            }
            const binding = store.nodeBindings[nodeId]?.[path];
            if (binding?.type === 'keyframes') {
                commands.push({
                    type: 'addKeyframe',
                    channelId: binding.channelId,
                    keyframe: createKeyframe(tick, nextValue),
                });
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

// ----- Helper functions -----

function getWorldPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    return getCanvasWorldPoint(canvas, clientX, clientY);
}

function startHandleDrag(vis: any, handleHit: any, x: number, y: number) {
    const selectedId = vis._interactionState?.selectedElementId;
    const nodeIds = useSelectionStore.getState().selectedNodeIds;
    if (!selectedId && !nodeIds.length) return;
    vis.setInteractionState({ activeHandle: handleHit.id, draggingElementId: selectedId ?? nodeIds[0] });
    if (nodeIds.length) {
        const selection = vis.getNodeSelectionAtTime?.(nodeIds, vis.getCurrentTime?.() ?? 0);
        if (!selection) return;
        const pivot = useSelectionStore.getState().selectionPivot ?? selection.pivot;
        const b = selection.bounds;
        const corners = selection.corners;
        const oppositeByHandle: Record<string, { x: number; y: number }> =
            corners?.length === 4
                ? {
                      'scale-nw': corners[2],
                      'scale-ne': corners[3],
                      'scale-se': corners[0],
                      'scale-sw': corners[1],
                  }
                : {
                      'scale-nw': { x: b.x + b.width, y: b.y + b.height },
                      'scale-ne': { x: b.x, y: b.y + b.height },
                      'scale-se': { x: b.x, y: b.y },
                      'scale-sw': { x: b.x + b.width, y: b.y },
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
            nodeIds: [...nodeIds],
            originalGraph: cloneSceneGraph(useSceneStore.getState().graph),
            pivotRecord: nodeIds.length === 1 ? selection.records?.[0] : null,
            dragElementId: selectedId ?? nodeIds[0],
            snapTargets: buildSnapTargets(vis, useSelectionStore.getState().getSelectedElementIds()),
            snapTolerance: DEFAULT_SNAP_TOLERANCE,
        };
        vis.setInteractionState({ snapGuides: [] });
        return;
    }
    const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
    const rec = boundsList.find((b: any) => b.id === selectedId);
    if (handleHit.type?.startsWith('warp-')) {
        vis._dragMeta = {
            mode: handleHit.type,
            startX: x,
            startY: y,
            baseBounds: rec?.baseBounds ? { ...rec.baseBounds } : null,
            affineTransform: rec?.affineTransform ? { ...rec.affineTransform } : null,
            origWarp: rec?.warp
                ? {
                      topLeft: { ...rec.warp.topLeft },
                      topRight: { ...rec.warp.topRight },
                      bottomRight: { ...rec.warp.bottomRight },
                      bottomLeft: { ...rec.warp.bottomLeft },
                  }
                : null,
            dragElementId: selectedId,
            snapTargets: buildSnapTargets(vis, selectedId),
            snapTolerance: DEFAULT_SNAP_TOLERANCE,
        };
        vis.setInteractionState({ snapGuides: [] });
        return;
    }
    const { geom, fixedWorldPoint, fixedLocalPoint, dragLocalPoint } = computeScaleHandleReferencePoints(
        handleHit.type,
        rec
    );
    const el = rec?.element;
    const nodeTransform = rec?.nodeId
        ? useSceneStore.getState().graph.nodesById[rec.nodeId]?.userNodeTransform
        : undefined;
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
        origOffsetX: nodeTransform?.translationX ?? 0,
        origOffsetY: nodeTransform?.translationY ?? 0,
        origContentOffsetX: el?.getProperty('offsetX') ?? 0,
        origContentOffsetY: el?.getProperty('offsetY') ?? 0,
        origWidth: rec?.bounds?.width ?? 0,
        origHeight: rec?.bounds?.height ?? 0,
        origScaleX: nodeTransform?.scaleX ?? 1,
        origScaleY: nodeTransform?.scaleY ?? 1,
        origRotation: nodeTransform?.rotation ?? 0,
        origContentRotation: ((el?.getProperty('elementRotation') ?? 0) * Math.PI) / 180,
        origContentScaleX: 1,
        origContentScaleY: 1,
        origSkewX: el?.getProperty('elementSkewX') ?? 0,
        origSkewY: el?.getProperty('elementSkewY') ?? 0,
        origAnchorX: el?.getProperty('anchorX') ?? 0.5,
        origAnchorY: el?.getProperty('anchorY') ?? 0.5,
        bounds: rec?.bounds ? { ...rec.bounds } : null,
        corners: rec?.corners || null,
        baseBounds,
        geom: geometry,
        fixedWorldPoint,
        fixedLocalPoint,
        dragLocalPoint,
        centerWorld,
        centerLocal,
        warp: rec?.warp ?? null,
        anchorWorld: rec?.projectedAnchor ?? null,
        dragElementId: selectedId,
        snapTargets: buildSnapTargets(
            vis,
            selectedSubtreeElementIds().length ? selectedSubtreeElementIds() : selectedId
        ),
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
        const nodeTransform = hit.nodeId
            ? useSceneStore.getState().graph.nodesById[hit.nodeId]?.userNodeTransform
            : undefined;
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
                      originalGraph: cloneSceneGraph(useSceneStore.getState().graph),
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

function updateMoveDrag(
    meta: any,
    _vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    disableSnap: boolean,
    deps: InteractionDeps
): SnapGuide[] {
    const rawDx = x - meta.startX;
    const rawDy = y - meta.startY;
    const constrained = computeConstrainedMoveDelta(rawDx, rawDy, meta.origRotation || 0, shiftKey);
    let dx = constrained.dx;
    let dy = constrained.dy;
    let guides: SnapGuide[] | undefined = [];
    if (!disableSnap) {
        const targets = Array.isArray(meta.snapTargets) ? meta.snapTargets : [];
        const tolerance = typeof meta.snapTolerance === 'number' ? meta.snapTolerance : DEFAULT_SNAP_TOLERANCE;
        const snapResult = snapTranslation(meta.bounds ?? null, dx, dy, targets, tolerance);
        dx = snapResult.dx;
        dy = snapResult.dy;
        guides = snapResult.guides;
    }
    const newX = meta.origOffsetX + dx;
    const newY = meta.origOffsetY + dy;
    applyNodeDragUpdate(meta, elId, { translationX: newX, translationY: newY });
    return guides;
}

function updateScaleDrag(
    meta: any,
    _vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    altKey: boolean,
    disableSnap: boolean,
    deps: InteractionDeps
) {
    if (!meta.bounds) return [];
    let pointerX = x;
    let pointerY = y;
    let guides: SnapGuide[] = [];
    if (!disableSnap) {
        const targets = Array.isArray(meta.snapTargets) ? meta.snapTargets : [];
        const tolerance = typeof meta.snapTolerance === 'number' ? meta.snapTolerance : DEFAULT_SNAP_TOLERANCE;
        const snapResult = snapPoint(pointerX, pointerY, targets, tolerance);
        pointerX = snapResult.x;
        pointerY = snapResult.y;
        guides = snapResult.guides;
    }
    const r = computeScaledTransform(
        pointerX,
        pointerY,
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
            warp: meta.warp,
        },
        shiftKey,
        altKey &&
            (meta.mode === 'scale-ne' ||
                meta.mode === 'scale-nw' ||
                meta.mode === 'scale-se' ||
                meta.mode === 'scale-sw')
    );
    if (r) {
        applyNodeDragUpdate(meta, elId, {
            scaleX: r.newScaleX,
            scaleY: r.newScaleY,
            translationX: r.newOffsetX,
            translationY: r.newOffsetY,
        });
    }
    return guides;
}

function updateAnchorDrag(
    meta: any,
    _vis: any,
    elId: string,
    x: number,
    y: number,
    shiftKey: boolean,
    disableSnap: boolean,
    deps: InteractionDeps
) {
    if (!meta.bounds || !meta.baseBounds) return [];
    let pointerX = x;
    let pointerY = y;
    let guides: SnapGuide[] = [];
    const targets = Array.isArray(meta.snapTargets) ? meta.snapTargets : [];
    if (!disableSnap && targets.length) {
        const tolerance = typeof meta.snapTolerance === 'number' ? meta.snapTolerance : DEFAULT_SNAP_TOLERANCE;
        const snapResult = snapPoint(pointerX, pointerY, targets, tolerance);
        pointerX = snapResult.x;
        pointerY = snapResult.y;
        guides = snapResult.guides;
    }
    const { newAnchorX, newAnchorY, newOffsetX, newOffsetY } = computeAnchorAdjustment(
        pointerX,
        pointerY,
        {
            baseBounds: meta.baseBounds,
            origAnchorX: meta.origAnchorX,
            origAnchorY: meta.origAnchorY,
            origOffsetX: meta.origContentOffsetX,
            origOffsetY: meta.origContentOffsetY,
            origRotation: meta.origContentRotation,
            origSkewX: meta.origSkewX,
            origSkewY: meta.origSkewY,
            origScaleX: meta.origContentScaleX,
            origScaleY: meta.origContentScaleY,
            warp: meta.warp,
        },
        shiftKey
    );
    const cfg = { anchorX: newAnchorX, anchorY: newAnchorY, offsetX: newOffsetX, offsetY: newOffsetY };
    applyDragUpdate(meta, elId, cfg, deps);
    return guides;
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
    if (!meta.bounds) return [];
    const newRotationRad = computeRotation(x, y, meta, shiftKey);
    applyNodeDragUpdate(meta, elId, { rotation: newRotationRad });
    return [];
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
            const startDistance = Math.hypot(meta.startX - origin.x, meta.startY - origin.y) || 1;
            const distance = Math.hypot(x - origin.x, y - origin.y);
            const factor = Math.max(0.001, distance / startDistance);
            applyGraphDragUpdate(
                meta,
                transformSceneNodes(
                    meta.originalGraph,
                    meta.nodeIds,
                    matrixAroundPoint(scaleMatrix(factor), origin.x, origin.y)
                )
            );
        } else if (meta.mode === 'rotate' && meta.pivot) {
            let delta = Math.atan2(y - meta.pivot.y, x - meta.pivot.x) - meta.startAngle;
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
    switch (true) {
        case meta.mode === 'move':
            guides = updateMoveDrag(meta, vis, elId, x, y, shiftKey, disableSnap, deps);
            break;
        case meta.mode?.startsWith('scale') && !!meta.bounds:
            guides = updateScaleDrag(meta, vis, elId, x, y, shiftKey, altKey, disableSnap, deps);
            break;
        case meta.mode === 'anchor' && !!meta.bounds:
            guides = updateAnchorDrag(meta, vis, elId, x, y, shiftKey, disableSnap, deps);
            break;
        case meta.mode === 'rotate' && !!meta.bounds:
            guides = updateRotateDrag(meta, vis, elId, x, y, shiftKey, deps);
            break;
        default:
            break;
    }
    const nextGuides = Array.isArray(guides) ? guides : [];
    vis.setInteractionState({ snapGuides: nextGuides });
    return true;
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
                'scale-nw': 'nwse-resize',
                'scale-se': 'nwse-resize',
                'scale-ne': 'nesw-resize',
                'scale-sw': 'nesw-resize',
                rotate: 'crosshair',
                pivot: 'crosshair',
                anchor: 'crosshair',
            };
            if (vis.canvas) vis.canvas.style.cursor = cursors[handleHover.type] ?? 'move';
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
    if (draggingId && meta?.lastNodeTransform) {
        applyNodeDragUpdate(meta, draggingId, meta.lastNodeTransform, false);
    }
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
    const hit = performElementHitTest(vis, x, y, deps, Boolean(e.metaKey || e.ctrlKey));
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
