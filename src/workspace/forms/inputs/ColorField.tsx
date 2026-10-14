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

export interface ColorFieldProps {
    id: string;
    value: unknown;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string, gesture?: ColorPickerGesture) => void;
    includeAlpha?: boolean;
}

const DEFAULT_OPAQUE_COLOR = '#000000';
const DEFAULT_ALPHA_COLOR = '#000000FF';

export const normalizeColor = (candidate: unknown, fallback: string): string => {
    if (typeof candidate !== 'string') return fallback;

    const trimmed = candidate.trim();
    if (!trimmed) return fallback;

    const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    if (hexPattern.test(prefixed)) return prefixed.toUpperCase();

    // Fallback for other valid CSS color strings (e.g., rgb). Let the browser decide.
    if (typeof window !== 'undefined' && window.CSS && window.CSS.supports?.('color', trimmed)) {
        return trimmed;
    }

    return fallback;
};

export const ColorField: React.FC<ColorFieldProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange,
    includeAlpha = false,
}) => {
    const fallbackHex = includeAlpha ? DEFAULT_ALPHA_COLOR : DEFAULT_OPAQUE_COLOR;
    const schemaDefault = useMemo(() => normalizeColor(schema?.default, fallbackHex), [schema?.default, fallbackHex]);
    const defaultColor = useMemo(() => colorToHsva(schemaDefault), [schemaDefault]);
    const toPickerColor = useCallback(
        (candidate: unknown): HsvaColor => {
            const hsva = colorToHsva(normalizeColor(candidate, schemaDefault), defaultColor);
            return includeAlpha ? hsva : { ...hsva, a: 1 };
        },
        [defaultColor, includeAlpha, schemaDefault]
    );
    const [pickerColor, setPickerColor] = useState<HsvaColor>(() => toPickerColor(value));
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        setPickerColor((current) => preserveAchromaticHue(current, toPickerColor(value)));
    }, [toPickerColor, value]);

    useEffect(() => {
        if (disabled && isOpen) {
            setIsOpen(false);
        }
    }, [disabled, isOpen]);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: (nextOpen) => {
            if (disabled) return;
            setIsOpen(nextOpen);
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
            const output = includeAlpha ? nextColor : { ...nextColor, a: 1 };
            setPickerColor(output);
            onChange(includeAlpha ? hsvaToHex(output, true) : hsvaToHex(output), gesture);
        },
        [includeAlpha, onChange]
    );

    const currentColor = includeAlpha ? hsvaToHex(pickerColor, true) : hsvaToHex(pickerColor);
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
                title={title ?? (includeAlpha ? `${currentColor} (${opacity}% opacity)` : undefined)}
                {...getReferenceProps()}
            >
                <span className="color-input-trigger__swatch" aria-hidden style={{ backgroundColor: currentColor }} />
                <span className="color-input-trigger__label">
                    {includeAlpha ? (
                        <>
                            {currentColor} ({opacity}%)
                        </>
                    ) : (
                        currentColor
                    )}
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
                        <ColorPicker color={pickerColor} includeAlpha={includeAlpha} onChange={handleColorChange} />
                    </div>
                </FloatingPortal>
            )}
        </div>
    );
};
