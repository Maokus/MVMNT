import { SceneElement, asBoolean, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { getFeatureData } from '@audio/features/sceneApi';
import { registerFeatureRequirements } from '../../../../audio/audioElementMetadata';
import { normalizeChannelSelectorInput, selectChannelSample } from '../../../../audio/audioFeatureUtils';
import { normalizeColorAlphaValue } from '../../../../utils/color';

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

const DEFAULT_METER_COLOR = '#F472B6FF';
const DEFAULT_BACKGROUND_COLOR = '#0F172A59';

registerFeatureRequirements('audioVolumeMeter', [{ feature: 'rms' }]);

const normalizeOrientation: PropertyTransform<'vertical' | 'horizontal', SceneElementInterface> = (value, element) => {
    const normalized = asTrimmedString(value, element)?.toLowerCase();
    return normalized === 'horizontal' ? 'horizontal' : 'vertical';
};

const normalizeAudioTrackId: PropertyTransform<string | null, SceneElementInterface> = (value, element) =>
    asTrimmedString(value, element) ?? null;

const clampSmoothing: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) {
        return undefined;
    }
    return clamp(numeric, 0, 64);
};

const normalizeChannelSelector: PropertyTransform<string | number | null, SceneElementInterface> = (value) =>
    normalizeChannelSelectorInput(value);

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
            category: 'Audio Displays',
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
                            runtime: { transform: normalizeAudioTrackId, defaultValue: null },
                        },
                        {
                            key: 'channelSelector',
                            type: 'string',
                            label: 'Channel',
                            default: null,
                            runtime: { transform: normalizeChannelSelector, defaultValue: null },
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
                            runtime: { transform: normalizeOrientation, defaultValue: 'vertical' },
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 48,
                            min: 10,
                            max: 400,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 48 },
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 240,
                            min: 20,
                            max: 800,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 240 },
                        },
                        {
                            key: 'minValue',
                            type: 'number',
                            label: 'Minimum Value',
                            default: 0,
                            min: 0,
                            max: 1,
                            step: 0.01,
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'maxValue',
                            type: 'number',
                            label: 'Maximum Value',
                            default: 1,
                            min: 0.1,
                            max: 4,
                            step: 0.01,
                            runtime: { transform: asNumber, defaultValue: 1 },
                        },
                        {
                            key: 'meterColor',
                            type: 'colorAlpha',
                            label: 'Meter Color',
                            default: DEFAULT_METER_COLOR,
                            runtime: {
                                transform: (value) => normalizeColorAlphaValue(value, DEFAULT_METER_COLOR),
                                defaultValue: DEFAULT_METER_COLOR,
                            },
                        },
                        {
                            key: 'backgroundColor',
                            type: 'colorAlpha',
                            label: 'Background',
                            default: DEFAULT_BACKGROUND_COLOR,
                            runtime: {
                                transform: (value) => normalizeColorAlphaValue(value, DEFAULT_BACKGROUND_COLOR),
                                defaultValue: DEFAULT_BACKGROUND_COLOR,
                            },
                        },
                        {
                            key: 'showValue',
                            type: 'boolean',
                            label: 'Show Value Label',
                            default: true,
                            runtime: { transform: asBoolean, defaultValue: true },
                        },
                        {
                            key: 'smoothing',
                            type: 'number',
                            label: 'Smoothing',
                            default: 0,
                            min: 0,
                            max: 64,
                            step: 1,
                            runtime: { transform: clampSmoothing, defaultValue: 0 },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const objects: RenderObject[] = [];
        objects.push(new Rectangle(0, 0, props.width, props.height, props.backgroundColor));

        if (!props.audioTrackId) {
            objects.push(
                new Text(
                    8,
                    props.height / 2,
                    'Select an audio track',
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                )
            );
            return objects;
        }

        const result = getFeatureData(this, props.audioTrackId, 'rms', targetTime, { smoothing: props.smoothing });
        const selected = selectChannelSample(result?.metadata.frame, props.channelSelector);
        const rawValue = selected?.values?.[0] ?? result?.values?.[0] ?? 0;
        const normalized = clamp01((rawValue - props.minValue) / Math.max(1e-6, props.maxValue - props.minValue));

        if (props.orientation === 'horizontal') {
            const fillWidth = normalized * props.width;
            objects.push(new Rectangle(0, 0, fillWidth, props.height, props.meterColor));
        } else {
            const fillHeight = normalized * props.height;
            const y = props.height - fillHeight;
            objects.push(new Rectangle(0, y, props.width, fillHeight, props.meterColor));
        }

        if (props.showValue) {
            const percent = Math.round(normalized * 100);
            const labelY = props.orientation === 'horizontal' ? props.height + 16 : props.height + 16;
            objects.push(new Text(0, labelY, `${percent}%`, '12px Inter, sans-serif', '#e2e8f0', 'left', 'middle'));
        }

        return objects;
    }
}
