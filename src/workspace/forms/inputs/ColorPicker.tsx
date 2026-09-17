import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaEyeDropper } from 'react-icons/fa';

import {
    alphaFromPoint,
    clamp,
    colorToHsva,
    hsvaToHex,
    hsvaToRgba,
    hueFromPoint,
    normalizeHue,
    preserveAchromaticHue,
    rgbaToHsva,
    saturationValueFromPoint,
    type HsvaColor,
} from './colorPickerUtils';

export interface ColorPickerGesture {
    id: string;
    finalize: boolean;
}

interface ColorPickerProps {
    color: HsvaColor;
    includeAlpha?: boolean;
    onChange: (color: HsvaColor, gesture?: ColorPickerGesture) => void;
}

type DragKind = 'saturation' | 'hue' | 'alpha';

interface DragState {
    pointerId: number;
    kind: DragKind;
    id: string;
    latest: HsvaColor;
    changed: boolean;
}

interface InputDrafts {
    hex: string;
    r: string;
    g: string;
    b: string;
    a: string;
}

const PRESET_COLORS = [
    '#D0021B',
    '#F5A623',
    '#F8E61B',
    '#8B572A',
    '#7ED321',
    '#417505',
    '#BD10E0',
    '#9013FE',
    '#4A90E2',
    '#50E3C2',
    '#B8E986',
    '#000000',
    '#4A4A4A',
    '#9B9B9B',
    '#FFFFFF',
] as const;

const colorDrafts = (color: HsvaColor): InputDrafts => {
    const rgba = hsvaToRgba(color);
    return {
        hex: hsvaToHex(color).slice(1),
        r: String(rgba.r),
        g: String(rgba.g),
        b: String(rgba.b),
        a: String(Math.round(color.a * 100)),
    };
};

const isSameColor = (first: HsvaColor, second: HsvaColor, includeAlpha: boolean): boolean =>
    hsvaToHex(first, includeAlpha) === hsvaToHex(second, includeAlpha);

