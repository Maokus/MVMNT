import { SceneElement } from './base';
import { Poly, Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import { sampleAudioFeatureRange } from '@state/selectors/audioFeatureSelectors';
import { AudioFeatureBinding } from '@bindings/property-bindings';

export class AudioOscilloscopeElement extends SceneElement {
    constructor(id: string = 'audioOscilloscope', config: Record<string, unknown> = {}) {
        super('audioOscilloscope', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            ...base,
            name: 'Audio Oscilloscope',
            description: 'Draws waveform samples from audio features over time.',
            groups: [
                ...base.groups,
                {
                    id: 'oscilloscope',
                    label: 'Oscilloscope',
                    collapsed: false,
                    properties: [
                        {
                            key: 'featureBinding',
                            type: 'audioFeature',
                            label: 'Audio Feature',
                            default: null,
                            requiredFeatureKey: 'waveform',
                            autoFeatureLabel: 'Waveform',
                        },
                        {
                            key: 'windowSeconds',
                            type: 'number',
                            label: 'Window (seconds)',
                            default: 0.5,
                            min: 0.05,
                            max: 5,
                            step: 0.05,
                        },
                        { key: 'lineColor', type: 'color', label: 'Line Color', default: '#22d3ee' },
                        {
                            key: 'lineWidth',
                            type: 'number',
                            label: 'Line Width',
                            default: 2,
                            min: 1,
                            max: 10,
                            step: 0.5,
                        },
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width',
                            default: 320,
                            min: 40,
                            max: 1600,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height',
                            default: 160,
                            min: 20,
                            max: 600,
                            step: 1,
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(_config: any, targetTime: number): RenderObject[] {
        const binding = this.getBinding('featureBinding');
        const width = Math.max(40, this.getProperty<number>('width') ?? 320);
        const height = Math.max(20, this.getProperty<number>('height') ?? 160);
        const layoutRect = new Rectangle(0, 0, width, height, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);
        if (!(binding instanceof AudioFeatureBinding)) {
            return [layoutRect];
        }
        const config = binding.getConfig();
        if (!config.trackId || !config.featureKey) {
            return [layoutRect];
        }
        const windowSeconds = Math.max(0.05, this.getProperty<number>('windowSeconds') ?? 0.5);
        const tm = getSharedTimingManager();
        const halfWindow = windowSeconds / 2;
        const startTick = Math.round(tm.secondsToTicks(Math.max(0, targetTime - halfWindow)));
        const endTick = Math.round(tm.secondsToTicks(targetTime + halfWindow));
        const state = useTimelineStore.getState();
        const range = sampleAudioFeatureRange(state, config.trackId, config.featureKey, startTick, endTick, {
            bandIndex: config.bandIndex ?? undefined,
            channelIndex: config.channelIndex ?? undefined,
        });
        if (!range || range.frameCount === 0) {
            return [layoutRect];
        }
        const channels = range.channels;
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < range.frameCount; i += 1) {
            let value = 0;
            if (range.format === 'waveform-minmax' && channels >= 2) {
                const min = range.data[i * channels] ?? 0;
                const max = range.data[i * channels + 1] ?? min;
                value = (min + max) / 2;
            } else {
                value = range.data[i * channels] ?? 0;
            }
            const normalized = Math.max(-1, Math.min(1, value));
            const x = (i / Math.max(1, range.frameCount - 1)) * width;
            const y = height / 2 - normalized * (height / 2);
            points.push({ x, y });
        }
        if (points.length < 2) {
            return [layoutRect];
        }
        const line = new Poly(points, null, this.getProperty<string>('lineColor') ?? '#22d3ee', this.getProperty<number>('lineWidth') ?? 2);
        line.setClosed(false);
        line.setIncludeInLayoutBounds(false);
        return [layoutRect, line];
    }
}
