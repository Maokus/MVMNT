import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColorResult } from '@uiw/color-convert';
import Chrome from '@uiw/react-color-chrome';
import { GithubPlacement } from '@uiw/react-color-github';

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

interface ColorInputProps {
    id: string;
    value: unknown;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const DEFAULT_COLOR = '#000000';

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

const ColorInput: React.FC<ColorInputProps> = ({ id, value, schema, disabled = false, title, onChange }) => {
    const schemaDefault = useMemo(() => normalizeColor(schema?.default, DEFAULT_COLOR), [schema?.default]);
    const [currentColor, setCurrentColor] = useState<string>(() => normalizeColor(value, schemaDefault));
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        setCurrentColor(normalizeColor(value, schemaDefault));
    }, [value, schemaDefault]);

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
        (nextColor: ColorResult) => {
            const hex = typeof nextColor?.hex === 'string' && nextColor.hex ? nextColor.hex.toUpperCase() : DEFAULT_COLOR;
            setCurrentColor(hex);
            onChange(hex);
        },
        [onChange],
    );

    const displayLabel = useMemo(() => {
        if (typeof currentColor !== 'string') return '';
        return currentColor.startsWith('#') ? currentColor.toUpperCase() : currentColor;
    }, [currentColor]);

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
                title={title}
                {...getReferenceProps()}
            >
                <span className="color-input-trigger__swatch" aria-hidden style={{ backgroundColor: currentColor }} />
                <span className="color-input-trigger__label">{displayLabel}</span>
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
                        <Chrome color={currentColor} showAlpha={false} onChange={handleColorChange} placement={GithubPlacement.Bottom} />
                    </div>
                </FloatingPortal>
            )}
        </div>
    );
};

export default ColorInput;