const createSessionId = (): string => `color-drag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, includeAlpha = false, onChange }) => {
    const [drafts, setDrafts] = useState<InputDrafts>(() => colorDrafts(color));
    const [eyeDropperPending, setEyeDropperPending] = useState(false);
    const [eyeDropperError, setEyeDropperError] = useState<string | null>(null);
    const latestColorRef = useRef(color);
    const onChangeRef = useRef(onChange);
    const dragRef = useRef<DragState | null>(null);
    const eyeDropperAbortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const skipBlurCommitRef = useRef(false);

    latestColorRef.current = color;
    onChangeRef.current = onChange;

    useEffect(() => {
        setDrafts(colorDrafts(color));
    }, [color]);

    const emit = useCallback(
        (candidate: HsvaColor, gesture?: ColorPickerGesture) => {
            const next = preserveAchromaticHue(latestColorRef.current, {
                h: normalizeHue(candidate.h),
                s: clamp(candidate.s, 0, 100),
                v: clamp(candidate.v, 0, 100),
                a: includeAlpha ? clamp(candidate.a, 0, 1) : 1,
            });
            latestColorRef.current = next;
            onChangeRef.current(next, gesture);
            return next;
        },
        [includeAlpha]
    );

    const finalizeDrag = useCallback(() => {
        const drag = dragRef.current;
        if (!drag) return;
        dragRef.current = null;
        if (drag.changed) onChangeRef.current(drag.latest, { id: drag.id, finalize: true });
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            finalizeDrag();
            eyeDropperAbortRef.current?.abort();
        };
    }, [finalizeDrag]);

    const colorAtPointer = useCallback((kind: DragKind, event: React.PointerEvent<HTMLElement>): HsvaColor => {
        const current = latestColorRef.current;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (kind === 'saturation') {
            return { ...current, ...saturationValueFromPoint(event.clientX, event.clientY, bounds) };
        }
        if (kind === 'hue') return { ...current, h: hueFromPoint(event.clientX, bounds) };
        return { ...current, a: alphaFromPoint(event.clientX, bounds) };
    }, []);

    const startDrag = useCallback(
        (kind: DragKind, event: React.PointerEvent<HTMLDivElement>) => {
            if ((event.button ?? 0) !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const id = createSessionId();
            const next = emit(colorAtPointer(kind, event), { id, finalize: false });
            dragRef.current = { pointerId: event.pointerId, kind, id, latest: next, changed: true };
        },
        [colorAtPointer, emit]
    );

    const moveDrag = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            event.preventDefault();
            const next = emit(colorAtPointer(drag.kind, event), { id: drag.id, finalize: false });
            drag.latest = next;
            drag.changed = true;
        },
        [colorAtPointer, emit]
    );

    const endDrag = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            finalizeDrag();
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
        },
        [finalizeDrag]
    );

    const handleSaturationKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const step = event.shiftKey ? 10 : 1;
            const current = latestColorRef.current;
            let next: HsvaColor | null = null;
            if (event.key === 'ArrowLeft') next = { ...current, s: current.s - step };
            if (event.key === 'ArrowRight') next = { ...current, s: current.s + step };
            if (event.key === 'ArrowUp') next = { ...current, v: current.v + step };
            if (event.key === 'ArrowDown') next = { ...current, v: current.v - step };
            if (!next) return;
            event.preventDefault();
            emit(next);
        },
        [emit]
    );

    const handleSliderKeyDown = useCallback(
        (kind: 'hue' | 'alpha', event: React.KeyboardEvent<HTMLDivElement>) => {
            const step = event.shiftKey ? 10 : 1;
            const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1;
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const current = latestColorRef.current;
            emit(
                kind === 'hue'
                    ? { ...current, h: current.h + direction * step }
                    : { ...current, a: current.a + (direction * step) / 100 }
            );
        },
        [emit]
    );

    const restoreDrafts = useCallback(() => setDrafts(colorDrafts(latestColorRef.current)), []);

    const commitDraft = useCallback(
        (field: keyof InputDrafts) => {
            const current = latestColorRef.current;
            let next: HsvaColor | null = null;
            if (field === 'hex') {
                const value = drafts.hex.trim().replace(/^#/, '');
                if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
                    next = colorToHsva(`#${value}`, current);
                    next.a = current.a;
                }
            } else if (field === 'a') {
                const value = Number(drafts.a);
                if (Number.isFinite(value)) next = { ...current, a: clamp(value, 0, 100) / 100 };
            } else {
                const value = Number(drafts[field]);
                if (Number.isFinite(value)) {
                    const rgba = hsvaToRgba(current);
                    rgba[field] = clamp(Math.round(value), 0, 255);
                    next = rgbaToHsva(rgba);
                }
            }

            if (next && !isSameColor(current, next, includeAlpha)) emit(next);
            restoreDrafts();
        },
        [drafts, emit, includeAlpha, restoreDrafts]
    );

    const handleInputKeyDown = useCallback(
        (field: keyof InputDrafts, event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
                event.preventDefault();
                skipBlurCommitRef.current = true;
                restoreDrafts();
                event.currentTarget.blur();
            }
        },
        [restoreDrafts]
    );

    const eyeDropperConstructor =
        typeof window !== 'undefined' ? (window as Window & { EyeDropper?: typeof EyeDropper }).EyeDropper : undefined;

    const openEyeDropper = useCallback(async () => {
        if (!eyeDropperConstructor || eyeDropperPending) return;
        const abortController = new AbortController();
        eyeDropperAbortRef.current = abortController;
        setEyeDropperPending(true);
        setEyeDropperError(null);
        try {
            const result = await new eyeDropperConstructor().open({ signal: abortController.signal });
            const sampled = colorToHsva(result.sRGBHex, latestColorRef.current);
            sampled.a = latestColorRef.current.a;
            emit(sampled);
        } catch (cause) {
            if (mountedRef.current && (cause as Error)?.name !== 'AbortError') {
                setEyeDropperError('Could not sample a screen color.');
            }
        } finally {
            if (eyeDropperAbortRef.current === abortController) eyeDropperAbortRef.current = null;
            if (mountedRef.current) setEyeDropperPending(false);
        }
    }, [emit, eyeDropperConstructor, eyeDropperPending]);

    const rgba = hsvaToRgba(color);
    const saturationStyle = { backgroundColor: `hsl(${color.h}, 100%, 50%)` };
    const alphaStyle = {
        backgroundImage: `linear-gradient(to right, rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, 0), rgb(${rgba.r}, ${rgba.g}, ${rgba.b}))`,
    };
    const saturationValue = `Saturation ${Math.round(color.s)}%, brightness ${Math.round(color.v)}%`;
    const fieldDefinitions = useMemo(
        () => [
            { key: 'hex' as const, label: 'Hex', inputMode: 'text' as const },
            { key: 'r' as const, label: 'R', inputMode: 'numeric' as const },
            { key: 'g' as const, label: 'G', inputMode: 'numeric' as const },
            { key: 'b' as const, label: 'B', inputMode: 'numeric' as const },
            ...(includeAlpha ? [{ key: 'a' as const, label: 'A%', inputMode: 'numeric' as const }] : []),
        ],
        [includeAlpha]
    );

    return (
        <div className="color-picker" aria-label="Color picker">
            <div
                className="color-picker__saturation"
                style={saturationStyle}
                role="group"
                aria-label="Saturation and brightness"
                tabIndex={0}
                onKeyDown={handleSaturationKeyDown}
                onPointerDown={(event) => startDrag('saturation', event)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={finalizeDrag}
            >
                <span className="sr-only" aria-live="polite">
                    {saturationValue}
                </span>
                <span
                    className="color-picker__saturation-thumb"
                    style={{ left: `${color.s}%`, top: `${100 - color.v}%` }}
                    aria-hidden="true"
                />
            </div>

            <div className="color-picker__sliders">
                <div
                    className="color-picker__slider color-picker__hue"
                    role="slider"
                    aria-label="Hue"
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={Math.round(color.h)}
                    tabIndex={0}
                    onKeyDown={(event) => handleSliderKeyDown('hue', event)}
                    onPointerDown={(event) => startDrag('hue', event)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onLostPointerCapture={finalizeDrag}
                >
                    <span
                        className="color-picker__slider-thumb"
                        style={{ left: `${color.h / 3.6}%` }}
                        aria-hidden="true"
                    />
                </div>
                {includeAlpha && (
                    <div
                        className="color-picker__slider color-picker__alpha"
                        style={alphaStyle}
                        role="slider"
                        aria-label="Opacity"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(color.a * 100)}
                        tabIndex={0}
                        onKeyDown={(event) => handleSliderKeyDown('alpha', event)}
                        onPointerDown={(event) => startDrag('alpha', event)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onLostPointerCapture={finalizeDrag}
                    >
                        <span
                            className="color-picker__slider-thumb"
                            style={{ left: `${color.a * 100}%` }}
                            aria-hidden="true"
                        />
                    </div>
                )}
            </div>

            <div className="color-picker__fields">
                {fieldDefinitions.map(({ key, label, inputMode }) => (
                    <label key={key} className={`color-picker__field color-picker__field--${key}`}>
                        <span>{label}</span>
                        <input
                            aria-label={label === 'A%' ? 'Opacity percent' : label}
                            inputMode={inputMode}
                            value={drafts[key]}
                            onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                            onBlur={() => {
                                if (skipBlurCommitRef.current) {
                                    skipBlurCommitRef.current = false;
                                    return;
                                }
                                commitDraft(key);
                            }}
                            onKeyDown={(event) => handleInputKeyDown(key, event)}
                        />
                    </label>
                ))}
                {eyeDropperConstructor && (
                    <button
                        type="button"
                        className="color-picker__eyedropper"
                        aria-label={eyeDropperPending ? 'Picking color from screen' : 'Pick color from screen'}
                        title="Pick color from screen"
                        disabled={eyeDropperPending}
                        onClick={openEyeDropper}
                    >
                        <FaEyeDropper aria-hidden="true" />
                    </button>
                )}
            </div>

            {eyeDropperError && (
                <p className="color-picker__error" role="alert">
                    {eyeDropperError}
                </p>
            )}

            <div className="color-picker__presets" aria-label="Preset colors">
                {PRESET_COLORS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        className={`color-picker__preset${hsvaToHex(color) === preset ? ' is-selected' : ''}`}
                        style={{ backgroundColor: preset }}
                        aria-label={`Use ${preset}`}
                        aria-pressed={hsvaToHex(color) === preset}
                        onClick={() => {
                            const next = colorToHsva(preset, latestColorRef.current);
                            next.a = latestColorRef.current.a;
                            emit(next);
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
