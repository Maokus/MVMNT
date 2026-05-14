import { SceneElement, asNumber, asTrimmedString } from '../base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';
import { normalizeColorAlphaValue, applyOpacity } from '@utils/color';
import {
    getRequiredPluginApi,
    getFeatureDataRange,
    PLUGIN_CAPABILITIES,
    type FeatureDataResult,
    type RequiredPluginApiResult,
} from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, BLEND_MODE_CHOICES, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

const { descriptor: PEAKS_DESCRIPTOR } = createFeatureDescriptor({ feature: 'peaks' });

const DEFAULT_PRIMARY_COLOR = '#22D3EE';
const DEFAULT_SECONDARY_COLOR = '#F472B6';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';

type PeaksChannel = 'left' | 'right' | 'mid' | 'side';

const DEFAULT_PRIMARY_CHANNEL: PeaksChannel = 'left';
const DEFAULT_SECONDARY_CHANNEL: PeaksChannel = 'right';

registerFeatureRequirements('audioPeaks', [{ feature: 'peaks' }]);

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function normalizePeaksChannel(value: unknown, fallback: PeaksChannel): PeaksChannel {
    if (value === 'left' || value === 'right' || value === 'mid' || value === 'side') {
        return value;
    }
    return fallback;
}

interface PeakSeries {
    mins: number[];
    maxes: number[];
}

function extractPeakSeries(samples: FeatureDataResult[], channel: PeaksChannel, gain: number): PeakSeries {
    const mins: number[] = [];
    const maxes: number[] = [];
    const safeGain = Math.max(0, gain);

    for (const sample of samples) {
        const cv = sample.metadata.frame.channelValues;
        if (!cv || cv.length === 0) {
            mins.push(0);
            maxes.push(0);
            continue;
        }

        const isMinMax = sample.metadata.frame.format === 'waveform-minmax';
        let min: number;
        let max: number;

        if (isMinMax) {
            const leftPair = cv[0] ?? [0, 0];
            const rightPair = cv[1] ?? leftPair;
            const leftMin = leftPair[0] ?? 0;
            const leftMax = leftPair[1] ?? leftMin;
            const rightMin = rightPair[0] ?? 0;
            const rightMax = rightPair[1] ?? rightMin;

            switch (channel) {
                case 'left':
                    min = leftMin;
                    max = leftMax;
                    break;
                case 'right':
                    min = rightMin;
                    max = rightMax;
                    break;
                case 'mid':
                    min = (leftMin + rightMin) / 2;
                    max = (leftMax + rightMax) / 2;
                    break;
                case 'side':
                    min = (leftMin - rightMax) / 2;
                    max = (leftMax - rightMin) / 2;
                    break;
            }
        } else {
            const leftVal = cv[0]?.[0] ?? 0;
            const rightVal = cv[1]?.[0] ?? leftVal;
            switch (channel) {
                case 'left':
                    min = max = leftVal;
                    break;
                case 'right':
                    min = max = rightVal;
                    break;
                case 'mid':
                    min = max = (leftVal + rightVal) / 2;
                    break;
                case 'side':
                    min = max = (leftVal - rightVal) / 2;
                    break;
            }
        }

        mins.push(clamp(min * safeGain, -1, 1));
        maxes.push(clamp(max * safeGain, -1, 1));
    }

    return { mins, maxes };
}

function renderPeaksEnvelope(
    series: PeakSeries,
    width: number,
    height: number,
    color: string,
    objects: RenderObject[]
): void {
    const { mins, maxes } = series;
    if (mins.length === 0) return;

    const count = mins.length;
    const centerY = height / 2;
    const verticalScale = height / 2;
    const denom = Math.max(1, count - 1);

    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < count; i++) {
        const x = denom === 0 ? width / 2 : (i / denom) * width;
        const y = centerY - (maxes[i] ?? 0) * verticalScale;
        points.push({ x, y });
    }

    for (let i = count - 1; i >= 0; i--) {
        const x = denom === 0 ? width / 2 : (i / denom) * width;
        const y = centerY - (mins[i] ?? 0) * verticalScale;
        points.push({ x, y });
    }

    const poly = new Poly(points, color, null, 0, { includeInLayoutBounds: false });
    poly.setClosed(true);
    objects.push(poly);
}

