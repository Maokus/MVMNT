import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { useTimelineStore } from '@state/timelineStore';
import { DRAG_ASSET_TYPE } from '../asset-manager/AssetManagerPanel';
import PreviewPanel from './PreviewPanel';

const mocks = vi.hoisted(() => ({
    addElement: vi.fn(),
    selectElement: vi.fn(),
    canvasRef: { current: null as HTMLCanvasElement | null },
    visualizer: null as any,
    selectedNodeIds: [] as string[],
}));

vi.mock('@context/VisualizerContext', () => ({
    useVisualizer: () => ({
        canvasRef: mocks.canvasRef,
        exportSettings: { width: 1920, height: 1080 },
        visualizer: mocks.visualizer,
    }),
}));

vi.mock('@context/SceneSelectionContext', () => ({
    useSceneSelection: () => ({
        selectElement: mocks.selectElement,
        selectNode: vi.fn(),
        updateElementConfig: vi.fn(),
        incrementPropertyPanelRefresh: vi.fn(),
        addElement: mocks.addElement,
        selectedNodeIds: mocks.selectedNodeIds,
    }),
}));

vi.mock('./canvasInteractionUtils', () => ({
    onCanvasMouseDown: vi.fn(),
    onCanvasMouseMove: vi.fn(),
    onCanvasMouseUp: vi.fn(),
    onCanvasMouseLeave: vi.fn(),
}));

class ResizeObserverStub {
    observe() {}
    disconnect() {}
}

const pointerEvent = (type: string, clientX: number, clientY: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        pointerId: { value: 1 },
    });
    return event;
};

