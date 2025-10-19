import { SceneElement, asNumber, asTrimmedString } from './base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { sampleAudioFeatureRange } from '@state/selectors/audioFeatureSelectors';
import { resolveDescriptorChannel } from './audioFeatureUtils';
import { registerFeatureRequirements } from './audioElementMetadata';

const { descriptor: WAVEFORM_DESCRIPTOR } = createFeatureDescriptor({ feature: 'waveform' });

registerFeatureRequirements('audioOscilloscope', [{ feature: 'waveform' }]);

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function ensurePointCount(width: number, fallback: number): number {
    const desired = Math.max(2, Math.round(width));
    return Math.max(desired, fallback);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function upsampleLinear(values: number[], targetCount: number): number[] {
    if (targetCount <= 0) return [];
    if (!values.length) return Array.from({ length: targetCount }, () => 0);
    if (values.length === 1) return Array.from({ length: targetCount }, () => values[0] ?? 0);
    if (targetCount === values.length) return [...values];
    const result: number[] = new Array(targetCount);
    const sourceMaxIndex = values.length - 1;
    const denom = targetCount - 1;
    for (let i = 0; i < targetCount; i += 1) {
        const position = denom === 0 ? 0 : (i / denom) * sourceMaxIndex;
        const leftIndex = Math.floor(position);
        const frac = position - leftIndex;
        const left = values[leftIndex] ?? values[sourceMaxIndex] ?? 0;
        const right = values[leftIndex + 1] ?? left;
        result[i] = lerp(left, right, frac);
    }
    return result;
}

function downsampleAveraged(values: number[], targetCount: number): number[] {
    if (targetCount <= 0) return [];
    if (!values.length) return Array.from({ length: targetCount }, () => 0);
    if (targetCount >= values.length) return [...values];
    const result: number[] = new Array(targetCount);
    const bucketSize = values.length / targetCount;
    for (let bucket = 0; bucket < targetCount; bucket += 1) {
        const start = Math.floor(bucket * bucketSize);
        const end = Math.floor((bucket + 1) * bucketSize);
        let total = 0;
        let count = 0;
        for (let i = start; i < end && i < values.length; i += 1) {
            total += values[i] ?? 0;
            count += 1;
        }
        if (count === 0) {
            const clampIndex = Math.min(values.length - 1, Math.max(0, Math.round(bucket * bucketSize)));
            result[bucket] = values[clampIndex] ?? 0;
        } else {
            result[bucket] = total / count;
        }
    }
    return result;
}

function normalizeForDisplay(values: number[], targetCount: number): number[] {
    if (targetCount <= 0) return [];
    if (values.length <= 1) {
        const fill = values[0] ?? 0;
        return Array.from({ length: targetCount }, () => fill);
    }
    if (values.length === targetCount) {
        return [...values];
    }
    if (values.length < targetCount) {
        return upsampleLinear(values, targetCount);
    }
    return downsampleAveraged(values, targetCount);
}

function buildPolylinePoints(values: number[], width: number, height: number): { x: number; y: number }[] {
    if (!values.length) return [];
    const verticalScale = height / 2;
    const normalizedWidth = Math.max(0, width);
    const denom = Math.max(1, values.length - 1);
    return values.map((value, index) => {
        const x = denom === 0 ? normalizedWidth / 2 : (index / denom) * normalizedWidth;
        const y = height / 2 - value * verticalScale;
        return { x, y };
    });
}

export class AudioOscilloscopeElement extends SceneElement {
    constructor(id: string = 'audioOscilloscope', config: Record<string, unknown> = {}) {
        super('audioOscilloscope', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Oscilloscope',
            description: 'Simple waveform preview for debugging audio features.',
            category: 'audio',
            groups: [
                ...basicGroups,
                {
                    id: 'oscilloscopeBasics',
                    label: 'Oscilloscope',
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
                            key: 'windowSeconds',
                            type: 'number',
                            label: 'Window (seconds)',
                            default: 0.12,
                            min: 0.01,
                            max: 0.5,
                            step: 0.01,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    return numeric === undefined ? undefined : clamp(numeric, 0.01, 1);
                                },
                                defaultValue: 0.12,
                            },
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
                            type: 'color',
                            label: 'Line Color',
                            default: '#22d3ee',
                            runtime: { transform: asTrimmedString, defaultValue: '#22d3ee' },
                        },
                        {
                            key: 'lineWidth',
                            type: 'number',
                            label: 'Line Width (px)',
                            default: 2,
                            min: 1,
                            max: 6,
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
                            type: 'color',
                            label: 'Background',
                            default: 'rgba(15, 23, 42, 0.35)',
                            runtime: {
                                transform: asTrimmedString,
                                defaultValue: 'rgba(15, 23, 42, 0.35)',
                            },
                        },
                        {
                            key: 'smoothing',
                            type: 'number',
                            label: 'Smoothing',
                            default: 0,
                            min: 0,
                            max: 64,
                            step: 1,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    return numeric === undefined ? undefined : clamp(numeric, 0, 64);
                                },
                                defaultValue: 0,
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
        const smoothingRadius = Math.max(0, Math.round(props.smoothing));

        const descriptor = WAVEFORM_DESCRIPTOR;

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

        const timing = getSharedTimingManager();
        const halfWindow = props.windowSeconds / 2;
        const startSeconds = Math.max(0, targetTime - halfWindow);
        const endSeconds = startSeconds + props.windowSeconds;
        const startTick = Math.floor(timing.secondsToTicks(startSeconds));
        const endTick = Math.max(startTick + 1, Math.ceil(timing.secondsToTicks(endSeconds)));

        const state = useTimelineStore.getState();
        const channelIndex = resolveDescriptorChannel(props.audioTrackId, descriptor);
        const range = sampleAudioFeatureRange(state, props.audioTrackId, descriptor.featureKey, startTick, endTick, {
            channelIndex: channelIndex ?? undefined,
            smoothing: smoothingRadius,
        });

        if (!range || range.frameCount < 2 || !range.data?.length) {
            objects.push(
                new Text(8, props.height / 2, 'No waveform data', '12px Inter, sans-serif', '#94a3b8', 'left', 'middle')
            );
            return objects;
        }

        const channelStride = Math.max(1, range.channels || 1);

        if (range.format === 'waveform-minmax') {
            const waveformChannels = Math.max(1, Math.floor(channelStride / 2) || 1);
            const channelValues = Array.from({ length: waveformChannels }, () => [] as number[]);
            for (let frame = 0; frame < range.frameCount; frame += 1) {
                const baseIndex = frame * channelStride;
                for (let channel = 0; channel < waveformChannels; channel += 1) {
                    const pairIndex = baseIndex + channel * 2;
                    const min = range.data[pairIndex] ?? 0;
                    const max = range.data[pairIndex + 1] ?? min;
                    channelValues[channel].push(clamp((min + max) / 2, -1, 1));
                }
            }

            const hasRenderableChannel = channelValues.some((values) => values.length >= 2);
            if (!hasRenderableChannel) {
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

            channelValues.forEach((values, channelIndex) => {
                if (values.length < 2) {
                    return;
                }
                const targetCount = ensurePointCount(props.width, values.length);
                const normalizedValues = normalizeForDisplay(values, targetCount);
                const points = buildPolylinePoints(normalizedValues, props.width, props.height);
                const line = new Poly(points, null, props.lineColor, props.lineWidth, {
                    includeInLayoutBounds: false,
                });
                line.setClosed(false);
                if (channelIndex > 0) {
                    line.setGlobalAlpha(0.7);
                    line.setLineDash([6, 4]);
                }
                objects.push(line);
            });

            return objects;
        }

        const values: number[] = [];
        for (let frame = 0; frame < range.frameCount; frame += 1) {
            const baseIndex = frame * channelStride;
            values.push(clamp(range.data[baseIndex] ?? 0, -1, 1));
        }

        if (values.length < 2) {
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

        const targetCount = ensurePointCount(props.width, values.length);
        const normalizedValues = normalizeForDisplay(values, targetCount);
        const points = buildPolylinePoints(normalizedValues, props.width, props.height);

        const line = new Poly(points, null, props.lineColor, props.lineWidth, { includeInLayoutBounds: false });
        line.setClosed(false);
        objects.push(line);

        return objects;
    }
}