export class AudioPeaksElement extends SceneElement {
    constructor(id: string = 'audioPeaks', config: Record<string, unknown> = {}) {
        super('audioPeaks', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Peaks',
                description: 'Displays a min/max peaks envelope for an audio track.',
                category: 'Audio Displays',
            },
            [
                tab.content([
                    propGroup.audioSource(),
                    {
                        id: 'peaks',
                        label: 'Peaks',
                        collapsed: false,
                        properties: [
                            prop.number('width', 'Width (px)', 800, { step: 1 }),
                            prop.number('height', 'Height (px)', 200, { step: 1 }),
                            {
                                key: 'windowSeconds',
                                type: 'number',
                                label: 'Window (seconds)',
                                default: 2,
                                step: 0.1,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0.1, 100);
                                    },
                                    defaultValue: 2,
                                },
                            },
                            {
                                key: 'startOffset',
                                type: 'number',
                                label: 'Start Offset',
                                default: 0.5,
                                step: 0.01,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0, 1);
                                    },
                                    defaultValue: 0.5,
                                },
                            },
                            {
                                key: 'gain',
                                type: 'number',
                                label: 'Gain',
                                default: 1,
                                step: 0.1,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0, 10);
                                    },
                                    defaultValue: 1,
                                },
                            },
                            prop.boolean('showPlayhead', 'Show Playhead', false),
                        ],
                    },
                    {
                        id: 'primaryChannel',
                        label: 'Primary Channel',
                        collapsed: false,
                        properties: [
                            {
                                key: 'primaryChannel',
                                type: 'select',
                                label: 'Channel',
                                default: DEFAULT_PRIMARY_CHANNEL,
                                options: [
                                    { label: 'Left', value: 'left' },
                                    { label: 'Right', value: 'right' },
                                    { label: 'Mid (L+R)', value: 'mid' },
                                    { label: 'Side (L-R)', value: 'side' },
                                ],
                                runtime: {
                                    transform: (value) => normalizePeaksChannel(value, DEFAULT_PRIMARY_CHANNEL),
                                    defaultValue: DEFAULT_PRIMARY_CHANNEL,
                                },
                            },
                        ],
                    },
                    {
                        id: 'secondaryChannel',
                        label: 'Secondary Channel',
                        collapsed: false,
                        properties: [
                            {
                                key: 'secondaryChannel',
                                type: 'select',
                                label: 'Channel',
                                default: DEFAULT_SECONDARY_CHANNEL,
                                options: [
                                    { label: 'Left', value: 'left' },
                                    { label: 'Right', value: 'right' },
                                    { label: 'Mid (L+R)', value: 'mid' },
                                    { label: 'Side (L-R)', value: 'side' },
                                ],
                                runtime: {
                                    transform: (value) => normalizePeaksChannel(value, DEFAULT_SECONDARY_CHANNEL),
                                    defaultValue: DEFAULT_SECONDARY_CHANNEL,
                                },
                            },
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'primaryColors',
                        label: 'Colors',
                        collapsed: false,
                        properties: [
                            prop.color('color', 'Primary Color', DEFAULT_PRIMARY_COLOR),
                            prop.range('opacity', 'Primary Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                            prop.select(
                                'primaryBlendMode',
                                'Blend Mode',
                                'source-over',
                                BLEND_MODE_CHOICES as unknown as Array<{ value: string; label: string }>,
                                { description: 'Canvas composite blending operation.' }
                            ),
                        ],
                    },
                    {
                        id: 'secondaryColors',
                        label: 'Secondary Colors',
                        collapsed: false,
                        properties: [
                            {
                                key: 'secondaryColor',
                                type: 'color',
                                label: 'Secondary Color',
                                default: DEFAULT_SECONDARY_COLOR,
                                runtime: {
                                    transform: (value) => {
                                        if (!value) return DEFAULT_SECONDARY_COLOR;
                                        const normalized = normalizeColorAlphaValue(
                                            value as string,
                                            DEFAULT_SECONDARY_COLOR
                                        );
                                        return normalized.slice(0, 7);
                                    },
                                    defaultValue: DEFAULT_SECONDARY_COLOR,
                                },
                            },
                            prop.range('secondaryOpacity', 'Secondary Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                            prop.select(
                                'secondaryBlendMode',
                                'Blend Mode',
                                'source-over',
                                BLEND_MODE_CHOICES as unknown as Array<{ value: string; label: string }>,
                                { description: 'Canvas composite blending operation.' }
                            ),
                        ],
                    },
                    {
                        id: 'background',
                        label: 'Background',
                        collapsed: true,
                        properties: [
                            {
                                key: 'backgroundColor',
                                type: 'color',
                                label: 'Background Color',
                                default: DEFAULT_BACKGROUND_COLOR,
                                runtime: { transform: asTrimmedString, defaultValue: DEFAULT_BACKGROUND_COLOR },
                            },
                            {
                                key: 'backgroundOpacity',
                                type: 'range',
                                label: 'Background Opacity',
                                default: 0,
                                min: 0,
                                max: 1,
                                step: 0.01,
                                runtime: { transform: asNumber, defaultValue: 0 },
                            },
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = props.width ?? 800;
        const height = props.height ?? 200;
        const windowSeconds = clamp(typeof props.windowSeconds === 'number' ? props.windowSeconds : 2, 0.1, 100);
        const startOffset = clamp(typeof props.startOffset === 'number' ? props.startOffset : 0.5, 0, 1);
        const gain = clamp(typeof props.gain === 'number' ? props.gain : 1, 0, 10);
        const primaryChannel = normalizePeaksChannel(props.primaryChannel, DEFAULT_PRIMARY_CHANNEL);
        const secondaryChannel = normalizePeaksChannel(props.secondaryChannel, DEFAULT_SECONDARY_CHANNEL);
        const primaryColor = applyOpacity(props.color ?? DEFAULT_PRIMARY_COLOR, props.opacity ?? 1);
        const secondaryColor = applyOpacity(
            props.secondaryColor ?? DEFAULT_SECONDARY_COLOR,
            props.secondaryOpacity ?? 1
        );
        const primaryBlendMode = (props.primaryBlendMode ?? 'source-over') as GlobalCompositeOperation;
        const secondaryBlendMode = (props.secondaryBlendMode ?? 'source-over') as GlobalCompositeOperation;
        const showPlayhead = props.showPlayhead === true;

        const objects: RenderObject[] = [];
        objects.push(
            new Rectangle(
                0,
                0,
                width,
                height,
                applyOpacity(props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR, props.backgroundOpacity ?? 0)
            )
        );

        const pushMessage = (message: string) => {
            objects.push(new Text(8, height / 2, message, '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        };

        if (!props.audioTrackId) {
            return pushMessage('Select an audio track');
        }

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioFeaturesRead]) as RequiredPluginApiResult;

        if (!host.ok) {
            return pushMessage('Audio not available');
        }

        const startSeconds = targetTime - windowSeconds * startOffset;
        const endSeconds = startSeconds + windowSeconds;
        const stepSec = Math.max(1 / 240, windowSeconds / Math.max(32, Math.min(Math.round(width), 400)));

        const samples = getFeatureDataRange(
            this,
            props.audioTrackId,
            PEAKS_DESCRIPTOR,
            startSeconds,
            endSeconds,
            stepSec
        );

        if (samples.length === 0) {
            return pushMessage('No peaks data');
        }

        const primarySeries = extractPeakSeries(samples, primaryChannel, gain);
        const secondarySeries =
            secondaryChannel !== primaryChannel ? extractPeakSeries(samples, secondaryChannel, gain) : null;

        if (primarySeries.mins.length < 2 && (!secondarySeries || secondarySeries.mins.length < 2)) {
            return pushMessage('Peaks too short');
        }

        if (secondarySeries && secondarySeries.mins.length >= 2) {
            const secondaryStart = objects.length;
            renderPeaksEnvelope(secondarySeries, width, height, secondaryColor, objects);
            if (secondaryBlendMode !== 'source-over') {
                for (let i = secondaryStart; i < objects.length; i++) {
                    objects[i].blendMode = secondaryBlendMode;
                }
            }
        }

        if (primarySeries.mins.length >= 2) {
            const primaryStart = objects.length;
            renderPeaksEnvelope(primarySeries, width, height, primaryColor, objects);
            if (primaryBlendMode !== 'source-over') {
                for (let i = primaryStart; i < objects.length; i++) {
                    objects[i].blendMode = primaryBlendMode;
                }
            }
        }

        if (showPlayhead) {
            const playheadX = startOffset * width;
            const playheadLine = new Poly(
                [
                    { x: playheadX, y: 0 },
                    { x: playheadX, y: height },
                ],
                null,
                primaryColor,
                1,
                { includeInLayoutBounds: false }
            );
            playheadLine.setClosed(false).setLineJoin('round').setLineCap('round');
            objects.push(playheadLine);
        }

        return objects;
    }
}
