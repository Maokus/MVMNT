import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import {
    normalizeChannelSelectorInput,
    sampleFeatureFrame,
    selectChannelSample,
} from '../../../../audio/audioFeatureUtils';
import { registerFeatureRequirements } from '../../../../audio/audioElementMetadata';
import { normalizeColorAlphaValue } from '../utils/color';

const { descriptor: PITCH_WAVEFORM_DESCRIPTOR } = createFeatureDescriptor({ feature: 'pitchWaveform' });

const DEFAULT_LINE_COLOR = '#F472B6FF';
const DEFAULT_BACKGROUND_COLOR = '#0F172A59';

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
    constructor(id: string = 'audioLockedOscilloscope', config: Record<string, unknown> = {}) {
        super('audioLockedOscilloscope', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Locked Oscilloscope',
            description: 'Displays a single pitch-locked waveform cycle.',
            category: 'Audio Displays',
            groups: [
                ...basicGroups,
                {
                    id: 'lockedOscilloscopeBasics',
                    label: 'Pitch Waveform',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                            runtime: {
                                transform: (value, element) => asTrimmedString(value, element) ?? null,
                                defaultValue: null,
                            },
                        },
                        {
                            key: 'channelSelector',
                            type: 'string',
                            label: 'Channel',
                            default: null,
                            runtime: { transform: normalizeChannelSelector, defaultValue: null },
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 420,
                            min: 40,
                            max: 1600,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 420 },
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 140,
                            min: 20,
                            max: 800,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 140 },
                        },
                        {
                            key: 'lineColor',
                            type: 'colorAlpha',
                            label: 'Line Color',
                            default: DEFAULT_LINE_COLOR,
                            runtime: {
                                transform: (value) => normalizeColorAlphaValue(value, DEFAULT_LINE_COLOR),
                                defaultValue: DEFAULT_LINE_COLOR,
                            },
                        },
                        {
                            key: 'lineWidth',
                            type: 'number',
                            label: 'Line Width (px)',
                            default: 2,
                            min: 0.5,
                            max: 10,
                            step: 0.5,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    return numeric === undefined ? undefined : clamp(numeric, 0.5, 10);
                                },
                                defaultValue: 2,
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

        const frame = sampleFeatureFrame(props.audioTrackId, PITCH_WAVEFORM_DESCRIPTOR, targetTime);
        const selection = selectChannelSample(frame, props.channelSelector);
        const channelValues = selection?.values ?? frame?.values ?? [];

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
        const line = new Poly(points, null, props.lineColor, props.lineWidth, { includeInLayoutBounds: false });
        line.setClosed(false);
        objects.push(line);

        return objects;
    }
}
