import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InsertKeyframePopup from '../InsertKeyframePopup';

describe('InsertKeyframePopup', () => {
    afterEach(cleanup);

    it('lists the selected node transforms and grouped transform shortcuts', () => {
        render(<InsertKeyframePopup position={{ x: 20, y: 20 }} nodeId="node:one" onClose={vi.fn()} />);

        expect(screen.getByText('All Transforms')).toBeInTheDocument();
        expect(screen.getByText('Translation')).toBeInTheDocument();
        expect(screen.getByText('Pivot')).toBeInTheDocument();
        expect(screen.getByText('X Translation')).toBeInTheDocument();
        expect(screen.getByText('Y Translation')).toBeInTheDocument();
        expect(screen.getByText('Rotation')).toBeInTheDocument();
        expect(screen.getByText('Scale X')).toBeInTheDocument();
        expect(screen.getByText('Scale Y')).toBeInTheDocument();
        expect(screen.getAllByText('Node · Position')).toHaveLength(2);
        expect(screen.getByText('X Translation').closest('button')).toHaveTextContent('x');
        expect(screen.getByText('Rotation').closest('button')).toHaveTextContent('r');
    });

    it.each([
        ['x', 'X Translation'],
        ['y', 'Y Translation'],
        ['r', 'Rotation'],
        ['s', 'Scale X'],
        ['px', 'Pivot X'],
        ['py', 'Pivot Y'],
    ])('promotes the %s shorthand to %s', (shorthand, label) => {
        render(<InsertKeyframePopup position={{ x: 20, y: 20 }} nodeId="node:one" onClose={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('Search property…'), { target: { value: shorthand } });

        const firstResult = screen.getAllByRole('button')[0];
        expect(within(firstResult).getByText(label)).toBeInTheDocument();
    });
});
