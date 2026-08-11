import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMatrixToPoint } from '@state/scene-graph';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { useTimelineStore } from '@state/timelineStore';
import { createPatchUndoController } from '@state/undo';
import {
    accumulateRotationDrag,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    orientedScaleMatrix,
    resizeCursorForHandle,
    sideHandleScaleFactors,
} from './canvasInteractionUtils';

function canvasMouseEvent(x: number, y: number, options: { altKey?: boolean; ctrlKey?: boolean } = {}) {
    return {
        clientX: x,
        clientY: y,
        altKey: options.altKey ?? false,
        ctrlKey: options.ctrlKey ?? false,
        metaKey: false,
        shiftKey: false,
    } as MouseEvent;
}

function createInteractionHarness(
    boundsList: Array<{ id: string; nodeId: string; bounds: { x: number; y: number; width: number; height: number } }>,
    selectionBounds: { x: number; y: number; width: number; height: number }
) {
    const visualizer: any = {
        canvas: { width: 200, height: 100 },
        _interactionState: {
            selectedElementId: useSelectionStore.getState().getSelectedElementIds().at(-1) ?? null,
        },
        getCurrentTime: () => 0,
        getElementBoundsAtTime: () => boundsList,
        getResolvedSceneFrame: () => ({
            byNodeId: new Map(
                Object.entries(useSceneStore.getState().graph.nodesById).map(([nodeId, node]) => [
                    nodeId,
                    { effectiveLocked: false, node },
                ])
            ),
        }),
        getNodeSelectionAtTime: () => ({
            bounds: selectionBounds,
            pivot: {
                x: selectionBounds.x + selectionBounds.width / 2,
                y: selectionBounds.y + selectionBounds.height / 2,
            },
        }),
        setInteractionState(patch: Record<string, unknown>) {
            this._interactionState = { ...this._interactionState, ...patch };
        },
        invalidateRender: vi.fn(),
    };
    const canvas = {
        width: 200,
        height: 100,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    } as HTMLCanvasElement;
    const selectElement = vi.fn((elementId: string | null) => {
        const scene = useSceneStore.getState();
        const nodeId = elementId ? scene.nodeIdByElementId[elementId] : null;
        useSelectionStore.getState().selectSceneNodes(nodeId ? [nodeId] : [], nodeId);
        visualizer._interactionState.selectedElementId = elementId;
    });
    const selectNode = vi.fn((nodeId: string, options?: { toggle?: boolean }) => {
        if (options?.toggle) useSelectionStore.getState().toggleSceneNode(nodeId);
        else useSelectionStore.getState().selectSceneNodes([nodeId], nodeId);
    });
    return {
        visualizer,
        deps: {
            canvasRef: { current: canvas },
            visualizer,
            selectElement,
            selectNode,
            incrementPropertyPanelRefresh: vi.fn(),
        },
        selectElement,
        selectNode,
    };
}

describe('accumulateRotationDrag', () => {
    it('keeps a group rotation connected while crossing the atan2 seam', () => {
        const angles = [(170 * Math.PI) / 180, (179 * Math.PI) / 180, (-179 * Math.PI) / 180, (-170 * Math.PI) / 180];
        let accumulated = 0;
        for (let index = 1; index < angles.length; index += 1) {
            accumulated = accumulateRotationDrag(angles[index - 1], angles[index], accumulated);
        }

        expect(accumulated).toBeCloseTo((20 * Math.PI) / 180, 10);
    });

    it('supports rotations beyond a full turn', () => {
        const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];
        let accumulated = 0;
        for (let index = 1; index < angles.length; index += 1) {
            accumulated = accumulateRotationDrag(angles[index - 1], angles[index], accumulated);
        }

        expect(accumulated).toBeCloseTo(Math.PI * 3, 10);
    });
});

