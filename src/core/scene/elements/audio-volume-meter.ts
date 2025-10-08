import { SceneElement } from './base';
import { Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';

export class AudioVolumeMeterElement extends SceneElement {
    constructor(id: string = 'audioVolumeMeter', config: Record<string, unknown> = {}) {
        super('audioVolumeMeter', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            ...base,
            name: 'Audio Volume Meter',
            description: 'Displays RMS audio levels as a vertical bar.',
            groups: [
                ...base.groups,
                {
                    id: 'audio',
                    label: 'Volume Meter',
                    collapsed: false,
                    properties: [
                        {
                            key: 'featureBinding',
                            type: 'audioFeature',
                            label: 'Audio Feature',
                            default: null,
                            requiredFeatureKey: 'rms',
                            autoFeatureLabel: 'Volume (RMS)',
                        },
                        { key: 'meterColor', type: 'color', label: 'Meter Color', default: '#f472b6' },
                        {
                            key: 'minValue',
                            type: 'number',
                            label: 'Minimum Value',
                            default: 0,
                            min: 0,
                            max: 1,
                            step: 0.01,
                        },
                        {
                            key: 'maxValue',
                            type: 'number',
                            label: 'Maximum Value',
                            default: 1,
                            min: 0,
                            max: 2,
                            step: 0.01,
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width',
                            default: 20,
                            min: 4,
                            max: 200,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height',
                            default: 200,
                            min: 20,
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
        const rms = sample?.values?.[0] ?? 0;
        const minValue = this.getProperty<number>('minValue') ?? 0;
        const maxValue = this.getProperty<number>('maxValue') ?? 1;
        const width = Math.max(4, this.getProperty<number>('width') ?? 20);
        const height = Math.max(20, this.getProperty<number>('height') ?? 200);
        const color = this.getProperty<string>('meterColor') ?? '#f472b6';
        const clamped = Math.max(minValue, Math.min(maxValue, rms));
        const normalized = maxValue - minValue <= 0 ? 0 : (clamped - minValue) / (maxValue - minValue);
        const meterHeight = normalized * height;
        const objects: RenderObject[] = [];
        const layoutRect = new Rectangle(0, 0, width, height, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);
        objects.push(layoutRect);

        if (sample && sample.values?.length) {
            const rect = new Rectangle(0, height - meterHeight, width, meterHeight, color);
            rect.setIncludeInLayoutBounds(false);
            objects.push(rect);
        }

        return objects;
    }
}
