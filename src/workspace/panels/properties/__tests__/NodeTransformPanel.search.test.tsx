import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlatSceneGraph } from '@state/scene-graph';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { NodeTransformPanel } from '../NodeTransformPanel';
import { dispatchSceneCommand, registerSceneCommandListener } from '@state/scene';
import type { SceneCommandTelemetryEvent } from '@state/scene/sceneTelemetry';

const selectionContext = vi.hoisted(() => ({
    visualizer: {
        getCurrentTime: () => 0,
        getNodeSelectionAtTime: () => ({
            records: [],
            bounds: { x: 10, y: 20, width: 300, height: 200 },
            hull: [],
            pivot: { x: 160, y: 120 },
        }),
    },
}));

vi.mock('@context/SceneSelectionContext', () => ({
    useSceneSelection: () => selectionContext,
}));

vi.mock('@workspace/forms/inputs/FontInput', () => ({
    default: () => <input aria-label="Font" />,
}));

describe('NodeTransformPanel multi-selection property search', () => {
    beforeEach(() => {
        useSceneStore.getState().replaceMacros(null);
        const graph = createFlatSceneGraph(['one', 'two']);
        useSceneStore.setState({ graph, elements: {} });
        useSelectionStore.setState({
            selectedNodeIds: ['element:one', 'element:two'],
            selectionPivot: null,
        });
        useSceneEditorStore.setState({ expandedPropertyGroups: {} });
    });

    afterEach(cleanup);

    it('filters aggregate property rows and restores them when cleared', () => {
        render(<NodeTransformPanel />);

        const search = screen.getByRole('searchbox', { name: 'Search selected properties' });
        expect(screen.getByText('Width')).toBeInTheDocument();
        expect(screen.getByText('Height')).toBeInTheDocument();
        expect(screen.getByText('Node State')).toBeInTheDocument();
        expect(screen.getByText('Effects')).toBeInTheDocument();
        expect(screen.getByText('Element Blend Mode')).toBeInTheDocument();

        fireEvent.change(search, { target: { value: 'width' } });

        expect(screen.getByText('Width')).toBeInTheDocument();
        expect(screen.queryByText('Height')).not.toBeInTheDocument();
        expect(screen.queryByText('Node State')).not.toBeInTheDocument();
        expect(screen.queryByText('Effects')).not.toBeInTheDocument();
        expect(screen.queryByText('Rotation & Scale')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Clear property search' }));

        expect(search).toHaveValue('');
        expect(screen.getByText('Height')).toBeInTheDocument();
        expect(screen.getByText('Node State')).toBeInTheDocument();
        expect(screen.getByText('Effects')).toBeInTheDocument();
    });

    it('creates one macro for a common property across the selected elements', () => {
        useSceneStore.getState().clearScene();
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'first',
            config: { opacity: 0.4 },
        });
        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'second',
            config: { opacity: 0.8 },
        });
        const state = useSceneStore.getState();
        useSelectionStore.setState({
            selectedNodeIds: [state.nodeIdByElementId.first, state.nodeIdByElementId.second],
            selectionPivot: null,
        });

        render(<NodeTransformPanel />);
        const events: SceneCommandTelemetryEvent[] = [];
        const unsubscribe = registerSceneCommandListener((event) => events.push(event));
        fireEvent.click(screen.getByRole('button', { name: 'opacity macro' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Assign to New Macro' }));
        unsubscribe();

        const result = useSceneStore.getState();
        expect(result.macros.allIds).toEqual(['Opacity']);
        expect(result.macros.byId.Opacity.value).toBe(0.4);
        expect(result.bindings.byElement.first.opacity).toEqual({ type: 'macro', macroId: 'Opacity' });
        expect(result.bindings.byElement.second.opacity).toEqual({ type: 'macro', macroId: 'Opacity' });
        expect(events).toHaveLength(1);
        expect(events[0].source).toBe('NodeTransformPanel.createMacro');
        expect(events[0].patch?.undo).toHaveLength(1);
        dispatchSceneCommand(events[0].patch!.undo[0]);
        expect(useSceneStore.getState().macros.byId.Opacity).toBeUndefined();
        expect(useSceneStore.getState().bindings.byElement.first.opacity?.type).not.toBe('macro');
        expect(useSceneStore.getState().bindings.byElement.second.opacity?.type).not.toBe('macro');
    });

    it('creates and assigns a host transform macro through the extracted control', () => {
        useSelectionStore.setState({ selectedNodeIds: ['element:one'], selectionPivot: null });
        render(<NodeTransformPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'translationX macro' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Assign to New Macro' }));

        const state = useSceneStore.getState();
        expect(state.macros.allIds).toHaveLength(1);
        const macroId = state.macros.allIds[0];
        expect(state.macros.byId[macroId].type).toBe('number');
        expect(state.nodeBindings['element:one'].translationX).toEqual({ type: 'macro', macroId });
    });

    it('assigns an existing macro to every selected element', () => {
        useSceneStore.getState().clearScene();
        for (const elementId of ['first', 'second']) {
            dispatchSceneCommand({ type: 'addElement', elementType: 'textOverlay', elementId });
        }
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'SharedOpacity',
            definition: { type: 'number', value: 0.5 },
        });
        const state = useSceneStore.getState();
        useSelectionStore.setState({
            selectedNodeIds: [state.nodeIdByElementId.first, state.nodeIdByElementId.second],
            selectionPivot: null,
        });

        render(<NodeTransformPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'opacity macro' }));
        fireEvent.click(screen.getByRole('button', { name: 'SharedOpacity' }));

        expect(useSceneStore.getState().bindings.byElement.first.opacity).toEqual({
            type: 'macro',
            macroId: 'SharedOpacity',
        });
        expect(useSceneStore.getState().bindings.byElement.second.opacity).toEqual({
            type: 'macro',
            macroId: 'SharedOpacity',
        });
    });

    it('filters host properties for a single selected element', () => {
        useSelectionStore.setState({
            selectedNodeIds: ['element:one'],
            selectionPivot: null,
        });

        render(<NodeTransformPanel searchTerm="opacity" />);

        expect(screen.getByText('Node State')).toBeInTheDocument();
        expect(screen.getByText('Opacity')).toBeInTheDocument();
        expect(screen.queryByText('Visible')).not.toBeInTheDocument();
        expect(screen.queryByText('Position')).not.toBeInTheDocument();
        expect(screen.queryByText('Effects')).not.toBeInTheDocument();
    });

    it('Meta-clicks a Host group to contract and expand every Host group', () => {
        useSelectionStore.setState({ selectedNodeIds: ['element:one'], selectionPivot: null });
        render(<NodeTransformPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Collapse Position group' }), { metaKey: true });
        expect(screen.getByRole('button', { name: 'Expand Position group' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('button', { name: 'Expand Node State group' })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
        expect(screen.queryByText('Opacity')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Expand Node State group' }), { metaKey: true });
        expect(screen.getByRole('button', { name: 'Collapse Position group' })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
        expect(screen.getByText('Opacity')).toBeInTheDocument();
    });

    it('Ctrl-clicks a Host group to contract and expand every Host group', () => {
        useSelectionStore.setState({ selectedNodeIds: ['element:one'], selectionPivot: null });
        render(<NodeTransformPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Collapse Position group' }), { ctrlKey: true });
        expect(screen.getByRole('button', { name: 'Expand Node State group' })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Expand Node State group' }), { ctrlKey: true });
        expect(screen.getByRole('button', { name: 'Collapse Position group' })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
    });
});
