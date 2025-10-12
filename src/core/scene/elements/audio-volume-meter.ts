import { SceneElement } from './base';
import { Arc, Line, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import { useTimelineStore } from '@state/timelineStore';
import {
    applyGlowToArc,
    applyGlowToRectangle,
    applyTransferFunction,
    createTransferFunctionProperties,
    sampleFeatureHistory,
    type GlowStyle,
    type TransferFunctionId,
} from '@utils/audioVisualization';
import {
    coerceFeatureDescriptors,
    emitAnalysisIntent,
    resolveTimelineTrackRefValue,
    sampleFeatureFrame,
} from './audioFeatureUtils';

type MeterOrientation = 'vertical' | 'horizontal' | 'radial';
type LabelMode = 'off' | 'decibels' | 'percent' | 'custom';
type LabelSource = 'static' | 'track';
type OpacityCurve = 'none' | TransferFunctionId;

const DEG_TO_RAD = Math.PI / 180;
const HISTORY_BASE_FPS = 120;

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
}

function normalizeValue(value: number, minValue: number, maxValue: number): number {
    if (!Number.isFinite(value)) return 0;
    const clamped = Math.max(minValue, Math.min(maxValue, value));
    const range = maxValue - minValue;
    if (range <= 0) {
        return 0;
    }
    return clamp01((clamped - minValue) / range);
}

function toDecibels(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
        return Number.NEGATIVE_INFINITY;
    }
    return 20 * Math.log10(value);
}

function fromDecibels(db: number): number {
    if (!Number.isFinite(db)) {
        return 0;
    }
    return Math.pow(10, db / 20);
}

function createGlowStyle(strength: number, color: string, alpha: number): GlowStyle | null {
    const clampedStrength = clamp01(strength);
    if (clampedStrength <= 0) {
        return null;
    }
    const opacity = Math.min(1, alpha * (0.25 + clampedStrength * 0.55));
    if (opacity <= 0) {
        return null;
    }
    const layerCount = 2 + Math.round(clampedStrength * 2);
    return {
        color,
        blur: 8 + clampedStrength * 16,
        opacity,
        layerCount,
        layerSpread: 6 + clampedStrength * 10,
        opacityFalloff: 'quadratic',
    };
}

function computeHistoryFrameCount(holdTime: number): number {
    const windowSeconds = Math.max(0, holdTime) + 2;
    const frames = Math.ceil(windowSeconds * HISTORY_BASE_FPS);
    return Math.max(3, Math.min(720, frames));
}

export class AudioVolumeMeterElement extends SceneElement {
    constructor(id: string = 'audioVolumeMeter', config: Record<string, unknown> = {}) {
        super('audioVolumeMeter', id, config);
    }

    private static readonly DEFAULT_DESCRIPTOR: AudioFeatureDescriptor = { featureKey: 'rms', smoothing: 0 };

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        const opacityCurveProperties = createTransferFunctionProperties({
            functionKey: 'opacityCurve',
            exponentKey: 'opacityCurveExponent',
            label: 'Opacity Curve',
            exponentLabel: 'Opacity Curve Exponent',
            defaultFunction: 'linear',
            exponentRange: { min: 0.1, max: 8, step: 0.1 },
        });

        if (opacityCurveProperties[0]) {
            opacityCurveProperties[0] = {
                ...opacityCurveProperties[0],
                default: 'none',
                description: 'Maps normalized meter level to opacity when enabled.',
                options: [
                    { label: 'None', value: 'none' },
                    ...((opacityCurveProperties[0].options as { label: string; value: string }[]) ?? []),
                ],
            };
        }
        if (opacityCurveProperties[1]) {
            opacityCurveProperties[1] = {
                ...opacityCurveProperties[1],
                default: 2,
                description: 'Adjusts the curve when using the Power opacity mode.',
            };
        }