describe('preview resize handles', () => {
    it('changes only the local x scale when a rotated edge handle is dragged', () => {
        const diagonal = Math.SQRT1_2;
        const axisX = { x: diagonal, y: diagonal };
        const axisY = { x: -diagonal, y: diagonal };
        const factors = sideHandleScaleFactors(
            'scale-w',
            { x: 100, y: 100 },
            { x: 50, y: 50 },
            { x: 25, y: 25 },
            axisX,
            axisY
        );

        expect(factors).toEqual({ scaleX: 1.5, scaleY: 1 });
        const matrix = orientedScaleMatrix(factors.scaleX, factors.scaleY, axisX);
        const scaledX = applyMatrixToPoint(matrix, axisX);
        const unchangedY = applyMatrixToPoint(matrix, axisY);
        expect(scaledX.x).toBeCloseTo(axisX.x * 1.5);
        expect(scaledX.y).toBeCloseTo(axisX.y * 1.5);
        expect(unchangedY.x).toBeCloseTo(axisY.x);
        expect(unchangedY.y).toBeCloseTo(axisY.y);
    });

    it('selects edge resize cursors from the object rotation', () => {
        const handlesAt = (degrees: number) => {
            const radians = (degrees * Math.PI) / 180;
            const x = Math.cos(radians) * 50;
            const y = Math.sin(radians) * 50;
            return [
                { type: 'scale-w', cx: -x, cy: -y },
                { type: 'scale-e', cx: x, cy: y },
                { type: 'scale-nw', cx: -x - y * 0.2, cy: -y + x * 0.2 },
                { type: 'scale-ne', cx: x - y * 0.2, cy: y + x * 0.2 },
            ];
        };

        expect(resizeCursorForHandle('scale-w', handlesAt(0))).toBe('ew-resize');
        expect(resizeCursorForHandle('scale-w', handlesAt(45))).toBe('nwse-resize');
        expect(resizeCursorForHandle('scale-w', handlesAt(90))).toBe('ns-resize');
        expect(resizeCursorForHandle('scale-w', handlesAt(135))).toBe('nesw-resize');
        expect(resizeCursorForHandle('scale-nw', handlesAt(0))).toBe('nwse-resize');
        expect(resizeCursorForHandle('scale-nw', handlesAt(45))).toBe('ns-resize');
    });
});

