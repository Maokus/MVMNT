/**
 * EasingPicker — grid of easing function thumbnails for selecting an easing curve.
 *
 * Each thumbnail is a tiny SVG preview of the easing function, grouped by family.
 * Click dispatches the selected easingId back via the onSelect callback.
 */

import React, { useMemo } from 'react';
import easings from '@animation/easing';

interface EasingPickerProps {
    currentEasingId: string;
    onSelect: (easingId: string) => void;
}

/** Easing families for grouping. */
const EASING_GROUPS: Array<{ label: string; ids: string[] }> = [
    { label: 'Linear', ids: ['linear'] },
    { label: 'Quad', ids: ['easeInQuad', 'easeOutQuad', 'easeInOutQuad'] },
    { label: 'Cubic', ids: ['easeInCubic', 'easeOutCubic', 'easeInOutCubic'] },
    { label: 'Quart', ids: ['easeInQuart', 'easeOutQuart', 'easeInOutQuart'] },
    { label: 'Quint', ids: ['easeInQuint', 'easeOutQuint', 'easeInOutQuint'] },
    { label: 'Sine', ids: ['easeInSine', 'easeOutSine', 'easeInOutSine'] },
    { label: 'Expo', ids: ['easeInExpo', 'easeOutExpo', 'easeInOutExpo'] },
    { label: 'Circ', ids: ['easeInCirc', 'easeOutCirc', 'easeInOutCirc'] },
    { label: 'Back', ids: ['easeInBack', 'easeOutBack', 'easeInOutBack'] },
    { label: 'Elastic', ids: ['easeInElastic', 'easeOutElastic', 'easeInOutElastic'] },
    { label: 'Bounce', ids: ['easeInBounce', 'easeOutBounce', 'easeInOutBounce'] },
];

const THUMB_W = 36;
const THUMB_H = 28;
const SAMPLES = 20;

/** Render a tiny curve preview for a given easing function. */
const EasingThumbnail: React.FC<{
    easingId: string;
    selected: boolean;
    onClick: () => void;
}> = ({ easingId, selected, onClick }) => {
    const points = useMemo(() => {
        const fn = (easings as Record<string, ((t: number) => number) | undefined>)[easingId];
        if (!fn) return '';
        const pts: string[] = [];
        for (let i = 0; i <= SAMPLES; i++) {
            const t = i / SAMPLES;
            const v = fn(t);
            const x = 2 + t * (THUMB_W - 4);
            const y = THUMB_H - 2 - Math.max(0, Math.min(1, v)) * (THUMB_H - 4);
            pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return pts.join(' ');
    }, [easingId]);

    const shortName = easingId
        .replace('easeIn', 'In')
        .replace('easeOut', 'Out')
        .replace('easeInOut', 'InOut');

    return (
        <button
            type="button"
            className={`ae-easing-thumb ${selected ? 'selected' : ''}`}
            title={easingId}
            onClick={onClick}
        >
            <svg width={THUMB_W} height={THUMB_H} viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}>
                {/* Background grid line */}
                <line x1={2} y1={THUMB_H - 2} x2={THUMB_W - 2} y2={2} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                {/* Curve */}
                <polyline
                    points={points}
                    fill="none"
                    stroke={selected ? '#60a5fa' : 'rgba(96,165,250,0.7)'}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                />
            </svg>
            <span className="ae-easing-label">{shortName}</span>
        </button>
    );
};

const EasingPicker: React.FC<EasingPickerProps> = ({ currentEasingId, onSelect }) => {
    return (
        <div className="ae-easing-picker">
            {EASING_GROUPS.map((group) => (
                <div key={group.label} className="ae-easing-group">
                    <div className="ae-easing-group-label">{group.label}</div>
                    <div className="ae-easing-group-grid">
                        {group.ids.map((id) => (
                            <EasingThumbnail
                                key={id}
                                easingId={id}
                                selected={id === currentEasingId}
                                onClick={() => onSelect(id)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default EasingPicker;