        return {
            ...base,
            name: 'Audio Volume Meter',
            description: 'Displays RMS audio levels with flexible layouts and labels.',
            category: 'audio',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'volumeMeter',
                    label: 'Meter Basics',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Connect to a volume feature and shape the meter.',
                    properties: [
                        {
                            key: 'featureTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                        },
                        {
                            key: 'analysisProfileId',
                            type: 'audioAnalysisProfile',
                            label: 'Analysis Profile',
                            default: 'default',
                            trackPropertyKey: 'featureTrackId',
                        },
                        { key: 'meterColor', type: 'color', label: 'Meter Color', default: '#f472b6' },
                        {
                            key: 'orientation',
                            type: 'select',
                            label: 'Orientation',
                            default: 'vertical',
                            options: [
                                { label: 'Vertical', value: 'vertical' },
                                { label: 'Horizontal', value: 'horizontal' },
                                { label: 'Radial', value: 'radial' },
                            ],
                        },
                        {
                            key: 'minValue',
                            type: 'number',
                            label: 'Minimum Value',
                            default: 0,
                            min: 0,
                            max: 1,
                            step: 0.01,
                        },
                        {
                            key: 'maxValue',
                            type: 'number',
                            label: 'Maximum Value',
                            default: 1,
                            min: 0,
                            max: 2,
                            step: 0.01,
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Meter Width (px)',
                            default: 20,
                            min: 4,
                            max: 400,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Meter Height (px)',
                            default: 200,
                            min: 20,
                            max: 800,
                            step: 1,
                        },
                        {
                            key: 'radialStartAngle',
                            type: 'number',
                            label: 'Radial Start Angle (°)',
                            default: -120,
                            step: 1,
                            visibleWhen: [{ key: 'orientation', equals: 'radial' }],
                        },
                        {
                            key: 'radialEndAngle',
                            type: 'number',
                            label: 'Radial End Angle (°)',
                            default: 120,
                            step: 1,
                            visibleWhen: [{ key: 'orientation', equals: 'radial' }],
                        },
                        {
                            key: 'radialThickness',
                            type: 'number',
                            label: 'Radial Thickness (px)',
                            default: 24,
                            min: 1,
                            max: 200,
                            step: 1,
                            visibleWhen: [{ key: 'orientation', equals: 'radial' }],
                        },
                    ],
                    presets: [
                        {
                            id: 'calibrated',
                            label: 'Calibrated Meter',
                            values: { minValue: 0, maxValue: 1, meterColor: '#38bdf8', width: 24, height: 220 },
                        },
                        {
                            id: 'broadcast',
                            label: 'Broadcast Meter',
                            values: { minValue: 0.1, maxValue: 1.2, meterColor: '#f97316', width: 32, height: 260 },
                        },
                        {
                            id: 'club',
                            label: 'Club Meter',
                            values: { minValue: 0, maxValue: 1.5, meterColor: '#a855f7', width: 18, height: 200 },
                        },
                    ],
                },
                {
                    id: 'meterLabels',
                    label: 'Labels & Text',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Display live loudness readouts or custom labels.',
                    properties: [
                        {
                            key: 'labelMode',
                            type: 'select',
                            label: 'Label Mode',
                            default: 'off',
                            options: [
                                { label: 'Off', value: 'off' },
                                { label: 'Decibels', value: 'decibels' },
                                { label: 'Percent', value: 'percent' },
                                { label: 'Custom', value: 'custom' },
                            ],
                        },
                        {
                            key: 'labelSource',
                            type: 'select',
                            label: 'Custom Label Source',
                            default: 'static',
                            options: [
                                { label: 'Static Text', value: 'static' },
                                { label: 'Track Name', value: 'track' },
                            ],
                            visibleWhen: [{ key: 'labelMode', equals: 'custom' }],
                        },
                        {
                            key: 'labelText',
                            type: 'string',
                            label: 'Custom Label Text',
                            default: 'Volume',
                            visibleWhen: [
                                { key: 'labelMode', equals: 'custom' },
                                { key: 'labelSource', equals: 'static' },
                            ],
                        },
                        {
                            key: 'textLocation',
                            type: 'select',
                            label: 'Label Position',
                            default: 'bottom',
                            options: [
                                { label: 'Outside / Bottom', value: 'bottom' },
                                { label: 'Outside / Top', value: 'top' },
                                { label: 'Track', value: 'track' },
                            ],
                            visibleWhen: [{ key: 'labelMode', notEquals: 'off' }],
                        },
                        {
                            key: 'showText',
                            type: 'boolean',
                            label: 'Show Volume Text (Legacy)',
                            default: false,
                            description: 'Legacy toggle retained for backwards compatibility. Use Label Mode instead.',
                            visibleWhen: [{ key: 'labelMode', equals: '__legacy__' }],
                        },
                    ],
                },
                {
                    id: 'intensityStyle',
                    label: 'Intensity & Glow',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Control glow and opacity response to incoming levels.',
                    properties: [
                        {
                            key: 'glowStrength',
                            type: 'number',
                            label: 'Glow Strength',
                            default: 0.4,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                        ...opacityCurveProperties,
                    ],
                },
                {
                    id: 'peakHold',
                    label: 'Peak Hold',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Configure the peak-hold marker decay.',
                    properties: [
                        {
                            key: 'peakHoldTime',
                            type: 'number',
                            label: 'Peak Hold Time (s)',
                            default: 1,
                            min: 0,
                            max: 5,
                            step: 0.05,
                        },
                        {
                            key: 'peakFallSpeed',
                            type: 'number',
                            label: 'Peak Fall Speed (dB/s)',
                            default: 12,
                            min: 0,
                            max: 60,
                            step: 0.5,
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const trackBinding = this.getBinding('featureTrackId');
        const trackValue = this.getProperty<string | string[] | null>('featureTrackId');
        const descriptorsValue = this.getProperty<AudioFeatureDescriptor[] | null>('features');
        const descriptors = coerceFeatureDescriptors(descriptorsValue, AudioVolumeMeterElement.DEFAULT_DESCRIPTOR);
        const descriptor = descriptors[0] ?? AudioVolumeMeterElement.DEFAULT_DESCRIPTOR;
        const trackId = resolveTimelineTrackRefValue(trackBinding, trackValue);
        const analysisProfileId = this.getProperty<string>('analysisProfileId') ?? null;

        emitAnalysisIntent(this, trackId, analysisProfileId, descriptors);

        const sample: AudioFeatureFrameSample | null =
            trackId && descriptor.featureKey ? sampleFeatureFrame(trackId, descriptor, targetTime) : null;
        const rms = sample?.values?.[0] ?? 0;
        const minValue = this.getProperty<number>('minValue') ?? 0;
        const maxValue = this.getProperty<number>('maxValue') ?? 1;
        const width = Math.max(4, this.getProperty<number>('width') ?? 20);
        const height = Math.max(20, this.getProperty<number>('height') ?? 200);
        const color = this.getProperty<string>('meterColor') ?? '#f472b6';
        const orientation = (this.getProperty<string>('orientation') ?? 'vertical') as MeterOrientation;
        const glowStrength = this.getProperty<number>('glowStrength');
        const opacityCurve = (this.getProperty<string>('opacityCurve') ?? 'none') as OpacityCurve;
        const opacityExponent = this.getProperty<number>('opacityCurveExponent');
        const labelModeProperty = (this.getProperty<string>('labelMode') ?? 'off') as LabelMode;
        const legacyShowText = this.getProperty<boolean>('showText') ?? false;
        const labelMode: LabelMode = labelModeProperty === 'off' && legacyShowText ? 'decibels' : labelModeProperty;
        const labelSource = (this.getProperty<string>('labelSource') ?? 'static') as LabelSource;
        const labelTextValue = this.getProperty<string>('labelText') ?? 'Volume';
        const textLocation = (this.getProperty<string>('textLocation') ?? 'bottom') as 'bottom' | 'top' | 'track';
        const holdTime = Math.max(0, this.getProperty<number>('peakHoldTime') ?? 1);
        const fallSpeed = Math.max(0, this.getProperty<number>('peakFallSpeed') ?? 12);

        const normalized = normalizeValue(rms, minValue, maxValue);
        const resolveAlpha = (value: number): number => {
            if (opacityCurve === 'none') {
                return 1;
            }
            const curve = opacityCurve as TransferFunctionId;
            const options =
                curve === 'power'
                    ? { exponent: Number.isFinite(opacityExponent) ? (opacityExponent as number) : 2 }
                    : undefined;
            return clamp01(applyTransferFunction(clamp01(value), curve, options));
        };
        const fillAlpha = resolveAlpha(normalized);
        const glowStyle = createGlowStyle(
            Number.isFinite(glowStrength) ? (glowStrength as number) : 0,
            color,
            fillAlpha
        );

        const objects: RenderObject[] = [];
        const layoutRect = new Rectangle(0, 0, width, height, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);
        objects.push(layoutRect);

        const hasSample = !!(sample && sample.values?.length);

        const shouldTrackHistory = (holdTime > 0 || fallSpeed > 0) && trackId && descriptor.featureKey;
        let peakNormalized = normalized;
        if (shouldTrackHistory) {
            const frameCount = computeHistoryFrameCount(holdTime);
            if (frameCount > 0) {
                const history = sampleFeatureHistory(trackId as string, descriptor, targetTime, frameCount);
                if (history.length) {
                    let maxNormalized = normalized;
                    for (const frame of history) {
                        const value = frame.values?.[0] ?? 0;
                        let candidate = normalizeValue(value, minValue, maxValue);
                        const dt = Math.max(0, targetTime - (frame.timeSeconds ?? targetTime));
                        if (dt > holdTime && fallSpeed > 0) {
                            const dbValue = toDecibels(value);
                            const decayedDb = dbValue - fallSpeed * (dt - holdTime);
                            const decayed = fromDecibels(decayedDb);
                            candidate = normalizeValue(decayed, minValue, maxValue);
                        }
                        maxNormalized = Math.max(maxNormalized, candidate);
                    }
                    peakNormalized = clamp01(maxNormalized);
                }
            }
        }

        const peakMarkerColor = 'rgba(248, 250, 252, 0.85)';
        const showPeakMarker = peakNormalized > 0 && (holdTime > 0 || fallSpeed > 0);

        const labelText = (() => {
            switch (labelMode) {
                case 'decibels': {
                    const dbValue = toDecibels(rms);
                    return Number.isFinite(dbValue) ? `${dbValue.toFixed(1)} dB` : '-∞ dB';
                }
                case 'percent':
                    return `${Math.round(normalized * 100)}%`;
                case 'custom': {
                    if (labelSource === 'track') {
                        if (trackId) {
                            const state = useTimelineStore.getState();
                            const trackEntry = (state.tracks ?? {})[trackId];
                            const candidate =
                                (trackEntry as any)?.name ??
                                (trackEntry as any)?.displayName ??
                                (trackEntry as any)?.label ??
                                trackId;
                            return typeof candidate === 'string' ? candidate : `${trackId}`;
                        }
                        return 'Audio Track';
                    }
                    return labelTextValue;
                }
                case 'off':
                default:
                    return null;
            }
        })();

        if (orientation === 'vertical') {
            const meterHeight = normalized * height;
            if (meterHeight > 0 && hasSample) {
                const rect = new Rectangle(0, height - meterHeight, width, meterHeight, color);
                rect.setIncludeInLayoutBounds(false);
                rect.setGlobalAlpha(fillAlpha);
                const fillObjects = applyGlowToRectangle(rect, glowStyle);
                for (const obj of fillObjects) {
                    objects.push(obj);
                }
            }

            if (showPeakMarker) {
                const markerY = height - peakNormalized * height;
                const marker = Line.createHorizontalLine(-2, width + 2, markerY, peakMarkerColor, 2);
                marker.setIncludeInLayoutBounds(false);
                if (!hasSample && peakNormalized <= 0) {
                    marker.setVisible(false);
                }
                objects.push(marker);
            }

            if (labelText && labelMode !== 'off') {
                const margin = 6;
                let textX = width / 2;
                let textY = height + margin;
                let align: CanvasTextAlign = 'center';
                let baseline: CanvasTextBaseline = 'top';

                if (textLocation === 'top') {
                    textY = -margin;
                    baseline = 'bottom';
                } else if (textLocation === 'track') {
                    textX = width + margin;
                    textY = height - normalized * height;
                    align = 'left';
                    baseline = 'middle';
                }

                const text = new Text(textX, textY, labelText, '12px Arial, sans-serif', '#ffffff', align, baseline);
                text.setIncludeInLayoutBounds(false);
                objects.push(text);
            }
        } else if (orientation === 'horizontal') {
            const meterWidth = normalized * width;
            if (meterWidth > 0 && hasSample) {
                const rect = new Rectangle(0, 0, meterWidth, height, color);
                rect.setIncludeInLayoutBounds(false);
                rect.setGlobalAlpha(fillAlpha);
                const fillObjects = applyGlowToRectangle(rect, glowStyle);
                for (const obj of fillObjects) {
                    objects.push(obj);
                }
            }

            if (showPeakMarker) {
                const markerX = peakNormalized * width;
                const marker = Line.createVerticalLine(markerX, -2, height + 2, peakMarkerColor, 2);
                marker.setIncludeInLayoutBounds(false);
                if (!hasSample && peakNormalized <= 0) {
                    marker.setVisible(false);
                }
                objects.push(marker);
            }

            if (labelText && labelMode !== 'off') {
                const margin = 6;
                let textX = meterWidth + margin;
                let textY = height / 2;
                let align: CanvasTextAlign = 'left';
                let baseline: CanvasTextBaseline = 'middle';

                if (textLocation === 'top') {
                    textX = meterWidth;
                    textY = -margin;
                    align = 'right';
                    baseline = 'bottom';
                } else if (textLocation === 'track') {
                    textX = meterWidth;
                    align = 'center';
                }

                const text = new Text(textX, textY, labelText, '12px Arial, sans-serif', '#ffffff', align, baseline);
                text.setIncludeInLayoutBounds(false);
                objects.push(text);
            }
        } else {
            const radialStartDeg = this.getProperty<number>('radialStartAngle') ?? -120;
            const radialEndDeg = this.getProperty<number>('radialEndAngle') ?? 120;
            const radialThicknessRaw = this.getProperty<number>('radialThickness') ?? 24;
            const radius = Math.max(1, Math.min(width, height) / 2);
            const thickness = Math.min(radius, Math.max(1, radialThicknessRaw));
            const startAngle = radialStartDeg * DEG_TO_RAD;
            const endAngle = radialEndDeg * DEG_TO_RAD;
            const span = endAngle - startAngle;
            const direction = span >= 0 ? 1 : -1;
            const sweep = Math.abs(span);
            const centerX = width / 2;
            const centerY = height / 2;

            const baseArc = new Arc(centerX, centerY, radius, startAngle, endAngle, direction < 0, {
                strokeColor: color,
                strokeWidth: thickness,
                includeInLayoutBounds: false,
            });
            baseArc.setGlobalAlpha(0.2);
            baseArc.setLineCap('round');
            objects.push(baseArc);

            if (normalized > 0 && hasSample) {
                const currentSweep = sweep * normalized;
                const end = startAngle + direction * currentSweep;
                const arc = new Arc(centerX, centerY, radius, startAngle, end, direction < 0, {
                    strokeColor: color,
                    strokeWidth: thickness,
                    includeInLayoutBounds: false,
                });
                arc.setLineCap('round');
                arc.setGlobalAlpha(fillAlpha);
                const fillObjects = applyGlowToArc(arc, glowStyle);
                for (const obj of fillObjects) {
                    objects.push(obj);
                }
            }

            if (showPeakMarker) {
                const markerAngle = startAngle + direction * sweep * peakNormalized;
                const innerRadius = Math.max(0, radius - thickness / 2);
                const outerRadius = radius + thickness / 2;
                const marker = new Line(
                    centerX + Math.cos(markerAngle) * innerRadius,
                    centerY + Math.sin(markerAngle) * innerRadius,
                    centerX + Math.cos(markerAngle) * outerRadius,
                    centerY + Math.sin(markerAngle) * outerRadius,
                    peakMarkerColor,
                    Math.max(1.5, thickness * 0.15),
                    { includeInLayoutBounds: false }
                );
                marker.setLineCap('round');
                if (!hasSample && peakNormalized <= 0) {
                    marker.setVisible(false);
                }
                objects.push(marker);
            }

            if (labelText && labelMode !== 'off') {
                const margin = 6;
                let textX = centerX;
                let textY = centerY + radius + margin;
                let align: CanvasTextAlign = 'center';
                let baseline: CanvasTextBaseline = 'top';

                if (textLocation === 'top') {
                    textY = centerY - radius - margin;
                    baseline = 'bottom';
                } else if (textLocation === 'track') {
                    const labelFraction = clamp01(normalized);
                    const angle = startAngle + direction * sweep * labelFraction;
                    const textRadius = radius + thickness * 0.5 + margin;
                    textX = centerX + Math.cos(angle) * textRadius;
                    textY = centerY + Math.sin(angle) * textRadius;
                }

                const text = new Text(textX, textY, labelText, '12px Arial, sans-serif', '#ffffff', align, baseline);
                text.setIncludeInLayoutBounds(false);
                objects.push(text);
            }
        }

        return objects;
    }
}
