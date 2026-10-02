import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StretchyWord } from '../StretchyWord';

const dispatchPointer = (element: Element, type: string, x = 0, y = 0) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    fireEvent(element, event);
};

describe('StretchyWord', () => {
    it('pulls the grabbed letter and its neighbors, then springs back on release', () => {
        render(<StretchyWord />);

        const word = screen.getByText('flexible').parentElement!;
        const letters = word.querySelectorAll<HTMLElement>('[data-letter-index]');
        expect(letters).toHaveLength(8);

        dispatchPointer(letters[3], 'pointerdown', 100, 100);
        dispatchPointer(word, 'pointermove', 140, 120);

        expect(word).toHaveClass('is-dragging');
        expect(letters[3].style.transform).toBe('translate3d(40px, 20px, 0)');
        expect(letters[2].style.transform).not.toBe('translate3d(0px, 0px, 0)');
        expect(letters[2].style.transform).not.toBe(letters[3].style.transform);

        dispatchPointer(word, 'pointerup');
        expect(word).not.toHaveClass('is-dragging');
        expect(letters[3].style.transform).toBe('translate3d(0px, 0px, 0)');
    });
});
