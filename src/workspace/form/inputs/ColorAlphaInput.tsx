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

import { normalizeColor } from './ColorInput';

interface ColorAlphaInputProps {
    id: string;
    value: unknown;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const DEFAULT_COLOR = '#000000FF';

const HEX_8_PATTERN = /^#[0-9A-F]{8}$/i;
const HEX_6_PATTERN = /^#[0-9A-F]{6}$/i;
const HEX_4_PATTERN = /^#[0-9A-F]{4}$/i;
const HEX_3_PATTERN = /^#[0-9A-F]{3}$/i;
const RGBA_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i;

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

const expandShortHex = (hex: string): string => {
    if (hex.length === 3) {
        return hex
            .split('')
            .map((char) => char + char)
            .join('');
    }

    if (hex.length === 4) {
        const [r, g, b, a] = hex.split('');
        return `${r}${r}${g}${g}${b}${b}${a}${a}`;
    }

    return hex;
};

const toEightDigitHex = (candidate: string, fallback: string = DEFAULT_COLOR): string => {
    if (typeof candidate !== 'string') return fallback;

    const trimmed = candidate.trim();
    if (!trimmed) return fallback;

    if (trimmed.toLowerCase() === 'transparent') {
        return '#00000000';
    }

    if (HEX_8_PATTERN.test(trimmed)) {
        return trimmed.toUpperCase();
    }

    if (HEX_6_PATTERN.test(trimmed)) {
        return `${trimmed.toUpperCase()}FF`;
    }

    if (HEX_4_PATTERN.test(trimmed) || HEX_3_PATTERN.test(trimmed)) {
        const expanded = expandShortHex(trimmed.replace(/^#/, ''));
        return `#${(expanded.length === 8 ? expanded : `${expanded}FF`).toUpperCase()}`;
    }

    const rgbaMatch = trimmed.match(RGBA_PATTERN);
    if (rgbaMatch) {
        const r = clampByte(parseFloat(rgbaMatch[1]));
        const g = clampByte(parseFloat(rgbaMatch[2]));
        const b = clampByte(parseFloat(rgbaMatch[3]));
        const alphaRaw = rgbaMatch[4];
        const a = (() => {
            if (alphaRaw === undefined) return 255;
            const alphaNumber = parseFloat(alphaRaw);
            if (!Number.isFinite(alphaNumber)) return 255;
            if (alphaNumber <= 1) {
                return clampByte(Math.round(alphaNumber * 255));
            }
            return clampByte(alphaNumber);
        })();

        const toHex = (component: number) => component.toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
    }

    return fallback;
};

const colorResultToHexa = (result: ColorResult, fallback: string = DEFAULT_COLOR): string => {
    const directHexa = typeof result?.hexa === 'string' ? result.hexa : null;
    if (directHexa && HEX_8_PATTERN.test(directHexa)) {
        return directHexa.toUpperCase();
    }

    const { rgba } = result || {};
    if (rgba && typeof rgba.r === 'number' && typeof rgba.g === 'number' && typeof rgba.b === 'number') {
        const r = clampByte(rgba.r);
        const g = clampByte(rgba.g);
        const b = clampByte(rgba.b);
        const alpha = typeof rgba.a === 'number' ? clampByte(rgba.a <= 1 ? Math.round(rgba.a * 255) : rgba.a) : 255;
        const toHex = (component: number) => component.toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(alpha)}`;
    }

    const directHex = typeof result?.hex === 'string' ? result.hex : null;
    if (directHex) {
        const prefixed = directHex.startsWith('#') ? directHex : `#${directHex}`;
        return toEightDigitHex(prefixed, fallback);
    }

    return fallback;
};

const describeAlpha = (color: string): string => {
    if (HEX_8_PATTERN.test(color)) {
        const alphaByte = parseInt(color.slice(7, 9), 16);
        const alphaPercent = Math.round((alphaByte / 255) * 100);
        return `${color.toUpperCase()} (${alphaPercent}% opacity)`;
    }

    if (HEX_6_PATTERN.test(color)) {
        return `${color.toUpperCase()} (100% opacity)`;
    }

    return color.toUpperCase();
};

const ColorAlphaInput: React.FC<ColorAlphaInputProps> = ({ id, value, schema, disabled = false, title, onChange }) => {
    const schemaDefault = useMemo(() => {
        const normalized = normalizeColor(schema?.default, DEFAULT_COLOR);
        return toEightDigitHex(normalized, DEFAULT_COLOR);
    }, [schema?.default]);

    const [currentColor, setCurrentColor] = useState<string>(() => {
        const normalized = normalizeColor(value, schemaDefault);
        return toEightDigitHex(normalized, schemaDefault);
    });
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const normalized = normalizeColor(value, schemaDefault);
        setCurrentColor(toEightDigitHex(normalized, schemaDefault));
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
            const hexWithAlpha = colorResultToHexa(nextColor, schemaDefault);
            setCurrentColor(hexWithAlpha);
            onChange(hexWithAlpha);
        },
        [onChange, schemaDefault],
    );

    const displayLabel = useMemo(() => describeAlpha(currentColor), [currentColor]);

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
                title={title ?? displayLabel}
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
                        <Chrome color={currentColor} showAlpha={true} onChange={handleColorChange} placement={GithubPlacement.Bottom} />
                    </div>
                </FloatingPortal>
            )}
        </div>
    );
};

export default ColorAlphaInput;
