import { describe, expect, it, vi } from 'vitest';
import { onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp } from '../canvasInteractionUtils';

function createHarness() {
    const canvas = {
        width: 200,
        height: 200,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    } as unknown as HTMLCanvasElement;
    const record = {
        id: 'warped',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        corners: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
        baseBounds: { x: 0, y: 0, width: 100, height: 100 },
        affineTransform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        warp: {
            topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 },
            bottomRight: { x: 1, y: 1 }, bottomLeft: { x: 0, y: 1 },
        },
        element: {},
    };
    const visualizer: any = {
        canvas,
        _interactionState: { selectedElementId: 'warped', draggingElementId: null, activeHandle: null },
        setInteractionState(patch: any) { Object.assign(this._interactionState, patch); },
        getCurrentTime: () => 0,
        getElementBoundsAtTime: () => [record],
        getSelectionHandlesAtTime: () => [
            { id: 'warp-tl', type: 'warp-tl', cx: 0, cy: 0, size: 16, shape: 'rect' },
            { id: 'warp-tr', type: 'warp-tr', cx: 100, cy: 0, size: 16, shape: 'rect' },
            { id: 'warp-br', type: 'warp-br', cx: 100, cy: 100, size: 16, shape: 'rect' },
            { id: 'warp-bl', type: 'warp-bl', cx: 0, cy: 100, size: 16, shape: 'rect' },
        ],
    };
    const updateElementConfig = vi.fn();
    const deps = {
        canvasRef: { current: canvas }, visualizer,
        selectElement: vi.fn(), updateElementConfig,
        incrementPropertyPanelRefresh: vi.fn(),
    };
    return { visualizer, deps, updateElementConfig };
}

describe('canvas perspective interaction', () => {
    it('writes one corner through a transient merged command and one final undo command', () => {
        const { visualizer, deps, updateElementConfig } = createHarness();
        onCanvasMouseDown({ clientX: 0, clientY: 0 } as MouseEvent, deps);
        onCanvasMouseMove({ clientX: -20, clientY: -10, shiftKey: false, altKey: false, ctrlKey: true } as MouseEvent, deps);
        onCanvasMouseUp({} as MouseEvent, deps);

        expect(updateElementConfig).toHaveBeenCalledTimes(2);
        expect(updateElementConfig.mock.calls[0][1]).toEqual({ warpTopLeftX: -0.2, warpTopLeftY: -0.1 });
        expect(updateElementConfig.mock.calls[0][2].transient).toBe(true);
        expect(updateElementConfig.mock.calls[1][2].transient).toBe(false);
        expect(updateElementConfig.mock.calls[1][2].mergeKey).toBe(updateElementConfig.mock.calls[0][2].mergeKey);
        expect(visualizer._interactionState.draggingElementId).toBeNull();
    });

    it('retains the last valid state when a drag sample would make the quad concave', () => {
        const { deps, updateElementConfig } = createHarness();
        onCanvasMouseDown({ clientX: 0, clientY: 0 } as MouseEvent, deps);
        onCanvasMouseMove({ clientX: 80, clientY: 80, shiftKey: false, altKey: false, ctrlKey: true } as MouseEvent, deps);
        onCanvasMouseUp({} as MouseEvent, deps);
        expect(updateElementConfig).not.toHaveBeenCalled();
    });
});