describe('preview aggregate move gestures', () => {
    let undo: ReturnType<typeof createPatchUndoController> | null = null;

    beforeEach(() => {
        useSceneStore.getState().clearScene();
        useSelectionStore.getState().selectSceneNodes([], null);
    });

    afterEach(() => {
        undo?.dispose();
        undo = null;
        useSceneStore.getState().clearScene();
        useSelectionStore.getState().selectSceneNodes([], null);
    });

    it('preserves a multi-selection and moves every selected node as one undoable gesture', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'first' });
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'second' });
        const scene = useSceneStore.getState();
        const firstNodeId = scene.nodeIdByElementId.first;
        const secondNodeId = scene.nodeIdByElementId.second;
        const firstBefore = { ...scene.graph.nodesById[firstNodeId].userNodeTransform };
        const secondBefore = { ...scene.graph.nodesById[secondNodeId].userNodeTransform };
        useSelectionStore.getState().selectSceneNodes([firstNodeId, secondNodeId], secondNodeId);
        undo = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
        const { deps, selectElement } = createInteractionHarness(
            [
                { id: 'first', nodeId: firstNodeId, bounds: { x: 10, y: 10, width: 20, height: 20 } },
                { id: 'second', nodeId: secondNodeId, bounds: { x: 50, y: 10, width: 20, height: 20 } },
            ],
            { x: 10, y: 10, width: 60, height: 20 }
        );

        onCanvasMouseDown(canvasMouseEvent(15, 15), deps);
        expect(selectElement).not.toHaveBeenCalled();
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([firstNodeId, secondNodeId]);

        onCanvasMouseMove(canvasMouseEvent(35, 25, { ctrlKey: true }), deps);
        onCanvasMouseUp(canvasMouseEvent(35, 25), deps);

        expect(useSceneStore.getState().graph.nodesById[firstNodeId].userNodeTransform).toMatchObject({
            translationX: firstBefore.translationX + 20,
            translationY: firstBefore.translationY + 10,
        });
        expect(useSceneStore.getState().graph.nodesById[secondNodeId].userNodeTransform).toMatchObject({
            translationX: secondBefore.translationX + 20,
            translationY: secondBefore.translationY + 10,
        });

        undo?.undo();
        expect(useSceneStore.getState().graph.nodesById[firstNodeId].userNodeTransform).toEqual(firstBefore);
        expect(useSceneStore.getState().graph.nodesById[secondNodeId].userNodeTransform).toEqual(secondBefore);
    });

    it('drags a selected group when its painted child is hit', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'child' });
        const childNodeId = useSceneStore.getState().nodeIdByElementId.child;
        dispatchSceneCommand({ type: 'groupNodes', nodeIds: [childNodeId], groupId: 'group:selected' });
        const scene = useSceneStore.getState();
        const groupBefore = { ...scene.graph.nodesById['group:selected'].userNodeTransform };
        const childBefore = { ...scene.graph.nodesById[childNodeId].userNodeTransform };
        useSelectionStore.getState().selectSceneNodes(['group:selected'], 'group:selected');
        undo = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
        const { deps, selectElement, visualizer } = createInteractionHarness(
            [{ id: 'child', nodeId: childNodeId, bounds: { x: 10, y: 10, width: 20, height: 20 } }],
            { x: 10, y: 10, width: 20, height: 20 }
        );

        onCanvasMouseDown(canvasMouseEvent(15, 15), deps);
        expect(selectElement).not.toHaveBeenCalled();
        expect(useSelectionStore.getState().selectedNodeIds).toEqual(['group:selected']);
        expect(visualizer._dragMeta.nodeIds).toEqual(['group:selected']);

        onCanvasMouseMove(canvasMouseEvent(40, 30, { ctrlKey: true }), deps);
        onCanvasMouseUp(canvasMouseEvent(40, 30), deps);

        expect(useSceneStore.getState().graph.nodesById['group:selected'].userNodeTransform).toMatchObject({
            translationX: groupBefore.translationX + 25,
            translationY: groupBefore.translationY + 15,
        });
        expect(useSceneStore.getState().graph.nodesById[childNodeId].userNodeTransform).toEqual(childBefore);
        expect(useSelectionStore.getState().selectedNodeIds).toEqual(['group:selected']);

        undo?.undo();
        expect(useSceneStore.getState().graph.nodesById['group:selected'].userNodeTransform).toEqual(groupBefore);
    });

    it('retains ordinary replacement, Shift-toggle, and empty-canvas marquee behavior', () => {
        for (const id of ['first', 'second', 'third'])
            dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: id });
        const scene = useSceneStore.getState();
        const firstNodeId = scene.nodeIdByElementId.first;
        const secondNodeId = scene.nodeIdByElementId.second;
        const thirdNodeId = scene.nodeIdByElementId.third;
        const bounds = [
            { id: 'first', nodeId: firstNodeId, bounds: { x: 10, y: 10, width: 20, height: 20 } },
            { id: 'second', nodeId: secondNodeId, bounds: { x: 50, y: 10, width: 20, height: 20 } },
            { id: 'third', nodeId: thirdNodeId, bounds: { x: 90, y: 10, width: 20, height: 20 } },
        ];

        useSelectionStore.getState().selectSceneNodes([firstNodeId, secondNodeId], secondNodeId);
        const replacement = createInteractionHarness(bounds, { x: 10, y: 10, width: 100, height: 20 });
        onCanvasMouseDown(canvasMouseEvent(95, 15), replacement.deps);
        expect(replacement.selectElement).toHaveBeenCalledWith('third');
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([thirdNodeId]);
        onCanvasMouseUp(canvasMouseEvent(95, 15), replacement.deps);

        useSelectionStore.getState().selectSceneNodes([firstNodeId, secondNodeId], secondNodeId);
        const toggle = createInteractionHarness(bounds, { x: 10, y: 10, width: 60, height: 20 });
        onCanvasMouseDown({ ...canvasMouseEvent(15, 15), shiftKey: true }, toggle.deps);
        expect(toggle.selectNode).toHaveBeenCalledWith(firstNodeId, { toggle: true });
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([secondNodeId]);
        onCanvasMouseUp(canvasMouseEvent(15, 15), toggle.deps);

        const marquee = createInteractionHarness(bounds, { x: 50, y: 10, width: 20, height: 20 });
        onCanvasMouseDown(canvasMouseEvent(170, 80), marquee.deps);
        expect(marquee.selectElement).toHaveBeenCalledWith(null);
        expect(marquee.visualizer._marqueeMeta).toMatchObject({
            start: { x: 170, y: 80 },
            end: { x: 170, y: 80 },
        });
    });

    it('uses the actual clicked text element when a double-click enters editing', () => {
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'first' });
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'second' });
        const scene = useSceneStore.getState();
        const firstNodeId = scene.nodeIdByElementId.first;
        const secondNodeId = scene.nodeIdByElementId.second;
        useSelectionStore.getState().selectSceneNodes([firstNodeId, secondNodeId], secondNodeId);
        const harness = createInteractionHarness(
            [
                { id: 'first', nodeId: firstNodeId, bounds: { x: 10, y: 10, width: 20, height: 20 } },
                { id: 'second', nodeId: secondNodeId, bounds: { x: 50, y: 10, width: 20, height: 20 } },
            ],
            { x: 10, y: 10, width: 60, height: 20 }
        );
        const now = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200);

        onCanvasMouseDown(canvasMouseEvent(15, 15), harness.deps);
        onCanvasMouseUp(canvasMouseEvent(15, 15), harness.deps);
        onCanvasMouseDown(canvasMouseEvent(15, 15), harness.deps);

        expect(harness.selectElement).toHaveBeenCalledTimes(1);
        expect(harness.selectElement).toHaveBeenCalledWith('first');
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([firstNodeId]);
        expect(harness.visualizer._dragMeta).toBeNull();
        now.mockRestore();
    });
});

