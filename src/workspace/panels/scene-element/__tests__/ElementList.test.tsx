import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ElementList from '../ElementList';

const elements = [
    { id: 'first', type: 'first', visible: true },
    { id: 'second', type: 'second', visible: true },
    { id: 'third', type: 'third', visible: true },
];

const pointerEvent = (type: string, clientY: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        button: { value: 0 },
        clientY: { value: clientY },
        pointerId: { value: 1 },
    });
    return event;
};

describe('ElementList', () => {
    it('reorders an element dropped over another list item', () => {
        const onMoveElement = vi.fn();
        const { container } = render(
            <ElementList
                elements={elements}
                selectedElementId={null}
                onElementSelect={vi.fn()}
                onToggleVisibility={vi.fn()}
                onMoveElement={onMoveElement}
                onDuplicateElement={vi.fn()}
                onDeleteElement={vi.fn()}
                onUpdateElementId={vi.fn(() => true)}
            />
        );

        const items = Array.from(container.querySelectorAll('[draggable="false"]')) as HTMLDivElement[];
        items.forEach((item, index) => {
            vi.spyOn(item.parentElement as HTMLDivElement, 'getBoundingClientRect').mockReturnValue({
                top: index * 20,
                bottom: (index + 1) * 20,
                left: 0,
                right: 200,
                width: 200,
                height: 20,
                x: 0,
                y: index * 20,
                toJSON: () => ({}),
            });
        });

        (HTMLElement.prototype as any).setPointerCapture = vi.fn();
        (HTMLElement.prototype as any).hasPointerCapture = vi.fn(() => true);
        (HTMLElement.prototype as any).releasePointerCapture = vi.fn();
        fireEvent(items[0], pointerEvent('pointerdown', 10));
        fireEvent(items[0], pointerEvent('pointermove', 35));
        fireEvent(items[0], pointerEvent('pointerup', 35));

        expect(onMoveElement).toHaveBeenCalledWith('first', 1);
    });
});
