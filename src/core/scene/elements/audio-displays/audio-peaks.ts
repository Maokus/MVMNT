import { SceneElement, asNumber, asTrimmedString } from '../base';
import { Line, Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { normalizeColorAlphaValue, applyOpacity } from '@utils/color';
import { PLUGIN_CAPABILITIES } from '@mvmnt-app/plugin-sdk';
import { prop, insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, BLEND_MODE_CHOICES, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';
import { defineHostAdaptedBuiltIn, getEnginePrivateContext } from '@core/scene/plugins/built-in-definition';

const DEFAULT_PRIMARY_COLOR = '#22D3EE';
const DEFAULT_SECONDARY_COLOR = '#F472B6';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';

type PeaksChannel = 'left' | 'right' | 'mid' | 'side';

const DEFAULT_PRIMARY_CHANNEL: PeaksChannel = 'left';
const DEFAULT_SECONDARY_CHANNEL: PeaksChannel = 'right';

type FeatureDataResult = { values: number[]; metadata: any };
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
    xPositions: number[];
}

function extractPeakSeries(
    samples: Array<FeatureDataResult | null>,
    xPositions: number[],
    channel: PeaksChannel,
    gain: number
): PeakSeries {
    const mins: number[] = [];
    const maxes: number[] = [];
    const safeGain = Math.max(0, gain);

    for (const sample of samples) {
        const cv = sample?.metadata.frame.channelValues;
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

    return { mins, maxes, xPositions };
}

function renderPeaksEnvelope(
    series: PeakSeries,
    width: number,
    height: number,
    color: string,
    objects: RenderObject[]
): void {
    const { mins, maxes, xPositions } = series;
    if (mins.length === 0) return;

    const count = mins.length;
    const centerY = height / 2;
    const verticalScale = height / 2;

    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < count; i++) {
        const x = xPositions[i] ?? 0;
        const y = centerY - (maxes[i] ?? 0) * verticalScale;
        points.push({ x, y });
    }

    for (let i = count - 1; i >= 0; i--) {
        const x = xPositions[i] ?? width;
        const y = centerY - (mins[i] ?? 0) * verticalScale;
        points.push({ x, y });
    }

    const poly = new Poly(points, {
        fillColor: color,
        strokeColor: null,
        strokeWidth: 0,
        layoutParticipation: 'exclude',
    });
    poly.setClosed(true);
    objects.push(poly);
}

function aggregatePeakSeries(
    samples: Array<FeatureDataResult | null>,
    firstSampleIndex: number,
    firstBucketIndex: number,
    lastBucketIndex: number,
    samplesPerBucket: number,
    bucketSeconds: number,
    startSeconds: number,
    windowSeconds: number,
    width: number,
    channel: PeaksChannel,
    gain: number
): PeakSeries {
    const detail = extractPeakSeries(samples, [], channel, gain);
    const mins: number[] = [];
    const maxes: number[] = [];
    const xPositions: number[] = [];

    for (let bucket = firstBucketIndex; bucket <= lastBucketIndex; bucket += 1) {
        const firstDetailIndex = bucket * samplesPerBucket - firstSampleIndex;
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (let offset = 0; offset < samplesPerBucket; offset += 1) {
            const index = firstDetailIndex + offset;
            const sampleMin = detail.mins[index];
            const sampleMax = detail.maxes[index];
            if (sampleMin !== undefined) min = Math.min(min, sampleMin);
            if (sampleMax !== undefined) max = Math.max(max, sampleMax);
        }
        mins.push(Number.isFinite(min) ? min : 0);
        maxes.push(Number.isFinite(max) ? max : 0);
        xPositions.push(clamp(((bucket * bucketSeconds - startSeconds) / windowSeconds) * width, 0, width));
    }

    return { mins, maxes, xPositions };
}

export class AudioPeaksElement extends SceneElement {
    private _peakSampleCacheKey: string | null = null;
    private _peakSamples = new Map<number, FeatureDataResult>();

    constructor(id: string = 'audioPeaks', config: Record<string, unknown> = {}) {
        super('audioPeaks', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
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
                            prop.boolean('showBarLines', 'Show Bar Lines', false),
                            prop.color('barLineColor', 'Bar Line Color', '#94A3B8'),
                            prop.number('barLineLength', 'Bar Line Length (px)', 200, {
                                min: 0,
                                max: 10_000,
                                step: 1,
                            }),
                            prop.boolean('showBeatLines', 'Show Beat Lines', false),
                            prop.color('beatLineColor', 'Beat Line Color', '#64748B'),
                            prop.number('beatLineLength', 'Beat Line Length (px)', 200, {
                                min: 0,
                                max: 10_000,
                                step: 1,
                            }),
                            prop.number('beatGridOpacity', 'Line Opacity', 0.45, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                            }),
                            prop.number('beatGridWidth', 'Line Width (px)', 1, { min: 0.5, max: 8, step: 0.5 }),
                        ],
                        layout: [{ kind: 'control', control: 'slider', bindings: { value: 'beatGridOpacity' } }, { kind: 'property', propertyKey: 'beatGridOpacity' }],
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
                            prop.number('opacity', 'Primary Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                            prop.select(
                                'primaryBlendMode',
                                'Blend Mode',
                                'source-over',
                                BLEND_MODE_CHOICES as unknown as Array<{ value: string; label: string }>,
                                { description: 'Canvas composite blending operation.' }
                            ),
                        ],
                        layout: [{ kind: 'control', control: 'slider', bindings: { value: 'opacity' } }, { kind: 'property', propertyKey: 'opacity' }],
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
                            prop.number('secondaryOpacity', 'Secondary Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                            prop.select(
                                'secondaryBlendMode',
                                'Blend Mode',
                                'source-over',
                                BLEND_MODE_CHOICES as unknown as Array<{ value: string; label: string }>,
                                { description: 'Canvas composite blending operation.' }
                            ),
                        ],
                        layout: [{ kind: 'control', control: 'slider', bindings: { value: 'secondaryOpacity' } }, { kind: 'property', propertyKey: 'secondaryOpacity' }],
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
                                type: 'number',
                                label: 'Background Opacity',
                                default: 0,
                                min: 0,
                                max: 1,
                                step: 0.01,
                                runtime: { transform: asNumber, defaultValue: 0 },
                            },
                        ],
                        layout: [{ kind: 'control', control: 'slider', bindings: { value: 'backgroundOpacity' } }, { kind: 'property', propertyKey: 'backgroundOpacity' }],
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
        const showBarLines = props.showBarLines === true;
        const showBeatLines = props.showBeatLines === true;

        const objects: RenderObject[] = [];
        objects.push(
            new Rectangle(0, 0, width, height, {
                fillColor: applyOpacity(
                    props.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
                    props.backgroundOpacity ?? 0
                ),
            })
        );

        const pushMessage = (message: string) => {
            objects.push(
                new Text(8, height / 2, message, '12px Inter, sans-serif', { color: '#94a3b8', baseline: 'middle' })
            );
            return objects;
        };

        if (!props.audioTrackId) {
            return pushMessage('Select an audio track');
        }

        const context = getEnginePrivateContext(this);
        if (!context.audio) {
            return pushMessage('Audio not available');
        }

        const startSeconds = targetTime - windowSeconds * startOffset;
        const endSeconds = startSeconds + windowSeconds;
        const bucketSeconds = Math.max(1 / 240, windowSeconds / Math.max(32, Math.min(Math.round(width), 400)));
        const samplesPerBucket = Math.min(8, Math.max(1, Math.ceil(bucketSeconds * 240)));
        const stepSec = bucketSeconds / samplesPerBucket;

        // Keep peak windows on a fixed absolute-time grid. Previously every render shifted the
        // sampling grid with the playhead, so every point could select a different peak window
        // and make the entire envelope flicker. Cached windows now keep their value while their
        // x position moves smoothly through the viewport.
        const cacheKey = `${props.audioTrackId}:${stepSec}`;
        if (this._peakSampleCacheKey !== cacheKey) {
            this._peakSampleCacheKey = cacheKey;
            this._peakSamples.clear();
        }
        const firstBucketIndex = Math.floor(startSeconds / bucketSeconds);
        const lastBucketIndex = Math.ceil(endSeconds / bucketSeconds);
        const firstSampleIndex = firstBucketIndex * samplesPerBucket;
        const lastSampleIndex = (lastBucketIndex + 1) * samplesPerBucket - 1;
        const missingRanges: Array<{ start: number; end: number }> = [];
        for (let index = firstSampleIndex; index <= lastSampleIndex; ) {
            if (index * stepSec < 0) {
                index += 1;
                continue;
            }
            if (this._peakSamples.has(index)) {
                index += 1;
                continue;
            }
            const start = index;
            while (index <= lastSampleIndex && index * stepSec >= 0 && !this._peakSamples.has(index)) index += 1;
            missingRanges.push({ start, end: index - 1 });
        }

        for (const range of missingRanges) {
            const sampleResult = context.audio.sampleFeatureRange({
                trackId: props.audioTrackId,
                feature: 'peaks',
                startSeconds: range.start * stepSec,
                endSeconds: range.end * stepSec,
                stepSeconds: stepSec,
            });
            if (!sampleResult.ok) continue;
            const samples = sampleResult.value;
            if (samples.length !== range.end - range.start + 1) continue;
            samples.forEach((frame, offset) => {
                const values = Array.isArray(frame.value) ? [...frame.value] : [Number(frame.value) || 0];
                const channelValues = frame.channelValues?.map((channel) => [...channel]) ?? [values];
                this._peakSamples.set(range.start + offset, {
                    values,
                    metadata: {
                        frame: {
                            channelValues,
                            format: channelValues.some((channel) => channel.length > 1)
                                ? 'waveform-minmax'
                                : 'float32',
                        },
                    },
                });
            });
        }

        const samples: Array<FeatureDataResult | null> = [];
        for (let index = firstSampleIndex; index <= lastSampleIndex; index += 1) {
            samples.push(index * stepSec < 0 ? null : (this._peakSamples.get(index) ?? null));
        }

        if (!samples.some((sample) => sample !== null)) {
            return pushMessage('No peaks data');
        }

        const primarySeries = aggregatePeakSeries(
            samples,
            firstSampleIndex,
            firstBucketIndex,
            lastBucketIndex,
            samplesPerBucket,
            bucketSeconds,
            startSeconds,
            windowSeconds,
            width,
            primaryChannel,
            gain
        );
        const secondarySeries =
            secondaryChannel !== primaryChannel
                ? aggregatePeakSeries(
                      samples,
                      firstSampleIndex,
                      firstBucketIndex,
                      lastBucketIndex,
                      samplesPerBucket,
                      bucketSeconds,
                      startSeconds,
                      windowSeconds,
                      width,
                      secondaryChannel,
                      gain
                  )
                : null;

        if (primarySeries.mins.length < 2 && (!secondarySeries || secondarySeries.mins.length < 2)) {
            return pushMessage('Peaks too short');
        }

        if (showBarLines || showBeatLines) {
            const signature = context.timing?.getTimeSignature();
            const beatsPerBar = Math.max(1, signature?.ok ? signature.value.numerator : 4);
            const firstBeatResult = context.timing?.secondsToBeats(startSeconds);
            const lastBeatResult = context.timing?.secondsToBeats(endSeconds);
            const firstBeat = firstBeatResult?.ok ? firstBeatResult.value : null;
            const lastBeat = lastBeatResult?.ok ? lastBeatResult.value : null;
            if (firstBeat !== null && lastBeat !== null && Number.isFinite(firstBeat) && Number.isFinite(lastBeat)) {
                const initialBeat = Math.ceil(firstBeat);
                const lineWidth = clamp(typeof props.beatGridWidth === 'number' ? props.beatGridWidth : 1, 0.5, 8);
                for (let beat = initialBeat; beat <= lastBeat + 1e-9; beat += 1) {
                    const isBar = Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) < 1e-9;
                    if ((isBar && !showBarLines) || (!isBar && !showBeatLines)) continue;
                    const secondsResult = context.timing?.beatsToSeconds(beat);
                    if (!secondsResult?.ok) continue;
                    const seconds = secondsResult.value;
                    const x = ((seconds - startSeconds) / windowSeconds) * width;
                    if (x >= 0 && x <= width) {
                        const configuredLineLength = isBar ? props.barLineLength : props.beatLineLength;
                        const lineLength = clamp(
                            typeof configuredLineLength === 'number' ? configuredLineLength : height,
                            0,
                            height
                        );
                        const lineColor = applyOpacity(
                            isBar ? (props.barLineColor ?? '#94A3B8') : (props.beatLineColor ?? '#64748B'),
                            props.beatGridOpacity ?? 0.45
                        );
                        const lineY = (height - lineLength) / 2;
                        objects.push(
                            new Line(x, lineY, x, lineY + lineLength, {
                                color: lineColor,
                                lineWidth,
                                layoutParticipation: 'exclude',
                            })
                        );
                    }
                }
            }
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
                { fillColor: null, strokeColor: primaryColor, strokeWidth: 1, layoutParticipation: 'exclude' }
            );
            playheadLine.setClosed(false).setLineJoin('round').setLineCap('round');
            objects.push(playheadLine);
        }

        const earliestRetainedIndex = firstSampleIndex - samplesPerBucket * 2;
        for (const index of this._peakSamples.keys()) {
            if (index < earliestRetainedIndex) this._peakSamples.delete(index);
        }

        return objects;
    }
}

export const audioPeaks = defineHostAdaptedBuiltIn(
    {
        type: 'audioPeaks',
        metadata: { name: 'Audio Peaks', description: 'Audio peak history display', category: 'Audio Displays' },
        capabilities: { required: ['audio.features.read', 'timeline.read'], optional: ['timing.conversion'] },
        featureRequirements: [{ feature: 'peaks' }],
    },
    AudioPeaksElement
);