describe('preview Alt-drag duplication', () => {
    let undo: ReturnType<typeof createPatchUndoController> | null = null;

    beforeEach(() => {
        useSceneStore.getState().clearScene();
        useSelectionStore.getState().selectSceneNodes([], null);
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'original' });
        undo = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
    });

    afterEach(() => {
        undo?.dispose();
        undo = null;
        useSceneStore.getState().clearScene();
        useSelectionStore.getState().selectSceneNodes([], null);
    });

    it('duplicates and moves the copy as one undoable canvas gesture', () => {
        const originalNodeId = useSceneStore.getState().nodeIdByElementId.original;
        const originalTransform = {
            ...useSceneStore.getState().graph.nodesById[originalNodeId].userNodeTransform,
        };
        const bounds = { x: 10, y: 10, width: 20, height: 20 };
        const visualizer: any = {
            canvas: { width: 100, height: 100 },
            _interactionState: { selectedElementId: null },
            getCurrentTime: () => 0,
            getElementBoundsAtTime: () => [{ id: 'original', nodeId: originalNodeId, bounds }],
            getResolvedSceneFrame: () => ({
                byNodeId: new Map([
                    [
                        originalNodeId,
                        {
                            effectiveLocked: false,
                            node: useSceneStore.getState().graph.nodesById[originalNodeId],
                        },
                    ],
                ]),
            }),
            getNodeSelectionAtTime: () => ({ bounds, pivot: { x: 20, y: 20 } }),
            setInteractionState(patch: Record<string, unknown>) {
                this._interactionState = { ...this._interactionState, ...patch };
            },
            invalidateRender: vi.fn(),
        };
        const canvas = {
            width: 100,
            height: 100,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
        } as HTMLCanvasElement;
        const deps = {
            canvasRef: { current: canvas },
            visualizer,
            selectElement: (elementId: string | null) => {
                const state = useSceneStore.getState();
                const nodeId = elementId ? state.nodeIdByElementId[elementId] : null;
                useSelectionStore.getState().selectSceneNodes(nodeId ? [nodeId] : [], nodeId);
            },
            incrementPropertyPanelRefresh: vi.fn(),
        };

        onCanvasMouseDown(canvasMouseEvent(15, 15, { altKey: true }), deps);
        expect(Object.keys(useSceneStore.getState().elements)).toEqual(['original']);

        onCanvasMouseMove(canvasMouseEvent(35, 30, { altKey: true, ctrlKey: true }), deps);
        onCanvasMouseUp(canvasMouseEvent(35, 30, { altKey: true }), deps);

        const moved = useSceneStore.getState();
        expect(Object.keys(moved.elements).sort()).toEqual(['original', 'original_1']);
        expect(moved.graph.nodesById[originalNodeId].userNodeTransform).toEqual(originalTransform);
        const duplicateNodeId = moved.nodeIdByElementId.original_1;
        expect(moved.graph.nodesById[duplicateNodeId].userNodeTransform).toMatchObject({
            translationX: originalTransform.translationX + 20,
            translationY: originalTransform.translationY + 15,
        });
        expect(useSelectionStore.getState().selectedNodeIds).toEqual([duplicateNodeId]);

        undo?.undo();
        expect(Object.keys(useSceneStore.getState().elements)).toEqual(['original']);
        undo?.redo();
        expect(useSceneStore.getState().graph.nodesById[duplicateNodeId].userNodeTransform).toMatchObject({
            translationX: originalTransform.translationX + 20,
            translationY: originalTransform.translationY + 15,
        });
    });

    it('duplicates every member of a preserved multi-selection', () => {
        undo?.dispose();
        dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId: 'second' });
        const scene = useSceneStore.getState();
        const originalNodeId = scene.nodeIdByElementId.original;
        const secondNodeId = scene.nodeIdByElementId.second;
        const originalBefore = { ...scene.graph.nodesById[originalNodeId].userNodeTransform };
        const secondBefore = { ...scene.graph.nodesById[secondNodeId].userNodeTransform };
        useSelectionStore.getState().selectSceneNodes([originalNodeId, secondNodeId], secondNodeId);
        undo = createPatchUndoController(useTimelineStore, { maxDepth: 10 });
        const { deps } = createInteractionHarness(
            [
                { id: 'original', nodeId: originalNodeId, bounds: { x: 10, y: 10, width: 20, height: 20 } },
                { id: 'second', nodeId: secondNodeId, bounds: { x: 50, y: 10, width: 20, height: 20 } },
            ],
            { x: 10, y: 10, width: 60, height: 20 }
        );

        onCanvasMouseDown(canvasMouseEvent(15, 15, { altKey: true }), deps);
        onCanvasMouseMove(canvasMouseEvent(35, 25, { altKey: true, ctrlKey: true }), deps);
        onCanvasMouseUp(canvasMouseEvent(35, 25, { altKey: true }), deps);

        const duplicated = useSceneStore.getState();
        expect(Object.keys(duplicated.elements).sort()).toEqual(['original', 'original_1', 'second', 'second_1']);
        expect(duplicated.graph.nodesById[originalNodeId].userNodeTransform).toEqual(originalBefore);
        expect(duplicated.graph.nodesById[secondNodeId].userNodeTransform).toEqual(secondBefore);
        const duplicateNodeIds = [duplicated.nodeIdByElementId.original_1, duplicated.nodeIdByElementId.second_1];
        expect(useSelectionStore.getState().selectedNodeIds).toEqual(duplicateNodeIds);
        expect(duplicated.graph.nodesById[duplicateNodeIds[0]].userNodeTransform).toMatchObject({
            translationX: originalBefore.translationX + 20,
            translationY: originalBefore.translationY + 10,
        });
        expect(duplicated.graph.nodesById[duplicateNodeIds[1]].userNodeTransform).toMatchObject({
            translationX: secondBefore.translationX + 20,
            translationY: secondBefore.translationY + 10,
        });

        undo?.undo();
        expect(Object.keys(useSceneStore.getState().elements).sort()).toEqual(['original', 'second']);
    });
});
