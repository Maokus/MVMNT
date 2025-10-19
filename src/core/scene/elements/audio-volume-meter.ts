import { SceneElement, asBoolean, asNumber, asTrimmedString } from './base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { getFeatureData } from '@audio/features/sceneApi';
import { registerFeatureRequirements } from './audioElementMetadata';

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

registerFeatureRequirements('audioVolumeMeter', [{ feature: 'rms' }]);

export class AudioVolumeMeterElement extends SceneElement {
    constructor(id: string = 'audioVolumeMeter', config: Record<string, unknown> = {}) {
        super('audioVolumeMeter', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Volume Meter',
            description: 'Minimal RMS meter for quick debugging of audio levels.',
            category: 'audio',
            groups: [
                ...basicGroups,
                {
                    id: 'volumeMeterBasics',
                    label: 'Volume Meter',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                        },
                        {
                            key: 'orientation',
                            type: 'select',
                            label: 'Orientation',
                            default: 'vertical',
                            options: [
                                { label: 'Vertical', value: 'vertical' },
                                { label: 'Horizontal', value: 'horizontal' },
                            ],
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 48,
                            min: 10,
                            max: 400,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 240,
                            min: 20,
                            max: 800,
                            step: 1,
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
                            min: 0.1,
                            max: 4,
                            step: 0.01,
                        },
                        {
                            key: 'meterColor',
                            type: 'color',
                            label: 'Meter Color',
                            default: '#f472b6',
                        },
                        {
                            key: 'backgroundColor',
                            type: 'color',
                            label: 'Background',
                            default: 'rgba(15, 23, 42, 0.35)',
                        },
                        {
                            key: 'showValue',
                            type: 'boolean',
                            label: 'Show Value Label',
                            default: true,
                        },
                        {
                            key: 'smoothing',
                            type: 'number',
                            label: 'Smoothing',
                            default: 0,
                            min: 0,
                            max: 64,
                            step: 1,
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getProps({
            width: { transform: asNumber, defaultValue: 48 },
            height: { transform: asNumber, defaultValue: 240 },
            orientation: {
                transform: (value, element) => {
                    const normalized = asTrimmedString(value, element)?.toLowerCase();
                    return normalized === 'horizontal' ? 'horizontal' : normalized === 'vertical' ? 'vertical' : undefined;
                },
                defaultValue: 'vertical',
            },
            minValue: { transform: asNumber, defaultValue: 0 },
            maxValue: { transform: asNumber, defaultValue: 1 },
            meterColor: { transform: asTrimmedString, defaultValue: '#f472b6' },
            backgroundColor: {
                transform: asTrimmedString,
                defaultValue: 'rgba(15, 23, 42, 0.35)',
            },
            showValue: { transform: asBoolean, defaultValue: true },
            smoothing: { transform: asNumber, defaultValue: 0 },
            audioTrackId: {
                transform: (value, element) => asTrimmedString(value, element) ?? null,
                defaultValue: null,
            },
        });

        const {
            width,
            height,
            orientation,
            minValue,
            maxValue,
            meterColor,
            backgroundColor,
            showValue,
            smoothing: smoothingRaw,
            audioTrackId,
        } = props;
        const smoothing = clamp(smoothingRaw ?? 0, 0, 64);

        const objects: RenderObject[] = [];
        objects.push(new Rectangle(0, 0, width, height, backgroundColor));

        if (!audioTrackId) {
            objects.push(
                new Text(
                    8,
                    height / 2,
                    'Select an audio track',
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                )
            );
            return objects;
        }

        const frame = getFeatureData(this, audioTrackId, 'rms', targetTime, { smoothing });
        const rawValue = frame?.values?.[0] ?? 0;
        const normalized = clamp01((rawValue - minValue) / Math.max(1e-6, maxValue - minValue));

        if (orientation === 'horizontal') {
            const fillWidth = normalized * width;
            objects.push(new Rectangle(0, 0, fillWidth, height, meterColor));
        } else {
            const fillHeight = normalized * height;
            const y = height - fillHeight;
            objects.push(new Rectangle(0, y, width, fillHeight, meterColor));
        }

        if (showValue) {
            const percent = Math.round(normalized * 100);
            const labelY = orientation === 'horizontal' ? height + 16 : height + 16;
            objects.push(new Text(0, labelY, `${percent}%`, '12px Inter, sans-serif', '#e2e8f0', 'left', 'middle'));
        }

        return objects;
    }
}
