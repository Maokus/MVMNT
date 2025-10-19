import { SceneElement, asNumber, asTrimmedString } from './base';
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

function average(values: number[]): number {
    if (!values.length) return 0;
    const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    return total / values.length;
}

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);

export class AudioSpectrumElement extends SceneElement {
    constructor(id: string = 'audioSpectrum', config: Record<string, unknown> = {}) {
        super('audioSpectrum', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Spectrum',
            description: 'Compact magnitude bars for inspecting spectral data.',
            category: 'audio',
            groups: [
                ...basicGroups,
                {
                    id: 'spectrumBasics',
                    label: 'Spectrum',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                            runtime: { transform: (value, element) => asTrimmedString(value, element) ?? null, defaultValue: null },
                        },
                        {
                            key: 'barCount',
                            type: 'number',
                            label: 'Bars',
                            default: 48,
                            min: 4,
                            max: 256,
                            step: 1,
                            runtime: {
                                transform: (value, element) => {
                                    const numeric = asNumber(value, element);
                                    if (numeric === undefined) return undefined;
                                    return clamp(Math.floor(numeric), 4, 512);
                                },
                                defaultValue: 48,
                            },
                        },
                        {
                            key: 'minDecibels',
                            type: 'number',
                            label: 'Minimum Value',
                            default: -80,
                            min: -160,
                            max: 0,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: -80 },
                        },
                        {
                            key: 'maxDecibels',
                            type: 'number',
                            label: 'Maximum Value',
                            default: 0,
                            min: -80,
                            max: 24,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 0 },
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
                            default: 180,
                            min: 40,
                            max: 800,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 180 },
                        },
                        {
                            key: 'barColor',
                            type: 'color',
                            label: 'Bar Color',
                            default: '#60a5fa',
                            runtime: { transform: asTrimmedString, defaultValue: '#60a5fa' },
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

        const sample = getFeatureData(this, props.audioTrackId, 'spectrogram', targetTime, { smoothing: props.smoothing });
        const values = sample?.values ?? [];
        if (!values.length) {
            objects.push(
                new Text(
                    8,
                    props.height / 2,
                    'No spectrum data',
                    '12px Inter, sans-serif',
                    '#94a3b8',
                    'left',
                    'middle'
                )
            );
            return objects;
        }

        const binsPerBar = Math.max(1, Math.floor(values.length / props.barCount));
        const normalized: number[] = [];
        for (let bar = 0; bar < props.barCount; bar += 1) {
            const start = bar * binsPerBar;
            const slice = values.slice(start, start + binsPerBar);
            const magnitude = average(slice);
            const ratio = clamp(
                (magnitude - props.minDecibels) / Math.max(1e-6, props.maxDecibels - props.minDecibels),
                0,
                1
            );
            normalized.push(ratio);
        }

        const actualBarWidth = props.width / props.barCount;
        const gap = Math.min(2, actualBarWidth * 0.25);
        normalized.forEach((ratio, index) => {
            const x = index * actualBarWidth + gap * 0.5;
            const barWidth = Math.max(1, actualBarWidth - gap);
            const barHeight = ratio * props.height;
            const y = props.height - barHeight;
            objects.push(new Rectangle(x, y, barWidth, barHeight, props.barColor));
        });

        return objects;
    }
}
