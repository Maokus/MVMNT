import { SceneElement, asNumber, type PropertyTransform } from '../base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { normalizeChannelSelectorInput, sampleFeatureFrame, selectChannelSample } from '@audio/audioFeatureUtils';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';
import { applyOpacity } from '@utils/color';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

const { descriptor: PITCH_WAVEFORM_DESCRIPTOR } = createFeatureDescriptor({ feature: 'pitchWaveform' });

const DEFAULT_LINE_COLOR = '#F472B6';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';

registerFeatureRequirements('audioLockedOscilloscope', [{ feature: 'pitchWaveform' }]);

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function buildPolylinePoints(values: number[], width: number, height: number): { x: number; y: number }[] {
    if (values.length <= 0) return [];
    const verticalScale = height / 2;
    const denom = Math.max(1, values.length - 1);
    return values.map((value, index) => {
        const x = (index / denom) * Math.max(0, width);
        const y = height / 2 - value * verticalScale;
        return { x, y };
    });
}

const normalizeChannelSelector: PropertyTransform<string | number | null, SceneElementInterface> = (value) =>
    normalizeChannelSelectorInput(value);

export class AudioLockedOscilloscopeElement extends SceneElement {
    // Phase 3 reference pattern: intentionally consume audio data through the public plugin API.
    constructor(id: string = 'audioLockedOscilloscope', config: Record<string, unknown> = {}) {
        super('audioLockedOscilloscope', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Locked Oscilloscope',
                description: 'Displays a single pitch-locked waveform cycle.',
                category: 'Audio Displays',
            },
            [
                tab.content([
                    propGroup.audioSource(),
                    {
                        id: 'lockedOscilloscope',
                        label: 'Waveform',
                        collapsed: false,
                        properties: [
                            {
                                key: 'channelSelector',
                                type: 'string',
                                label: 'Channel',
                                default: null,
                                runtime: { transform: normalizeChannelSelector, defaultValue: null },
                            },
                            prop.number('width', 'Width (px)', 420, { step: 1 }),
                            prop.number('height', 'Height (px)', 140, { step: 1 }),
                            {
                                key: 'lineWidth',
                                type: 'number',
                                label: 'Line Width (px)',
                                default: 2,
                                step: 0.5,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0.5, 10);
                                    },
                                    defaultValue: 2,
                                },
                            },
                            prop.color('backgroundColor', 'Background', DEFAULT_BACKGROUND_COLOR),
                            prop.range('backgroundOpacity', 'Background Opacity', 0, { min: 0, max: 1, step: 0.01 }),
                        ],
                    },
                ]),
                tab.appearance([propGroup.appearance({ blendMode: true })]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const blendMode = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;
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
        const sample =
            api && status === 'ok'
                ? api.audio.sampleFeatureAtTime({
                      element: this,
                      trackId: props.audioTrackId,
                      feature: PITCH_WAVEFORM_DESCRIPTOR,
                      time: targetTime,
                  })
                : null;

        const frame =
            sample?.metadata.frame ?? sampleFeatureFrame(props.audioTrackId, PITCH_WAVEFORM_DESCRIPTOR, targetTime);
        const selection = selectChannelSample(frame, props.channelSelector);
        const channelValues = selection?.values ?? sample?.values ?? frame?.values ?? [];

        if (!channelValues.length) {
            objects.push(
                new Text(
                    8,
                    props.height / 2,
                    'Pitch waveform unavailable',
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                )
            );
            return objects;
        }

        const sampleFrame = frame ?? null;
        const sampleLength = (() => {
            const explicit = sampleFrame?.frameLength;
            if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
                return Math.min(channelValues.length, Math.floor(explicit));
            }
            return channelValues.length;
        })();

        if (sampleLength < 2) {
            objects.push(
                new Text(
                    8,
                    props.height / 2,
                    'Waveform too short',
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                )
            );
            return objects;
        }

        const values = channelValues.slice(0, sampleLength).map((value) => clamp(value ?? 0, -1, 1));
        const points = buildPolylinePoints(values, props.width, props.height);
        const lineColor = applyOpacity(props.color ?? DEFAULT_LINE_COLOR, props.opacity ?? 1);
        const line = new Poly(points, null, lineColor, props.lineWidth, { includeInLayoutBounds: false });
        line.setClosed(false);
        line.blendMode = blendMode === 'source-over' ? null : blendMode;
        objects.push(line);

        return objects;
    }
}
