import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaEyeDropper } from 'react-icons/fa';

import {
    alphaFromPoint,
    clamp,
    colorToHsva,
    generateBasePalette,
    generateTonePalette,
    hsvaToHex,
    hsvaToRgba,
    hueFromPoint,
    loadColorFieldMode,
    loadRecentColors,
    normalizeHue,
    preserveAchromaticHue,
    rgbaToHsva,
    saveColorFieldMode,
    saturationValueFromPoint,
    storeRecentColor,
    type ColorFieldMode,
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
    h: string;
    s: string;
    v: string;
    a: string;
}

const colorDrafts = (color: HsvaColor): InputDrafts => {
    const rgba = hsvaToRgba(color);
    return {
        hex: hsvaToHex(color).slice(1),
        r: String(rgba.r),
        g: String(rgba.g),
        b: String(rgba.b),
        h: String(Math.round(normalizeHue(color.h))),
        s: String(Math.round(color.s)),
        v: String(Math.round(color.v)),
        a: String(Math.round(color.a * 100)),
    };
};

const isSameColor = (first: HsvaColor, second: HsvaColor, includeAlpha: boolean): boolean =>
    hsvaToHex(first, includeAlpha) === hsvaToHex(second, includeAlpha);

const createSessionId = (): string => `color-drag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface EmitOptions {
    gesture?: ColorPickerGesture;
    preserveHue?: boolean;
    record?: boolean;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, includeAlpha = false, onChange }) => {
    const [drafts, setDrafts] = useState<InputDrafts>(() => colorDrafts(color));
    const [fieldMode, setFieldMode] = useState<ColorFieldMode>(loadColorFieldMode);
    const [recentColors, setRecentColors] = useState<string[]>(loadRecentColors);
    const [eyeDropperPending, setEyeDropperPending] = useState(false);
    const [eyeDropperError, setEyeDropperError] = useState<string | null>(null);
    const latestColorRef = useRef(color);
    const onChangeRef = useRef(onChange);
    const dragRef = useRef<DragState | null>(null);
    const eyeDropperAbortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const skipBlurCommitRef = useRef(false);
    const keyboardRecentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    latestColorRef.current = color;
    onChangeRef.current = onChange;

    useEffect(() => {
        setDrafts(colorDrafts(color));
    }, [color]);

    const recordRecent = useCallback((committed: HsvaColor) => {
        const next = storeRecentColor(committed);
        if (mountedRef.current) setRecentColors(next);
    }, []);

    const flushKeyboardRecent = useCallback(() => {
        if (keyboardRecentTimerRef.current === null) return;
        clearTimeout(keyboardRecentTimerRef.current);
        keyboardRecentTimerRef.current = null;
        recordRecent(latestColorRef.current);
    }, [recordRecent]);

    const scheduleKeyboardRecent = useCallback(() => {
        if (keyboardRecentTimerRef.current !== null) clearTimeout(keyboardRecentTimerRef.current);
        keyboardRecentTimerRef.current = setTimeout(() => {
            keyboardRecentTimerRef.current = null;
            recordRecent(latestColorRef.current);
        }, 300);
    }, [recordRecent]);

    const emit = useCallback(
        (candidate: HsvaColor, options: EmitOptions = {}) => {
            const normalized = {
                h: normalizeHue(candidate.h),
                s: clamp(candidate.s, 0, 100),
                v: clamp(candidate.v, 0, 100),
                a: includeAlpha ? clamp(candidate.a, 0, 1) : 1,
            };
            const next = options.preserveHue ? preserveAchromaticHue(latestColorRef.current, normalized) : normalized;
            latestColorRef.current = next;
            onChangeRef.current(next, options.gesture);
            if (options.record) recordRecent(next);
            return next;
        },
        [includeAlpha, recordRecent]
    );

    const finalizeDrag = useCallback(() => {
        const drag = dragRef.current;
        if (!drag) return;
        dragRef.current = null;
        if (drag.changed) {
            onChangeRef.current(drag.latest, { id: drag.id, finalize: true });
            recordRecent(drag.latest);
        }
    }, [recordRecent]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            finalizeDrag();
            flushKeyboardRecent();
            eyeDropperAbortRef.current?.abort();
        };
    }, [finalizeDrag, flushKeyboardRecent]);

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
            const next = emit(colorAtPointer(kind, event), { gesture: { id, finalize: false } });
            dragRef.current = { pointerId: event.pointerId, kind, id, latest: next, changed: true };
        },
        [colorAtPointer, emit]
    );

    const moveDrag = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            event.preventDefault();
            const next = emit(colorAtPointer(drag.kind, event), { gesture: { id: drag.id, finalize: false } });
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
            scheduleKeyboardRecent();
        },
        [emit, scheduleKeyboardRecent]
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
            scheduleKeyboardRecent();
        },
        [emit, scheduleKeyboardRecent]
    );

    const restoreDrafts = useCallback(() => setDrafts(colorDrafts(latestColorRef.current)), []);

    const commitDraft = useCallback(
        (field: keyof InputDrafts) => {
            const current = latestColorRef.current;
            let next: HsvaColor | null = null;
            let preserveHue = false;
            if (field === 'hex') {
                const value = drafts.hex.trim().replace(/^#/, '');
                if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
                    next = colorToHsva(`#${value}`, current);
                    next.a = current.a;
                    preserveHue = true;
                }
            } else if (field === 'a') {
                const value = Number(drafts.a);
                if (Number.isFinite(value)) next = { ...current, a: clamp(value, 0, 100) / 100 };
            } else if (field === 'h' || field === 's' || field === 'v') {
                const value = Number(drafts[field]);
                if (Number.isFinite(value)) {
                    next = {
                        ...current,
                        [field]: field === 'h' ? normalizeHue(Math.round(value)) : clamp(value, 0, 100),
                    };
                }
            } else {
                const value = Number(drafts[field]);
                if (Number.isFinite(value)) {
                    const rgba = hsvaToRgba(current);
                    rgba[field] = clamp(Math.round(value), 0, 255);
                    next = rgbaToHsva(rgba);
                    next.a = current.a;
                    preserveHue = true;
                }
            }

            if (next && (!isSameColor(current, next, includeAlpha) || ['h', 's', 'v'].includes(field))) {
                emit(next, { preserveHue, record: true });
            }
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
            emit(sampled, { preserveHue: true, record: true });
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
    const toneColors = useMemo(() => generateTonePalette(color.h), [color.h]);
    const baseColors = useMemo(generateBasePalette, []);
    const fieldDefinitions = useMemo(() => {
        const components =
            fieldMode === 'hsv'
                ? [
                      { key: 'h' as const, label: 'H', inputMode: 'numeric' as const },
                      { key: 's' as const, label: 'S%', inputMode: 'numeric' as const },
                      { key: 'v' as const, label: 'V%', inputMode: 'numeric' as const },
                  ]
                : [
                      { key: 'r' as const, label: 'R', inputMode: 'numeric' as const },
                      { key: 'g' as const, label: 'G', inputMode: 'numeric' as const },
                      { key: 'b' as const, label: 'B', inputMode: 'numeric' as const },
                  ];
        return [
            { key: 'hex' as const, label: 'Hex', inputMode: 'text' as const },
            ...components,
            ...(includeAlpha ? [{ key: 'a' as const, label: 'A%', inputMode: 'numeric' as const }] : []),
        ];
    }, [fieldMode, includeAlpha]);

    const selectFieldMode = useCallback((mode: ColorFieldMode) => {
        setFieldMode(mode);
        saveColorFieldMode(mode);
    }, []);

    const selectPaletteColor = useCallback(
        (hex: string) => {
            const next = colorToHsva(hex, latestColorRef.current);
            next.a = latestColorRef.current.a;
            emit(next, { preserveHue: true, record: true });
        },
        [emit]
    );

    const renderSwatches = (colors: string[], section: string) =>
        colors.map((swatch) => {
            const selected = hsvaToHex(color) === swatch;
            return (
                <button
                    key={`${section}-${swatch}`}
                    type="button"
                    className={`color-picker__preset${selected ? ' is-selected' : ''}`}
                    style={{ backgroundColor: swatch }}
                    aria-label={`Use ${swatch} from ${section}`}
                    aria-pressed={selected}
                    onClick={() => selectPaletteColor(swatch)}
                />
            );
        });

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
                    aria-valuemax={359}
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

            <div className="color-picker__field-toolbar">
                <span>Values</span>
                <div className="color-picker__field-mode" role="group" aria-label="Color value format">
                    {(['hsv', 'rgb'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            className={fieldMode === mode ? 'is-selected' : ''}
                            aria-pressed={fieldMode === mode}
                            onClick={() => selectFieldMode(mode)}
                        >
                            {mode.toUpperCase()}
                        </button>
                    ))}
                </div>
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

            <div className="color-picker__palette">
                <section className="color-picker__palette-section" aria-label="Tone colors">
                    <span className="color-picker__palette-label">Tone</span>
                    <div className="color-picker__presets">{renderSwatches(toneColors, 'Tone')}</div>
                </section>
                {recentColors.length > 0 && (
                    <section className="color-picker__palette-section" aria-label="Recent colors">
                        <span className="color-picker__palette-label">Recent</span>
                        <div className="color-picker__presets">{renderSwatches(recentColors, 'Recent')}</div>
                    </section>
                )}
                <section className="color-picker__palette-section" aria-label="Base colors">
                    <span className="color-picker__palette-label">Base</span>
                    <div className="color-picker__presets">{renderSwatches(baseColors, 'Base')}</div>
                </section>
            </div>
        </div>
    );
};
