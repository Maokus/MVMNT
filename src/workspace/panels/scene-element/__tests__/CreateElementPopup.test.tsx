import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sceneElementRegistry } from '@core/scene/registry';
import CreateElementPopup from '../CreateElementPopup';

describe('CreateElementPopup', () => {
    afterEach(cleanup);

    it('lists registry elements with their category and description and filters all metadata', () => {
        render(<CreateElementPopup position={{ x: 20, y: 20 }} onAddElement={vi.fn()} onClose={vi.fn()} />);

        expect(screen.getByText('Basic Shapes')).toBeInTheDocument();
        expect(screen.getByText('Misc · Flexible rectangles, circles, polygons, and lines')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('Search elements…'), { target: { value: 'basicShapes' } });
        expect(screen.getByText('Basic Shapes')).toBeInTheDocument();
        expect(screen.queryByText('Background')).not.toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('Search elements…'), { target: { value: 'not-an-element' } });
        expect(screen.getByText('No matching elements')).toBeInTheDocument();
    });

    it('supports keyboard navigation and selection', () => {
        const onAddElement = vi.fn();
        const onClose = vi.fn();
        const sortedTypes = sceneElementRegistry
            .getElementTypeInfo()
            .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
        render(<CreateElementPopup position={{ x: 20, y: 20 }} onAddElement={onAddElement} onClose={onClose} />);

        const search = screen.getByPlaceholderText('Search elements…');
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        fireEvent.keyDown(search, { key: 'Enter' });

        expect(onAddElement).toHaveBeenCalledWith(sortedTypes[1].type);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('supports mouse selection, Escape, and outside dismissal', () => {
        const onAddElement = vi.fn();
        const onClose = vi.fn();
        render(<CreateElementPopup position={{ x: 20, y: 20 }} onAddElement={onAddElement} onClose={onClose} />);

        fireEvent.click(screen.getByText('Basic Shapes').closest('button')!);
        expect(onAddElement).toHaveBeenCalledWith('basicShapes');
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(screen.getByPlaceholderText('Search elements…'), { key: 'Escape' });
        fireEvent.mouseDown(screen.getByTestId('create-element-backdrop'));
        expect(onClose).toHaveBeenCalledTimes(3);
        expect(
            within(screen.getByRole('dialog', { name: 'Add Element' })).getByText('Add Element')
        ).toBeInTheDocument();
    });
});
