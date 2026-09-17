import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ColorInput from '../ColorInput';
import type { ColorPickerGesture } from '../ColorPicker';
import { COLOR_FIELD_MODE_STORAGE_KEY, RECENT_COLORS_STORAGE_KEY } from '../colorPickerUtils';

const OriginalPointerEvent = window.PointerEvent;

beforeAll(() => {
    class TestPointerEvent extends MouseEvent {
        pointerId: number;

        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 0;
        }
    }
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
});

afterAll(() => {
    window.PointerEvent = OriginalPointerEvent;
});

interface HarnessProps {
    initial?: string;
    onChange?: (value: string, gesture?: ColorPickerGesture) => void;
}

const Harness: React.FC<HarnessProps> = ({ initial = '#FFFF00', onChange }) => {
    const [value, setValue] = useState(initial);
    return (
        <ColorInput
            id="test-color"
            value={value}
            schema={{ default: '#000000' }}
            onChange={(next, gesture) => {
                setValue(next);
                onChange?.(next, gesture);
            }}
        />
    );
};

const openPicker = () => {
    fireEvent.click(screen.getByRole('button', { name: /^#[0-9A-F]{6}$/ }));
    return screen.getByRole('group', { name: 'Saturation and brightness' });
};

afterEach(() => {
    delete (window as Window & { EyeDropper?: typeof EyeDropper }).EyeDropper;
    localStorage.removeItem(COLOR_FIELD_MODE_STORAGE_KEY);
    localStorage.removeItem(RECENT_COLORS_STORAGE_KEY);
});

describe('ColorInput', () => {
    it('keeps the selected hue after dragging to white', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const saturation = openPicker();
        vi.spyOn(saturation, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 200,
            height: 100,
            right: 200,
            bottom: 100,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        fireEvent.pointerDown(saturation, { button: 0, pointerId: 4, clientX: 0, clientY: 0 });
        fireEvent.pointerUp(saturation, { pointerId: 4, clientX: 0, clientY: 0 });
        await waitFor(() => expect(screen.getByRole('button', { name: '#FFFFFF' })).toBeInTheDocument());

        fireEvent.keyDown(saturation, { key: 'ArrowRight' });
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('#FFFFFC', undefined));
    });

    it('can set a latent hue on white with the HSV field before adding saturation', async () => {
        const onChange = vi.fn();
        render(<Harness initial="#FFFFFF" onChange={onChange} />);
        openPicker();

        const hue = screen.getByRole('textbox', { name: 'H' });
        fireEvent.change(hue, { target: { value: '240' } });
        fireEvent.blur(hue);

        expect(screen.getByRole('slider', { name: 'Hue' })).toHaveAttribute('aria-valuenow', '240');
        expect(onChange).toHaveBeenLastCalledWith('#FFFFFF', undefined);

        const saturation = screen.getByRole('textbox', { name: 'S%' });
        fireEvent.change(saturation, { target: { value: '100' } });
        fireEvent.blur(saturation);

        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('#0000FF', undefined));
    });

    it('can change latent hue on white with the hue slider keyboard', () => {
        render(<Harness initial="#FFFFFF" />);
        openPicker();
        const hue = screen.getByRole('slider', { name: 'Hue' });

        fireEvent.keyDown(hue, { key: 'ArrowRight' });

        expect(hue).toHaveAttribute('aria-valuenow', '1');
        expect(screen.getByRole('textbox', { name: 'H' })).toHaveValue('1');
    });

    it('can change latent hue on white by dragging the hue slider', () => {
        render(<Harness initial="#FFFFFF" />);
        const saturation = openPicker();
        const hue = screen.getByRole('slider', { name: 'Hue' });
        vi.spyOn(hue, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 360,
            height: 10,
            right: 360,
            bottom: 10,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        fireEvent.pointerDown(hue, { button: 0, pointerId: 7, clientX: 180, clientY: 5 });
        fireEvent.pointerUp(hue, { pointerId: 7, clientX: 180, clientY: 5 });
        fireEvent.keyDown(saturation, { key: 'ArrowRight' });

        expect(screen.getByRole('button', { name: '#FCFFFF' })).toBeInTheDocument();
    });

    it('preserves latent hue when an achromatic hex value is entered', () => {
        render(<Harness initial="#FFFF00" />);
        openPicker();
        const hex = screen.getByRole('textbox', { name: 'Hex' });

        fireEvent.change(hex, { target: { value: 'FFFFFF' } });
        fireEvent.blur(hex);

        expect(screen.getByRole('textbox', { name: 'H' })).toHaveValue('60');
    });

    it('remembers the RGB field mode across picker instances', () => {
        const first = render(<Harness />);
        openPicker();
        fireEvent.click(screen.getByRole('button', { name: 'RGB' }));
        expect(screen.getByRole('textbox', { name: 'R' })).toBeInTheDocument();
        expect(localStorage.getItem(COLOR_FIELD_MODE_STORAGE_KEY)).toBe('rgb');

        first.unmount();
        render(<Harness />);
        openPicker();
        expect(screen.getByRole('textbox', { name: 'R' })).toBeInTheDocument();
    });

    it('uses one merge session for a continuous pointer drag', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const saturation = openPicker();
        vi.spyOn(saturation, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            right: 100,
            bottom: 100,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        fireEvent.pointerDown(saturation, { button: 0, pointerId: 9, clientX: 20, clientY: 20 });
        fireEvent.pointerMove(saturation, { pointerId: 9, clientX: 40, clientY: 30 });
        fireEvent.pointerUp(saturation, { pointerId: 9, clientX: 40, clientY: 30 });

        const gestures = onChange.mock.calls.map((call) => call[1]).filter(Boolean) as ColorPickerGesture[];
        expect(gestures).toHaveLength(3);
        expect(new Set(gestures.map((gesture) => gesture.id)).size).toBe(1);
        expect(gestures.map((gesture) => gesture.finalize)).toEqual([false, false, true]);
    });

    it('samples a screen color when the EyeDropper API is available', async () => {
        const open = vi.fn().mockResolvedValue({ sRGBHex: '#12ab34' });
        (window as Window & { EyeDropper?: typeof EyeDropper }).EyeDropper = class {
            open = open;
        } as unknown as typeof EyeDropper;
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        openPicker();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Pick color from screen' }));
        });

        expect(open).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenLastCalledWith('#12AB34', undefined);
    });

    it('treats eyedropper cancellation as a no-op and hides the action when unsupported', async () => {
        const abortError = new DOMException('Cancelled', 'AbortError');
        const open = vi.fn().mockRejectedValue(abortError);
        (window as Window & { EyeDropper?: typeof EyeDropper }).EyeDropper = class {
            open = open;
        } as unknown as typeof EyeDropper;
        const onChange = vi.fn();
        const { unmount } = render(<Harness onChange={onChange} />);
        openPicker();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Pick color from screen' }));
        });
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        unmount();
        delete (window as Window & { EyeDropper?: typeof EyeDropper }).EyeDropper;
        render(<Harness />);
        openPicker();
        expect(screen.queryByRole('button', { name: 'Pick color from screen' })).not.toBeInTheDocument();
    });

    it('reports an unexpected eyedropper failure and allows retrying', async () => {
        const open = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
        (window as Window & { EyeDropper?: typeof EyeDropper }).EyeDropper = class {
            open = open;
        } as unknown as typeof EyeDropper;
        render(<Harness />);
        openPicker();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Pick color from screen' }));
        });

        expect(screen.getByRole('alert')).toHaveTextContent('Could not sample a screen color.');
        expect(screen.getByRole('button', { name: 'Pick color from screen' })).toBeEnabled();
    });
});
