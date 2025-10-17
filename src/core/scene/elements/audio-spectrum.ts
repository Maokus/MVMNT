import { SceneElement } from './base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import { emitAnalysisIntent, sampleFeatureFrame } from './audioFeatureUtils';

const DEFAULT_DESCRIPTOR: AudioFeatureDescriptor = {
    featureKey: 'spectrogram',
    smoothing: 0,
    calculatorId: null,
    bandIndex: null,
    channelIndex: null,
    channelAlias: null,
};

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
                            key: 'featureTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                        },
                        {
                            key: 'barCount',
                            type: 'number',
                            label: 'Bars',
                            default: 48,
                            min: 4,
                            max: 256,
                            step: 1,
                        },
                        {
                            key: 'minDecibels',
                            type: 'number',
                            label: 'Minimum Value',
                            default: -80,
                            min: -160,
                            max: 0,
                            step: 1,
                        },
                        {
                            key: 'maxDecibels',
                            type: 'number',
                            label: 'Maximum Value',
                            default: 0,
                            min: -80,
                            max: 24,
                            step: 1,
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 420,
                            min: 40,
                            max: 1600,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 180,
                            min: 40,
                            max: 800,
                            step: 1,
                        },
                        {
                            key: 'barColor',
                            type: 'color',
                            label: 'Bar Color',
                            default: '#60a5fa',
                        },
                        {
                            key: 'backgroundColor',
                            type: 'color',
                            label: 'Background',
                            default: 'rgba(15, 23, 42, 0.35)',
                        },
                        {
                            key: 'smoothing',
                            type: 'number',
                            label: 'Smoothing',
                            default: 0,
                            min: 0,
                            max: 1,
                            step: 0.05,
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const width = this.getProperty<number>('width') ?? 420;
        const height = this.getProperty<number>('height') ?? 180;
        const barCount = clamp(Math.floor(this.getProperty<number>('barCount') ?? 48), 4, 512);
        const minDecibels = this.getProperty<number>('minDecibels') ?? -80;
        const maxDecibels = this.getProperty<number>('maxDecibels') ?? 0;
        const barColor = this.getProperty<string>('barColor') ?? '#60a5fa';
        const backgroundColor = this.getProperty<string>('backgroundColor') ?? 'rgba(15, 23, 42, 0.35)';
        const smoothing = clamp(this.getProperty<number>('smoothing') ?? 0, 0, 1);
        const trackId = (this.getProperty<string>('featureTrackId') ?? '').trim() || null;

        const descriptor: AudioFeatureDescriptor = { ...DEFAULT_DESCRIPTOR, smoothing };
        emitAnalysisIntent(this, trackId, null, trackId ? [descriptor] : []);

        const objects: RenderObject[] = [];
        objects.push(new Rectangle(0, 0, width, height, backgroundColor));

        if (!trackId) {
            objects.push(new Text(8, height / 2, 'Select an audio track', '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        }

        const sample = sampleFeatureFrame(trackId, descriptor, targetTime);
        const values = sample?.values ?? [];
        if (!values.length) {
            objects.push(new Text(8, height / 2, 'No spectrum data', '12px Inter, sans-serif', '#94a3b8', 'left', 'middle'));
            return objects;
        }

        const binsPerBar = Math.max(1, Math.floor(values.length / barCount));
        const normalized: number[] = [];
        for (let bar = 0; bar < barCount; bar += 1) {
            const start = bar * binsPerBar;
            const slice = values.slice(start, start + binsPerBar);
            const magnitude = average(slice);
            const ratio = clamp((magnitude - minDecibels) / Math.max(1e-6, maxDecibels - minDecibels), 0, 1);
            normalized.push(ratio);
        }

        const actualBarWidth = width / barCount;
        const gap = Math.min(2, actualBarWidth * 0.25);
        normalized.forEach((ratio, index) => {
            const x = index * actualBarWidth + gap * 0.5;
            const barWidth = Math.max(1, actualBarWidth - gap);
            const barHeight = ratio * height;
            const y = height - barHeight;
            objects.push(new Rectangle(x, y, barWidth, barHeight, barColor));
        });

        return objects;
    }
}
