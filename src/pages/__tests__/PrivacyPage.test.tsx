import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrivacyPage } from '../PrivacyPage';

describe('PrivacyPage', () => {
    beforeEach(() => localStorage.clear());

    it('uses the home background and clearly separates collected from prohibited data', () => {
        const { container } = render(
            <MemoryRouter>
                <PrivacyPage />
            </MemoryRouter>
        );

        expect(container.querySelector('main')).toHaveClass('bg-neutral-800');
        expect(screen.getByRole('heading', { name: /what i collect/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /what i never collect/i })).toBeInTheDocument();
        expect(screen.getByText(/contact me through/i)).toBeInTheDocument();
    });
});
