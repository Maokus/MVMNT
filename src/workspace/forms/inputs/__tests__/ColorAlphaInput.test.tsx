import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ColorAlphaInput from '../ColorAlphaInput';

describe('ColorAlphaInput compatibility', () => {
    it('uses the custom picker and preserves eight-digit hex output', async () => {
        const onChange = vi.fn();
        const Harness = () => {
            const [value, setValue] = useState('#FFFF0080');
            return (
                <ColorAlphaInput
                    id="alpha-color"
                    value={value}
                    schema={{ default: '#000000FF' }}
                    onChange={(next) => {
                        setValue(next);
                        onChange(next);
                    }}
                />
            );
        };

        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: /#FFFF0080/ }));
        const opacity = screen.getByRole('textbox', { name: 'Opacity percent' });
        fireEvent.change(opacity, { target: { value: '25' } });
        fireEvent.blur(opacity);

        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('#FFFF0040'));
        expect(screen.getByRole('slider', { name: 'Opacity' })).toHaveAttribute('aria-valuenow', '25');
    });
});
