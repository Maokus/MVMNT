import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders children and defaults to button type', () => {
        render(<Button>Save</Button>);
        const button = screen.getByRole('button', { name: 'Save' });
        expect(button).toHaveProperty('type', 'button');
    });

    it('forwards disabled and onClick', () => {
        const onClick = vi.fn();
        render(
            <Button disabled onClick={onClick}>
                Off
            </Button>
        );
        const button = screen.getByRole('button', { name: 'Off' });
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });
});
