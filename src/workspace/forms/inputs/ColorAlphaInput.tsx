import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    useClick,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';

import { ColorPicker, type ColorPickerGesture } from './ColorPicker';
import { colorToHsva, hsvaToHex, preserveAchromaticHue, type HsvaColor } from './colorPickerUtils';
import { normalizeColor } from './ColorInput';

interface ColorAlphaInputProps {
    id: string;
    value: unknown;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string, gesture?: ColorPickerGesture) => void;
}

const DEFAULT_COLOR = '#000000FF';

const ColorAlphaInput: React.FC<ColorAlphaInputProps> = ({ id, value, schema, disabled = false, title, onChange }) => {
    const schemaDefault = useMemo(() => normalizeColor(schema?.default, DEFAULT_COLOR), [schema?.default]);
    const defaultColor = useMemo(() => colorToHsva(schemaDefault), [schemaDefault]);
    const [pickerColor, setPickerColor] = useState<HsvaColor>(() =>
        colorToHsva(normalizeColor(value, schemaDefault), defaultColor)
    );
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const next = colorToHsva(normalizeColor(value, schemaDefault), defaultColor);
        setPickerColor((current) => preserveAchromaticHue(current, next));
    }, [defaultColor, schemaDefault, value]);

    useEffect(() => {
        if (disabled && isOpen) setIsOpen(false);
    }, [disabled, isOpen]);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: (nextOpen) => {
            if (!disabled) setIsOpen(nextOpen);
        },
        placement: 'bottom-start',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift({ padding: 8 })],
    });

    const click = useClick(context, { event: 'click', toggle: true, enabled: !disabled });
    const dismiss = useDismiss(context, { outsidePressEvent: 'pointerdown' });
    const role = useRole(context, { role: 'dialog' });
    const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

    const handleColorChange = useCallback(
        (nextColor: HsvaColor, gesture?: ColorPickerGesture) => {
            setPickerColor(nextColor);
            onChange(hsvaToHex(nextColor, true), gesture);
        },
        [onChange]
    );

    const currentColor = hsvaToHex(pickerColor, true);
    const opacity = Math.round(pickerColor.a * 100);

    return (
        <div className="color-input-wrapper" data-preserve-selection="true">
            <button
                type="button"
                id={id}
                ref={refs.setReference}
                className={`color-input-trigger${disabled ? ' color-input-trigger--disabled' : ''}`}
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                title={title ?? `${currentColor} (${opacity}% opacity)`}
                {...getReferenceProps()}
            >
                <span className="color-input-trigger__swatch" aria-hidden style={{ backgroundColor: currentColor }} />
                <span className="color-input-trigger__label">
                    {currentColor} ({opacity}%)
                </span>
            </button>

            {!disabled && isOpen && (
                <FloatingPortal>
                    <div
                        ref={refs.setFloating}
                        style={floatingStyles}
                        className="color-input-popover"
                        data-preserve-selection="true"
                        {...getFloatingProps()}
                    >
                        <ColorPicker color={pickerColor} includeAlpha onChange={handleColorChange} />
                    </div>
                </FloatingPortal>
            )}
        </div>
    );
};

export default ColorAlphaInput;
