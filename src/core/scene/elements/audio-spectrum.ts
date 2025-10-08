import { SceneElement } from './base';
import { Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';

export class AudioSpectrumElement extends SceneElement {
    constructor(id: string = 'audioSpectrum', config: Record<string, unknown> = {}) {
        super('audioSpectrum', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            ...base,
            name: 'Audio Spectrum',
            description: 'Displays audio feature magnitudes as a spectrum of bars.',
            groups: [
                ...base.groups,
                {
                    id: 'audio',
                    label: 'Audio Binding',
                    collapsed: false,
                    properties: [
                        {
                            key: 'featureBinding',
                            type: 'audioFeature',
                            label: 'Audio Feature',
                            default: null,
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
                            label: 'Bar Width',
                            default: 8,
                            min: 1,
                            max: 80,
                            step: 1,
                        },
                        {
                            key: 'barSpacing',
                            type: 'number',
                            label: 'Bar Spacing',
                            default: 2,
                            min: 0,
                            max: 40,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Bar Height',
                            default: 140,
                            min: 10,
                            max: 800,
                            step: 1,
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(_config: any, _targetTime: number): RenderObject[] {
        const sample = this.getProperty<AudioFeatureFrameSample | null>('featureBinding');
        if (!sample || !sample.values?.length) {
            return [];
        }
        const barColor = this.getProperty<string>('barColor') ?? '#22d3ee';
        const barWidth = Math.max(1, this.getProperty<number>('barWidth') ?? 8);
        const barSpacing = Math.max(0, this.getProperty<number>('barSpacing') ?? 2);
        const maxHeight = Math.max(10, this.getProperty<number>('height') ?? 140);
        const values = sample.values;
        let maxValue = 0;
        for (const value of values) {
            if (value > maxValue) maxValue = value;
        }
        if (maxValue <= Number.EPSILON) {
            maxValue = 1;
        }
        const objects: RenderObject[] = [];
        values.forEach((value, index) => {
            const normalized = Math.max(0, Math.min(1, value / maxValue));
            const height = normalized * maxHeight;
            const x = index * (barWidth + barSpacing);
            const rect = new Rectangle(x, maxHeight - height, barWidth, height, barColor);
            objects.push(rect);
        });
        return objects;
    }
}
