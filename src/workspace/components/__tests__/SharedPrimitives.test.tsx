import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PopupCard } from '../PopupCard';
import { LoadingSpinner } from '../LoadingSpinner';
import { ProgressBar } from '../ProgressBar';

describe('shared workspace primitives', () => {
    it('renders popup card title and children', () => {
        render(
            <PopupCard title="Card title">
                <span>body</span>
            </PopupCard>
        );
        expect(screen.getByText('Card title')).toBeTruthy();
        expect(screen.getByText('body')).toBeTruthy();
    });

    it('clamps progress values to 0-100', () => {
        const { rerender } = render(<ProgressBar value={150} label="Export progress" />);
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
        rerender(<ProgressBar value={-20} label="Export progress" />);
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    });

    it('renders spinner with requested size', () => {
        const { container } = render(<LoadingSpinner size={48} />);
        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper.style.width).toBe('48px');
    });
});
