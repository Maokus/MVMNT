import { SceneElement, asNumber } from '../base';
import { Poly, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';
import { applyOpacity } from '@utils/color';
import { getRequiredPluginApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';
import { propGroup, tab } from '@core/scene/plugins/plugin-sdk-prop-groups';

const { descriptor: PITCH_GUIDE_DESCRIPTOR } = createFeatureDescriptor({ feature: 'pitchGuide' });

const DEFAULT_LINE_COLOR = '#F472B6';
const DEFAULT_BACKGROUND_COLOR = '#0F172A';

// Conservative upper bound on raw window duration to stay within MAX_RAW_SAMPLES at 44.1 kHz.
// 8192 / 44100 ≈ 185ms; we use 175ms to leave headroom for higher sample rates.
const MAX_WINDOW_SEC = 0.175;

registerFeatureRequirements('audioLockedOscilloscope', [{ feature: 'pitchGuide' }]);

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function resampleLinear(samples: Float32Array, count: number): number[] {
    if (samples.length === 0) return new Array<number>(count).fill(0);
    if (count <= 1) return [samples[0] ?? 0];
    const result = new Array<number>(count);
    const scale = (samples.length - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
        const pos = i * scale;
        const lo = Math.floor(pos);
        const hi = Math.min(lo + 1, samples.length - 1);
        const frac = pos - lo;
        result[i] = (samples[lo] ?? 0) * (1 - frac) + (samples[hi] ?? 0) * frac;
    }
    return result;
}

function buildPolylinePoints(values: number[], width: number, height: number): { x: number; y: number }[] {
    if (values.length < 2) return [];
    const verticalScale = height / 2;
    const denom = values.length - 1;
    return values.map((value, index) => ({
        x: (index / denom) * width,
        y: height / 2 - value * verticalScale,
    }));
}

function scoreTriggerCandidate(
    samples: Float32Array,
    triggerIdx: number,
    anchorSample: number,
    periodSamples: number,
    triggerSearchRadius: number
): number {
    const distPenalty = Math.abs(triggerIdx - anchorSample) / Math.max(1, triggerSearchRadius);

    // Waveform similarity: compare first 32 samples of cycle 0 vs cycle 1
    let similarity = 0;
    const checkLen = Math.min(32, periodSamples);
    if (triggerIdx + periodSamples + checkLen <= samples.length) {
        let sum = 0;
        for (let k = 0; k < checkLen; k++) {
            const v0 = samples[triggerIdx + k] ?? 0;
            const v1 = samples[triggerIdx + periodSamples + k] ?? 0;
            sum += 1 - Math.min(1, Math.abs(v0 - v1));
        }
        similarity = sum / checkLen;
    }

    return similarity - distPenalty * 0.5;
}

export class AudioLockedOscilloscopeElement extends SceneElement {
    constructor(id: string = 'audioLockedOscilloscope', config: Record<string, unknown> = {}) {
        super('audioLockedOscilloscope', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Locked Oscilloscope',
                description: 'Displays a pitch-locked waveform window drawn from raw audio samples.',
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
                            prop.number('width', 'Width (px)', 800, { step: 1 }),
                            prop.number('height', 'Height (px)', 300, { step: 1 }),
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
                            {
                                key: 'cycleCount',
                                type: 'number',
                                label: 'Cycles',
                                default: 3,
                                step: 1,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(Math.round(numeric), 1, 8);
                                    },
                                    defaultValue: 3,
                                },
                            },
                        ],
                    },
                    {
                        id: 'pitchSettings',
                        label: 'Pitch Detection',
                        collapsed: true,
                        properties: [
                            {
                                key: 'minPitch',
                                type: 'number',
                                label: 'Min Pitch (Hz)',
                                default: 50,
                                step: 1,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 20, 500);
                                    },
                                    defaultValue: 50,
                                },
                            },
                            {
                                key: 'maxPitch',
                                type: 'number',
                                label: 'Max Pitch (Hz)',
                                default: 2000,
                                step: 10,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 100, 8000);
                                    },
                                    defaultValue: 2000,
                                },
                            },
                            {
                                key: 'confidenceThreshold',
                                type: 'range',
                                label: 'Confidence Threshold',
                                default: 0.3,
                                min: 0,
                                max: 1,
                                step: 0.01,
                                runtime: {
                                    transform: (value, element) => {
                                        const numeric = asNumber(value, element);
                                        return numeric === undefined ? undefined : clamp(numeric, 0, 1);
                                    },
                                    defaultValue: 0.3,
                                },
                            },
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance({ blendMode: true }),
                    {
                        id: 'background',
                        label: 'Background',
                        collapsed: true,
                        properties: [
                            prop.color('backgroundColor', 'Background Color', DEFAULT_BACKGROUND_COLOR),
                            prop.range('backgroundOpacity', 'Background Opacity', 0, {
                                min: 0,
                                max: 1,
                                step: 0.01,
                            }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const width = props.width ?? 800;
        const height = props.height ?? 300;
        const blendMode = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;
        const cycleCount = clamp(typeof props.cycleCount === 'number' ? Math.round(props.cycleCount) : 3, 1, 8);
        const confidenceThreshold = clamp(
            typeof props.confidenceThreshold === 'number' ? props.confidenceThreshold : 0.3,
            0,
            1
        );
        const legacyLineColor = this.bindings.has('lineColor') ? this.getProperty<string>('lineColor') : undefined;
        const baseColor = legacyLineColor ?? props.color ?? DEFAULT_LINE_COLOR;
        const userOpacity = props.opacity ?? 1;

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

        const pushMessage = (msg: string) => {
            objects.push(
                new Text(
                    8,
                    height / 2,
                    msg,
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                ).setIncludeInLayoutBounds(false)
            );
            return objects;
        };

        if (!props.audioTrackId) {
            return pushMessage('Select an audio track');
        }

        const host = getRequiredPluginApi(this, [
            PLUGIN_CAPABILITIES.audioFeaturesRead,
            PLUGIN_CAPABILITIES.audioRawRead,
        ]);
        if (!host.ok) {
            return pushMessage('Audio not available');
        }

        // Sample pitch guide (cached offline pitch, confidence, RMS, anchor)
        const guideSample = host.api.audio.sampleFeatureAtTime({
            element: this,
            trackId: props.audioTrackId,
            feature: PITCH_GUIDE_DESCRIPTOR,
            time: targetTime,
        });

        const cv = guideSample?.metadata?.frame?.channelValues;
        const f0 = cv?.[0]?.[0] ?? 0;
        const confidence = cv?.[1]?.[0] ?? 0;
        const anchorSec = cv?.[3]?.[0] ?? targetTime;

        objects.push(
            new Text(
                0,
                -40,
                `F0: ${f0.toFixed(1)} Hz`,
                '12px Inter, sans-serif',
                '#94a3b8',
                'left',
                'middle'
            ).setIncludeInLayoutBounds(false)
        );
        objects.push(
            new Text(
                0,
                -20,
                `Confidence: ${confidence.toFixed(2)}`,
                '12px Inter, sans-serif',
                '#94a3b8',
                'left',
                'middle'
            ).setIncludeInLayoutBounds(false)
        );
        objects.push(
            new Text(
                0,
                0,
                `Anchor: ${anchorSec.toFixed(2)} sec`,
                '12px Inter, sans-serif',
                '#94a3b8',
                'left',
                'middle'
            ).setIncludeInLayoutBounds(false)
        );

        // Scale opacity by confidence relative to threshold
        const confidenceRatio = confidenceThreshold > 0 ? confidence / confidenceThreshold : 1;
        const lineOpacity = clamp(userOpacity * confidenceRatio, 0, userOpacity);

        const pushFlatLine = (opacityScale: number) => {
            const fadedColor = applyOpacity(baseColor, lineOpacity * opacityScale);
            const flat = new Poly(
                [
                    { x: 0, y: height / 2 },
                    { x: width, y: height / 2 },
                ],
                null,
                fadedColor,
                props.lineWidth ?? 2,
                { includeInLayoutBounds: false }
            );
            flat.setClosed(false);
            flat.blendMode = blendMode === 'source-over' ? null : blendMode;
            objects.push(flat);
            return objects;
        };

        if (!guideSample || f0 <= 0 || confidence < confidenceThreshold) {
            return pushFlatLine(0.4);
        }

        // Compute raw sample window
        const periodSec = 1 / f0;
        const desiredCycleSec = cycleCount * periodSec;

        if (desiredCycleSec >= MAX_WINDOW_SEC) {
            // Pitch too low for requested cycle count within the 8192-sample budget
            return pushFlatLine(0.3);
        }

        const availableMargin = Math.max(0, MAX_WINDOW_SEC - desiredCycleSec) / 2;
        const triggerMarginSec = Math.min(periodSec * 0.5, availableMargin);
        const windowStartSec = Math.max(0, anchorSec - triggerMarginSec);
        const windowEndSec = anchorSec + desiredCycleSec + triggerMarginSec;

        const rawSamples = host.api.audio.getRawSamples({
            trackId: props.audioTrackId,
            startSec: windowStartSec,
            endSec: windowEndSec,
            channel: 'mono',
        });

        if (!rawSamples || rawSamples.length < 4) {
            return pushMessage('Raw samples unavailable');
        }

        // Infer sample rate from returned sample count vs requested duration
        const windowDurationSec = windowEndSec - windowStartSec;
        const sampleRate = rawSamples.length / windowDurationSec;
        const periodSamples = Math.max(2, Math.round(sampleRate / f0));

        // Locate anchor within the raw window
        const anchorSampleInWindow = Math.round((anchorSec - windowStartSec) * sampleRate);
        const anchorClamped = clamp(anchorSampleInWindow, 0, rawSamples.length - 1);
        const triggerSearchRadius = Math.max(1, Math.round(triggerMarginSec * sampleRate));

        // Score positive zero-crossings near anchor, pick the best trigger
        let bestTrigger = anchorClamped;
        let bestScore = -Infinity;
        const searchStart = Math.max(0, anchorClamped - triggerSearchRadius);
        const searchEnd = Math.min(rawSamples.length - 2, anchorClamped + triggerSearchRadius);

        for (let i = searchStart; i <= searchEnd; i++) {
            const a = rawSamples[i] ?? 0;
            const b = rawSamples[i + 1] ?? 0;
            if (a <= 0 && b > 0) {
                const score = scoreTriggerCandidate(
                    rawSamples,
                    i + 1,
                    anchorClamped,
                    periodSamples,
                    triggerSearchRadius
                );
                if (score > bestScore) {
                    bestScore = score;
                    bestTrigger = i + 1;
                }
            }
        }

        // Extract cycleCount periods from trigger point
        const extractLen = cycleCount * periodSamples;
        const extractEnd = Math.min(rawSamples.length, bestTrigger + extractLen);
        const extracted = rawSamples.slice(bestTrigger, extractEnd);

        if (extracted.length < 2) {
            return pushMessage('Waveform window too short');
        }

        const displayValues = resampleLinear(extracted, Math.max(2, Math.round(width)));
        const points = buildPolylinePoints(displayValues, width, height);

        if (points.length < 2) {
            return pushMessage('Waveform too short');
        }

        const lineColor = applyOpacity(baseColor, lineOpacity);
        const line = new Poly(points, null, lineColor, props.lineWidth ?? 2, {
            includeInLayoutBounds: false,
        });
        line.setClosed(false);
        line.blendMode = blendMode === 'source-over' ? null : blendMode;
        objects.push(line);

        return objects;
    }
}
