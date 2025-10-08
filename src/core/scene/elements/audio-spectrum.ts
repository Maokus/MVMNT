import { SceneElement } from './base';
import { Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import { AudioFeatureBinding } from '@bindings/property-bindings';

export class AudioSpectrumElement extends SceneElement {
    constructor(id: string = 'audioSpectrum', config: Record<string, unknown> = {}) {
        super('audioSpectrum', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Spectrum',
            description: 'Displays audio feature magnitudes as a spectrum of bars.',
            category: 'audio',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'audioSpectrum',
                    label: 'Spectrum Basics',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Bind to an audio feature and tune the look of the spectrum.',
                    properties: [
                        {
                            key: 'featureBinding',
                            type: 'audioFeature',
                            label: 'Audio Feature',
                            default: null,
                            requiredFeatureKey: 'spectrogram',
                            autoFeatureLabel: 'Spectrogram',
                        },
                        {
                            key: 'barColor',
                            type: 'color',
                            label: 'Bar Color',
                            default: '#22d3ee',
                        },
                        {
                            key: 'barWidth',
                            type: 'number',
                            label: 'Bar Width (px)',
                            default: 8,
                            min: 1,
                            max: 80,
                            step: 1,
                        },
                        {
                            key: 'barSpacing',
                            type: 'number',
                            label: 'Bar Spacing (px)',
                            default: 2,
                            min: 0,
                            max: 40,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Bar Height (px)',
                            default: 140,
                            min: 10,
                            max: 800,
                            step: 1,
                        },
                    ],
                    presets: [
                        {
                            id: 'neonCity',
                            label: 'Neon City',
                            values: { barColor: '#22d3ee', barWidth: 6, barSpacing: 1, height: 180 },
                        },
                        {
                            id: 'boldBlocks',
                            label: 'Bold Blocks',
                            values: { barColor: '#f97316', barWidth: 14, barSpacing: 4, height: 220 },
                        },
                        {
                            id: 'minimalMeter',
                            label: 'Minimal Meter',
                            values: { barColor: '#cbd5f5', barWidth: 4, barSpacing: 2, height: 100 },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const binding = this.getBinding('featureBinding');
        const sample =
            binding instanceof AudioFeatureBinding
                ? binding.getValueWithContext?.({ targetTime, sceneConfig: config ?? {} }) ?? binding.getValue()
                : this.getProperty<AudioFeatureFrameSample | null>('featureBinding');
        const barColor = this.getProperty<string>('barColor') ?? '#22d3ee';
        const barWidth = Math.max(1, this.getProperty<number>('barWidth') ?? 8);
        const barSpacing = Math.max(0, this.getProperty<number>('barSpacing') ?? 2);
        const maxHeight = Math.max(10, this.getProperty<number>('height') ?? 140);
        const values = sample?.values ?? [];
        const barCount = values.length || 64;
        const totalWidth = Math.max(0, barCount * barWidth + Math.max(0, barCount - 1) * barSpacing);

        const objects: RenderObject[] = [];
        const layoutRect = new Rectangle(0, 0, totalWidth || barWidth, maxHeight, null, null, 0, {
            includeInLayoutBounds: true,
        });
        layoutRect.setVisible(false);
        objects.push(layoutRect);

        if (!values.length) {
            return objects;
        }

        let maxValue = 0;
        for (const value of values) {
            if (value > maxValue) maxValue = value;
        }
        if (maxValue <= Number.EPSILON) {
            maxValue = 1;
        }

        values.forEach((value, index) => {
            const normalized = Math.max(0, Math.min(1, value / maxValue));
            const height = normalized * maxHeight;
            const x = index * (barWidth + barSpacing);
            const rect = new Rectangle(x, maxHeight - height, barWidth, height, barColor);
            rect.setIncludeInLayoutBounds(false);
            objects.push(rect);
        });
        return objects;
    }
}
