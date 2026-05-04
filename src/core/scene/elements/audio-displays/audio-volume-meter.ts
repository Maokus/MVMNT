import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';
import { normalizeChannelSelectorInput, selectChannelSample } from '@audio/audioFeatureUtils';
import { applyOpacity } from '@utils/color';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

const DEFAULT_METER_COLOR = '#F472B6';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';

registerFeatureRequirements('audioVolumeMeter', [{ feature: 'rms' }]);

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
    // Phase 3 reference pattern: intentionally consume audio data through the public plugin API.
    constructor(id: string = 'audioVolumeMeter', config: Record<string, unknown> = {}) {
        super('audioVolumeMeter', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Volume Meter',
                description: 'Minimal RMS meter for quick debugging of audio levels.',
                category: 'Audio Displays',
            },
            [
                {
                    id: 'volumeMeterBasics',
                    label: 'Volume Meter',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        prop.audioTrack('audioTrackId', 'Audio Track'),
                        {
                            key: 'channelSelector',
                            type: 'string',
                            label: 'Channel',
                            default: null,
                            runtime: { transform: normalizeChannelSelector, defaultValue: null },
                        },
                        prop.select('orientation', 'Orientation', 'vertical', [
                            { label: 'Vertical', value: 'vertical' },
                            { label: 'Horizontal', value: 'horizontal' },
                        ]),
                        prop.number('width', 'Width (px)', 48, { step: 1 }),
                        prop.number('height', 'Height (px)', 240, { step: 1 }),
                        prop.number('minValue', 'Minimum Value', 0, { step: 0.01 }),
                        prop.number('maxValue', 'Maximum Value', 1, { step: 0.01 }),
                        prop.color('color', 'Color', DEFAULT_METER_COLOR),
                        prop.range('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                        prop.color('backgroundColor', 'Background', DEFAULT_BACKGROUND_COLOR),
                        prop.range('backgroundOpacity', 'Background Opacity', 0, { min: 0, max: 1, step: 0.01 }),
                        prop.boolean('showValue', 'Show Value Label', true),
                        {
                            key: 'smoothing',
                            type: 'number',
                            label: 'Smoothing',
                            default: 0,
                            step: 1,
                            runtime: { transform: clampSmoothing, defaultValue: 0 },
                        },
                    ],
                },
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const objects: RenderObject[] = [];
        objects.push(
            new Rectangle(
                0,
                0,
                props.width,
                props.height,
                applyOpacity(props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR, props.backgroundOpacity ?? 0)
            )
        );

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

        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead]);
        const result =
            api && status === 'ok'
                ? api.audio.sampleFeatureAtTime({
                      element: this,
                      trackId: props.audioTrackId,
                      feature: 'rms',
                      time: targetTime,
                      samplingOptions: { smoothing: props.smoothing },
                  })
                : null;
        const selected = selectChannelSample(result?.metadata.frame, props.channelSelector);
        const rawValue = selected?.values?.[0] ?? result?.values?.[0] ?? 0;
        const normalized = clamp01((rawValue - props.minValue) / Math.max(1e-6, props.maxValue - props.minValue));
        const meterColor = applyOpacity(props.color ?? DEFAULT_METER_COLOR, props.opacity ?? 1);

        if (props.orientation === 'horizontal') {
            const fillWidth = normalized * props.width;
            objects.push(new Rectangle(0, 0, fillWidth, props.height, meterColor));
        } else {
            const fillHeight = normalized * props.height;
            const y = props.height - fillHeight;
            objects.push(new Rectangle(0, y, props.width, fillHeight, meterColor));
        }

        if (props.showValue) {
            const percent = Math.round(normalized * 100);
            const labelY = props.orientation === 'horizontal' ? props.height + 16 : props.height + 16;
            objects.push(new Text(0, labelY, `${percent}%`, '12px Inter, sans-serif', '#e2e8f0', 'left', 'middle'));
        }

        return objects;
    }
}
