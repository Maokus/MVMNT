import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import PreviewPanel from './PreviewPanel';

const mocks = vi.hoisted(() => ({
    addElement: vi.fn(),
    canvasRef: { current: null as HTMLCanvasElement | null },
}));

vi.mock('@context/VisualizerContext', () => ({
    useVisualizer: () => ({
        canvasRef: mocks.canvasRef,
        exportSettings: { width: 1920, height: 1080 },
        visualizer: null,
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
        globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
        cleanup();
        resetGlobalShortcutsForTest();
    });

    it('opens Shift+A only under the preview pointer and creates the chosen element', () => {
        const { container } = render(<PreviewPanel />);
        const preview = container.querySelector('.preview-panel')!;

        fireEvent.keyDown(preview, { key: 'A', shiftKey: true });
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();

        fireEvent(preview, pointerEvent('pointerover', 123, 234));

        const input = document.createElement('input');
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: 'A', shiftKey: true });
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();
        input.remove();

        fireEvent.keyDown(preview, { key: 'A', shiftKey: true, ctrlKey: true });
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();

        fireEvent.keyDown(preview, { key: 'A', shiftKey: true });
        const dialog = screen.getByRole('dialog', { name: 'Add Element' });
        expect(dialog).toHaveStyle({ left: '123px', top: '234px' });

        fireEvent.click(screen.getByText('Basic Shapes').closest('button')!);
        expect(mocks.addElement).toHaveBeenCalledOnce();
        expect(mocks.addElement).toHaveBeenCalledWith('basicShapes');
        expect(screen.queryByRole('dialog', { name: 'Add Element' })).not.toBeInTheDocument();
    });
});
