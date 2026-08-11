import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlatSceneGraph } from '@state/scene-graph';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { NodeTransformPanel } from '../NodeTransformPanel';

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

describe('NodeTransformPanel multi-selection property search', () => {
    beforeEach(() => {
        const graph = createFlatSceneGraph(['one', 'two']);
        useSceneStore.setState({ graph, elements: {} });
        useSelectionStore.setState({
            selectedNodeIds: ['element:one', 'element:two'],
            selectionPivot: null,
        });
    });

    afterEach(cleanup);

    it('filters aggregate property rows and restores them when cleared', () => {
        render(<NodeTransformPanel />);

        const search = screen.getByRole('searchbox', { name: 'Search selected properties' });
        expect(screen.getByText('Width')).toBeInTheDocument();
        expect(screen.getByText('Height')).toBeInTheDocument();
        expect(screen.getByText('Node State')).toBeInTheDocument();

        fireEvent.change(search, { target: { value: 'width' } });

        expect(screen.getByText('Width')).toBeInTheDocument();
        expect(screen.queryByText('Height')).not.toBeInTheDocument();
        expect(screen.queryByText('Node State')).not.toBeInTheDocument();
        expect(screen.queryByText('Rotation & Scale')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Clear property search' }));

        expect(search).toHaveValue('');
        expect(screen.getByText('Height')).toBeInTheDocument();
        expect(screen.getByText('Node State')).toBeInTheDocument();
    });
});
