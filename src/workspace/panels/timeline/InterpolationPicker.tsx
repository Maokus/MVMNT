/**
 * InterpolationPicker — segment interpolation mode selector.
 *
 * Replaces the flat EasingPicker with a grouped mode selector that supports:
 *   - Basic modes: constant, linear, bezier
 *   - Smooth presets: sine, quad, cubic, quart, quint, expo, circ
 *   - Dynamic presets: back, bounce, elastic
 *   - Easing direction control (auto / in / out / in-out)
 *   - Parameter controls for back (overshoot) and elastic (amplitude, period)
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { resolveParametricEasing } from '@math/animation/easing-parametric';
import {
    DEFAULT_BACK_OVERSHOOT,
    DEFAULT_ELASTIC_AMPLITUDE,
    DEFAULT_ELASTIC_PERIOD,
} from '@automation/interpolation-defaults';
import type {
    EasingDirection,
    HandleType,
    SegmentInterpolation,
    SegmentInterpolationMode,
    SegmentInterpolationParams,
} from '@automation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterpolationPickerProps {
    current: SegmentInterpolation;
    onSelect: (interpolation: SegmentInterpolation) => void;
    handleType?: HandleType | null;
    onHandleTypeChange?: (type: HandleType) => void;
}

// ---------------------------------------------------------------------------
// Mode groups
// ---------------------------------------------------------------------------

interface ModeEntry {
    mode: SegmentInterpolationMode;
    label: string;
}

const BASIC_MODES: ModeEntry[] = [
    { mode: 'constant', label: 'Constant' },
    { mode: 'linear', label: 'Linear' },
    { mode: 'bezier', label: 'Bezier' },
];

const SMOOTH_MODES: ModeEntry[] = [
    { mode: 'sine', label: 'Sine' },
    { mode: 'quad', label: 'Quad' },
    { mode: 'cubic', label: 'Cubic' },
    { mode: 'quart', label: 'Quart' },
    { mode: 'quint', label: 'Quint' },
    { mode: 'expo', label: 'Expo' },
    { mode: 'circ', label: 'Circ' },
];

const DYNAMIC_MODES: ModeEntry[] = [
    { mode: 'back', label: 'Back' },
    { mode: 'bounce', label: 'Bounce' },
    { mode: 'elastic', label: 'Elastic' },
];

const MODES_WITH_DIRECTION: ReadonlySet<SegmentInterpolationMode> = new Set([
    'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'bounce', 'elastic',
]);

const MODES_WITH_PARAMS: ReadonlySet<SegmentInterpolationMode> = new Set(['back', 'elastic']);

const HANDLE_TYPE_OPTIONS: Array<{ type: HandleType; label: string }> = [
    { type: 'auto_clamped', label: 'Auto (Clamped)' },
    { type: 'auto', label: 'Auto' },
    { type: 'free', label: 'Free' },
    { type: 'aligned', label: 'Aligned' },
    { type: 'vector', label: 'Vector' },
];

// ---------------------------------------------------------------------------
// SVG Thumbnail
// ---------------------------------------------------------------------------

const THUMB_W = 36;
const THUMB_H = 28;
const SAMPLES = 20;

const ModeThumbnail: React.FC<{
    mode: SegmentInterpolationMode;
    direction: EasingDirection;
    params?: SegmentInterpolationParams;
    selected: boolean;
    onClick: () => void;
    label: string;
}> = ({ mode, direction, params, selected, onClick, label }) => {
    const points = useMemo(() => {
        if (mode === 'constant') {
            // Step shape
            return `2,${THUMB_H - 2} ${THUMB_W / 2},${THUMB_H - 2} ${THUMB_W / 2},2 ${THUMB_W - 2},2`;
        }
        const fn = resolveParametricEasing(mode, direction, params);
        if (!fn) {
            // Bezier: draw an S-curve approximation
            const pts: string[] = [];
            for (let i = 0; i <= SAMPLES; i++) {
                const t = i / SAMPLES;
                // Simple cubic bezier approximation for thumbnail
                const v = t * t * (3 - 2 * t);
                const x = 2 + t * (THUMB_W - 4);
                const y = THUMB_H - 2 - Math.max(0, Math.min(1, v)) * (THUMB_H - 4);
                pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
            }
            return pts.join(' ');
        }
        const pts: string[] = [];
        for (let i = 0; i <= SAMPLES; i++) {
            const t = i / SAMPLES;
            const v = fn(t);
            const x = 2 + t * (THUMB_W - 4);
            const y = THUMB_H - 2 - Math.max(0, Math.min(1, v)) * (THUMB_H - 4);
            pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return pts.join(' ');
    }, [mode, direction, params]);

    return (
        <button
            type="button"
            className={`ae-easing-thumb ${selected ? 'selected' : ''}`}
            title={label}
            onClick={onClick}
        >
            <svg width={THUMB_W} height={THUMB_H} viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}>
                <line x1={2} y1={THUMB_H - 2} x2={THUMB_W - 2} y2={2} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <polyline
                    points={points}
                    fill="none"
                    stroke={selected ? '#60a5fa' : 'rgba(96,165,250,0.7)'}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                />
            </svg>
            <span className="ae-easing-label">{label}</span>
        </button>
    );
};

// ---------------------------------------------------------------------------
// Direction buttons
// ---------------------------------------------------------------------------

const DIRECTION_OPTIONS: Array<{ value: EasingDirection; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'ease_in', label: 'In' },
    { value: 'ease_out', label: 'Out' },
    { value: 'ease_in_out', label: 'In/Out' },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const InterpolationPicker: React.FC<InterpolationPickerProps> = ({ current, onSelect, handleType, onHandleTypeChange }) => {
    // Local state for direction and params that updates live
    const [localDirection, setLocalDirection] = useState<EasingDirection>(current.direction);
    const [localParams, setLocalParams] = useState<SegmentInterpolationParams>(current.params ?? {});
    // Tracks whether the user has explicitly picked a direction since the picker opened.
    // If not, switching modes resets direction to 'auto'.
    const hasExplicitDirection = useRef(false);

    const selectedMode = current.mode;
    const showDirection = MODES_WITH_DIRECTION.has(selectedMode);
    const showParams = MODES_WITH_PARAMS.has(selectedMode);

    const handleModeSelect = useCallback((mode: SegmentInterpolationMode) => {
        const direction: EasingDirection = hasExplicitDirection.current ? localDirection : 'auto';
        if (!hasExplicitDirection.current) setLocalDirection('auto');
        setLocalParams({});
        onSelect({ mode, direction, params: undefined });
    }, [onSelect, localDirection]);

    const handleDirectionChange = useCallback((direction: EasingDirection) => {
        hasExplicitDirection.current = true;
        setLocalDirection(direction);
        onSelect({ mode: selectedMode, direction, params: localParams });
    }, [onSelect, selectedMode, localParams]);

    const handleParamChange = useCallback((key: keyof SegmentInterpolationParams, value: number) => {
        const next = { ...localParams, [key]: value };
        setLocalParams(next);
        onSelect({ mode: selectedMode, direction: localDirection, params: next });
    }, [onSelect, selectedMode, localDirection, localParams]);

    // Use the current direction for thumbnail previews of the selected mode
    const previewDirection = showDirection ? localDirection : 'auto';

    const renderGroup = (label: string, modes: ModeEntry[]) => (
        <div className="ae-easing-group" key={label}>
            <div className="ae-easing-group-label">{label}</div>
            <div className="ae-easing-group-grid">
                {modes.map((entry) => (
                    <ModeThumbnail
                        key={entry.mode}
                        mode={entry.mode}
                        direction={entry.mode === selectedMode ? previewDirection : 'auto'}
                        params={entry.mode === selectedMode ? localParams : undefined}
                        selected={entry.mode === selectedMode}
                        onClick={() => handleModeSelect(entry.mode)}
                        label={entry.label}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <div className="ae-easing-picker">
            {renderGroup('Basic', BASIC_MODES)}
            {renderGroup('Smooth', SMOOTH_MODES)}
            {renderGroup('Dynamic', DYNAMIC_MODES)}

            {/* Easing direction controls */}
            {showDirection && (
                <div className="ae-interp-section">
                    <div className="ae-easing-group-label">Direction</div>
                    <div className="ae-direction-buttons">
                        {DIRECTION_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={`ae-direction-btn ${localDirection === opt.value ? 'selected' : ''}`}
                                onClick={() => handleDirectionChange(opt.value)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Parameter controls */}
            {showParams && selectedMode === 'back' && (
                <div className="ae-interp-section">
                    <div className="ae-easing-group-label">Overshoot</div>
                    <div className="ae-param-row">
                        <input
                            type="range"
                            min={0}
                            max={5}
                            step={0.01}
                            value={localParams.overshoot ?? DEFAULT_BACK_OVERSHOOT}
                            onChange={(e) => handleParamChange('overshoot', parseFloat(e.target.value))}
                            className="ae-param-slider"
                        />
                        <span className="ae-param-value">
                            {(localParams.overshoot ?? DEFAULT_BACK_OVERSHOOT).toFixed(2)}
                        </span>
                    </div>
                </div>
            )}

            {showParams && selectedMode === 'elastic' && (
                <div className="ae-interp-section">
                    <div className="ae-easing-group-label">Amplitude</div>
                    <div className="ae-param-row">
                        <input
                            type="range"
                            min={0.1}
                            max={3}
                            step={0.01}
                            value={localParams.amplitude ?? DEFAULT_ELASTIC_AMPLITUDE}
                            onChange={(e) => handleParamChange('amplitude', parseFloat(e.target.value))}
                            className="ae-param-slider"
                        />
                        <span className="ae-param-value">
                            {(localParams.amplitude ?? DEFAULT_ELASTIC_AMPLITUDE).toFixed(2)}
                        </span>
                    </div>
                    <div className="ae-easing-group-label">Period</div>
                    <div className="ae-param-row">
                        <input
                            type="range"
                            min={0.05}
                            max={1}
                            step={0.01}
                            value={localParams.period ?? DEFAULT_ELASTIC_PERIOD}
                            onChange={(e) => handleParamChange('period', parseFloat(e.target.value))}
                            className="ae-param-slider"
                        />
                        <span className="ae-param-value">
                            {(localParams.period ?? DEFAULT_ELASTIC_PERIOD).toFixed(2)}
                        </span>
                    </div>
                </div>
            )}

            {/* Bezier handle type controls */}
            {selectedMode === 'bezier' && onHandleTypeChange && (
                <div className="ae-interp-section">
                    <div className="ae-easing-group-label">Handle Type</div>
                    <div className="ae-direction-buttons">
                        {HANDLE_TYPE_OPTIONS.map((opt) => (
                            <button
                                key={opt.type}
                                type="button"
                                className={`ae-direction-btn ${handleType === opt.type ? 'selected' : ''}`}
                                onClick={() => onHandleTypeChange(opt.type)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InterpolationPicker;