describe('PreviewPanel element creation shortcut', () => {
    beforeEach(() => {
        mocks.addElement.mockReset();
        mocks.selectElement.mockReset();
        mocks.visualizer = null;
        mocks.selectedNodeIds = [];
        globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
        useTimelineStore.setState((state) => ({
            transport: { ...state.transport, isPlaying: false },
        }));
    });

    afterEach(() => {
        cleanup();
        resetGlobalShortcutsForTest();
        vi.useRealTimers();
    });

    it('opens Shift+A only while the preview is the active editor and creates the chosen element', () => {
        const { container } = render(<PreviewPanel />);
        const preview = container.querySelector('.preview-panel')!;

        fireEvent.keyDown(window, { key: 'A', shiftKey: true });
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();

        fireEvent(preview, pointerEvent('pointerover', 123, 234));
        fireEvent.pointerDown(preview);

        const input = document.createElement('input');
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: 'A', shiftKey: true });
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();
        input.remove();

        fireEvent.keyDown(window, { key: 'A', shiftKey: true, ctrlKey: true });
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'A', shiftKey: true });
        const dialog = screen.getByRole('dialog', { name: 'Add Element' });
        expect(dialog).toHaveStyle({ left: '123px', top: '234px' });

        fireEvent.click(screen.getByText('Basic Shapes').closest('button')!);
        expect(mocks.addElement).toHaveBeenCalledOnce();
        expect(mocks.addElement).toHaveBeenCalledWith('basicShapes');
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();
    });

    it('delays transient preparation and updates a visible notice with the pending reason', () => {
        vi.useFakeTimers();
        let readiness: any = {
            status: 'preparing',
            reason: 'Replaying simulation',
            affected: [{ elementId: 'particles' }],
        };
        let notify = () => {};
        mocks.visualizer = {
            getSimulationReadiness: () => readiness,
            subscribeSimulationStatus: (listener: () => void) => {
                notify = listener;
                return () => {};
            },
        };

        render(<PreviewPanel />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        act(() => vi.advanceTimersByTime(500));
        expect(screen.getByRole('status')).toHaveTextContent('Preparing simulation — Replaying simulation');

        readiness = {
            status: 'pending',
            reason: "Audio decoding pending for 'track-1'",
            affected: [{ elementId: 'particles' }, { elementId: 'spectrum' }],
        };
        act(() => notify());
        expect(screen.getByRole('status')).toHaveTextContent(
            "2 elements · Simulation waiting for inputs — Audio decoding pending for 'track-1'"
        );
    });

    it('delays playback preparation notices and explains retained artwork during sustained load', () => {
        vi.useFakeTimers();
        const readiness = {
            status: 'preparing',
            reason: 'Catching up',
            affected: [
                {
                    elementId: 'particles',
                    elementType: 'test:particles',
                    status: 'preparing',
                    completedStep: 100,
                    targetStep: 104,
                    changedAt: 0,
                    lagSteps: 4,
                    hasRenderableFrame: true,
                },
            ],
        };
        mocks.visualizer = {
            getSimulationReadiness: () => readiness,
            subscribeSimulationStatus: () => () => {},
        };
        useTimelineStore.setState((state) => ({
            transport: { ...state.transport, isPlaying: true },
        }));

        render(<PreviewPanel />);
        act(() => vi.advanceTimersByTime(300));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        act(() => vi.advanceTimersByTime(200));
        expect(screen.getByRole('status')).toHaveTextContent('Showing previously completed artwork');
    });

    it('does not restart the notice deadline on progress, retargeting, or input waits', () => {
        vi.useFakeTimers();
        let readiness: any = { status: 'preparing', reason: 'Seeking', affected: [{ hasRenderableFrame: true }] };
        let notify = () => {};
        mocks.visualizer = {
            getSimulationReadiness: () => readiness,
            subscribeSimulationStatus: (listener: () => void) => {
                notify = listener;
                return () => {};
            },
        };
        render(<PreviewPanel />);
        for (let update = 0; update < 4; update++) {
            act(() => vi.advanceTimersByTime(100));
            readiness = {
                ...readiness,
                reason: `Seeking ${update}`,
                affected: [{ hasRenderableFrame: true, targetStep: update }],
            };
            act(() => notify());
        }
        readiness = { ...readiness, status: 'pending', reason: 'Decoding audio' };
        act(() => notify());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        act(() => vi.advanceTimersByTime(100));
        expect(screen.getByRole('status')).toHaveTextContent('Decoding audio');
        expect(screen.getByRole('status')).toHaveTextContent('Showing previously completed artwork');
        readiness = { status: 'ready', affected: [] };
        act(() => notify());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        readiness = { status: 'error', reason: 'Missing source', affected: [{}] };
        act(() => notify());
        expect(screen.getByRole('status')).toHaveTextContent('Missing source');
    });

    it('does not flash a transient pending notice when playback has renderable output', () => {
        vi.useFakeTimers();
        let readiness: any = {
            status: 'pending',
            reason: 'Simulation inputs are not ready',
            affected: [{ elementId: 'particles', hasRenderableFrame: true }],
        };
        let notify = () => {};
        mocks.visualizer = {
            getSimulationReadiness: () => readiness,
            subscribeSimulationStatus: (listener: () => void) => {
                notify = listener;
                return () => {};
            },
        };
        useTimelineStore.setState((state) => ({
            transport: { ...state.transport, isPlaying: true },
        }));

        render(<PreviewPanel />);
        act(() => vi.advanceTimersByTime(300));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        readiness = { status: 'ready', affected: [] };
        act(() => notify());
        act(() => vi.advanceTimersByTime(500));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('mounts the interaction overlay canvas, registers it with the visualizer, and dispatches container and canvas pointerdown with preventDefault', () => {
        const setOverlayCanvas = vi.fn();
        const readyStatus = { status: 'ready' as const, affected: [] };
        mocks.visualizer = {
            setOverlayCanvas,
            getSimulationReadiness: () => readyStatus,
            subscribeSimulationStatus: () => () => {},
        };

        const { container, unmount } = render(<PreviewPanel />);
        const overlay = container.querySelector('.interaction-overlay-canvas');
        expect(overlay).toBeInTheDocument();
        expect(setOverlayCanvas).toHaveBeenCalledWith(overlay);

        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;
        expect(canvas).toBeInTheDocument();
        expect(canvas.style.pointerEvents).toBe('auto');

        const canvasMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        fireEvent(canvas, canvasMouseDown);
        expect(canvasMouseDown.defaultPrevented).toBe(true);

        const canvasContainer = container.querySelector('.canvas-container')!;
        const containerMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        fireEvent(canvasContainer, containerMouseDown);
        expect(containerMouseDown.defaultPrevented).toBe(true);

        unmount();
        expect(setOverlayCanvas).toHaveBeenCalledWith(null);
    });

    it('unselects everything and suppresses context menu on right-click anywhere in preview', () => {
        mocks.visualizer = {
            setInteractionState: vi.fn(),
            invalidateRender: vi.fn(),
        };
        const { container } = render(<PreviewPanel />);
        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;
        const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        fireEvent(canvas, contextMenuEvent);

        expect(contextMenuEvent.defaultPrevented).toBe(true);
        expect(mocks.selectElement).toHaveBeenCalledWith(null);
        expect(mocks.visualizer.setInteractionState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedElementId: null, selectedNodeIds: [] })
        );

        const canvasMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 });
        fireEvent(canvas, canvasMouseDown);
        expect(canvasMouseDown.defaultPrevented).toBe(true);
    });

    it('zooms view with Ctrl+wheel and resets with Ctrl+0 or double middle-click', () => {
        mocks.visualizer = {
            setInteractionState: vi.fn(),
            invalidateRender: vi.fn(),
        };
        const { container } = render(<PreviewPanel />);
        const preview = container.querySelector('.preview-panel')!;
        const canvasContainer = container.querySelector('.canvas-container')!;
        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;

        expect(canvas.style.transform).toBe('translate(0px, 0px) scale(1)');

        vi.spyOn(canvasContainer, 'getBoundingClientRect').mockReturnValue({
            left: 100,
            top: 50,
            width: 800,
            height: 600,
            right: 900,
            bottom: 650,
            x: 100,
            y: 50,
            toJSON: () => {},
        });

        const wheelZoomOut = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            deltaY: 100,
            clientX: 500,
            clientY: 350,
        });
        act(() => {
            fireEvent(canvasContainer, wheelZoomOut);
        });
        expect(wheelZoomOut.defaultPrevented).toBe(true);
        expect(canvas.style.transform).not.toBe('translate(0px, 0px) scale(1)');
        expect(canvas.style.transform).toContain('scale(');

        fireEvent(preview, pointerEvent('pointerover', 500, 350));
        fireEvent.pointerDown(preview);
        act(() => {
            fireEvent.keyDown(window, { key: '0', ctrlKey: true });
        });
        expect(canvas.style.transform).toBe('translate(0px, 0px) scale(1)');

        const middleMouseDown = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 1,
            clientX: 200,
            clientY: 200,
        });
        act(() => {
            fireEvent(canvasContainer, middleMouseDown);
        });
        expect(middleMouseDown.defaultPrevented).toBe(true);

        const mouseMove = new MouseEvent('mousemove', { bubbles: true, clientX: 250, clientY: 280 });
        act(() => {
            window.dispatchEvent(mouseMove);
        });
        expect(canvas.style.transform).toBe('translate(50px, 80px) scale(1)');

        const mouseUp = new MouseEvent('mouseup', { bubbles: true, button: 1 });
        act(() => {
            window.dispatchEvent(mouseUp);
        });

        act(() => {
            fireEvent(
                canvasContainer,
                new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1, clientX: 200, clientY: 200 })
            );
        });
        act(() => {
            fireEvent(
                canvasContainer,
                new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1, clientX: 200, clientY: 200 })
            );
        });
        expect(canvas.style.transform).toBe('translate(0px, 0px) scale(1)');
    });

    it('uses the preview after focus leaves a field and resets pan and zoom with Command+0', () => {
        const { container } = render(<PreviewPanel />);
        const preview = container.querySelector<HTMLElement>('.preview-panel')!;
        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        act(() =>
            fireEvent(
                canvas,
                new WheelEvent('wheel', {
                    bubbles: true,
                    cancelable: true,
                    ctrlKey: true,
                    deltaY: -100,
                    clientX: 40,
                    clientY: 40,
                })
            )
        );
        act(() =>
            fireEvent(canvas, new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 20, deltaY: 10 }))
        );
        expect(canvas.style.transform).not.toBe('translate(0px, 0px) scale(1)');

        fireEvent.pointerDown(preview);
        expect(document.activeElement).toBe(preview);
        act(() => fireEvent.keyDown(window, { key: '0', code: 'Digit0', metaKey: true }));
        expect(canvas.style.transform).toBe('translate(0px, 0px) scale(1)');
        input.remove();
    });

    it('resets the preview with Shift+0 only while the preview is active', () => {
        const { container } = render(<PreviewPanel />);
        const preview = container.querySelector<HTMLElement>('.preview-panel')!;
        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;
        const otherPanel = document.createElement('div');
        otherPanel.tabIndex = 0;
        otherPanel.dataset.commandSurface = 'timeline-clips';
        document.body.appendChild(otherPanel);

        act(() =>
            fireEvent(canvas, new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 25, deltaY: 15 }))
        );
        expect(canvas.style.transform).toBe('translate(-25px, -15px) scale(1)');
        otherPanel.focus();
        act(() => fireEvent.keyDown(otherPanel, { key: ')', code: 'Digit0', shiftKey: true }));
        expect(canvas.style.transform).toBe('translate(-25px, -15px) scale(1)');

        fireEvent.pointerDown(preview);
        act(() => fireEvent.keyDown(preview, { key: ')', code: 'Digit0', shiftKey: true, ctrlKey: true }));
        expect(canvas.style.transform).toBe('translate(-25px, -15px) scale(1)');
        act(() => fireEvent.keyDown(preview, { key: ')', code: 'Digit0', shiftKey: true }));
        expect(canvas.style.transform).toBe('translate(0px, 0px) scale(1)');
        otherPanel.remove();
    });

    it('fits visible off-canvas artwork and then frames selected nodes', () => {
        mocks.selectedNodeIds = ['node-1'];
        mocks.visualizer = {
            getCurrentTime: () => 2,
            getElementBoundsAtTime: vi.fn(() => [
                { bounds: { x: 2200, y: 0, width: 400, height: 400 }, effectiveVisible: true },
                { bounds: { x: -9000, y: 0, width: 100, height: 100 }, effectiveVisible: false },
            ]),
            getNodeSelectionAtTime: vi.fn(() => ({ bounds: { x: 2200, y: 0, width: 400, height: 400 } })),
        };
        const { container } = render(<PreviewPanel />);
        const preview = container.querySelector<HTMLElement>('.preview-panel')!;
        const canvasContainer = container.querySelector<HTMLElement>('.canvas-container')!;
        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;
        Object.defineProperties(canvasContainer, { clientWidth: { value: 1000 }, clientHeight: { value: 600 } });
        act(() => window.dispatchEvent(new Event('resize')));
        fireEvent.pointerDown(preview);

        act(() => fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true }));
        expect(mocks.visualizer.getElementBoundsAtTime).toHaveBeenCalledWith(2);
        expect(canvas.style.transform).toContain('scale(');
        const fitAll = canvas.style.transform;
        act(() => fireEvent.keyDown(window, { key: '@', code: 'Digit2', shiftKey: true }));
        expect(mocks.visualizer.getNodeSelectionAtTime).toHaveBeenCalledWith(['node-1'], 2);
        expect(canvas.style.transform).not.toBe(fitAll);
    });

    it('pans the preview with two-axis trackpad scrolling', () => {
        const { container } = render(<PreviewPanel />);
        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;

        const firstScroll = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaX: 30,
            deltaY: -20,
        });
        act(() => fireEvent(canvas, firstScroll));
        expect(firstScroll.defaultPrevented).toBe(true);
        expect(canvas.style.transform).toBe('translate(-30px, 20px) scale(1)');

        const secondScroll = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaX: -10,
            deltaY: 5,
        });
        act(() => fireEvent(canvas, secondScroll));
        expect(canvas.style.transform).toBe('translate(-20px, 15px) scale(1)');
    });

    it('adds a dropped asset only once when the drop starts on the canvas', () => {
        const { container } = render(<PreviewPanel />);
        const canvas = container.querySelector<HTMLCanvasElement>('#canvas')!;
        vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
            right: 1920,
            bottom: 1080,
            x: 0,
            y: 0,
            toJSON: () => {},
        });

        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperties(drop, {
            clientX: { value: 100 },
            clientY: { value: 200 },
            dataTransfer: {
                value: { getData: (type: string) => (type === DRAG_ASSET_TYPE ? 'asset-for-drop-test' : '') },
            },
        });
        fireEvent(canvas, drop);

        expect(mocks.addElement).toHaveBeenCalledOnce();
        expect(mocks.addElement).toHaveBeenCalledWith('image', {
            imageSource: 'asset-for-drop-test',
            offsetX: 100,
            offsetY: 200,
        });
    });
});
