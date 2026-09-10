import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { useTimelineStore } from '@state/timelineStore';
import PreviewPanel from './PreviewPanel';

const mocks = vi.hoisted(() => ({
    addElement: vi.fn(),
    canvasRef: { current: null as HTMLCanvasElement | null },
    visualizer: null as any,
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
        selectElement: vi.fn(),
        selectNode: vi.fn(),
        updateElementConfig: vi.fn(),
        incrementPropertyPanelRefresh: vi.fn(),
        addElement: mocks.addElement,
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
        mocks.visualizer = null;
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

    it('delays transient preparation but immediately shows a pending reason', () => {
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
        act(() => vi.advanceTimersByTime(150));
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

    it('hides preparation status during playback when every simulation has renderable output', () => {
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
});
