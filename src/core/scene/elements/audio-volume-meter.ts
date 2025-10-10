import { SceneElement } from './base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import { coerceFeatureDescriptors, resolveTimelineTrackRefValue, sampleFeatureFrame } from './audioFeatureUtils';

export class AudioVolumeMeterElement extends SceneElement {
    constructor(id: string = 'audioVolumeMeter', config: Record<string, unknown> = {}) {
        super('audioVolumeMeter', id, config);
    }

    private static readonly DEFAULT_DESCRIPTOR: AudioFeatureDescriptor = { featureKey: 'rms', smoothing: 0 };

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            ...base,
            name: 'Audio Volume Meter',
            description: 'Displays RMS audio levels as a vertical bar.',
            category: 'audio',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'volumeMeter',
                    label: 'Meter Basics',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Connect to a volume feature and shape the meter.',
                    properties: [
                        {
                            key: 'featureTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                        },
                        {
                            key: 'features',
                            type: 'audioFeatureDescriptor',
                            label: 'Audio Features',
                            default: [],
                            requiredFeatureKey: 'rms',
                            autoFeatureLabel: 'Volume (RMS)',
                            trackPropertyKey: 'featureTrackId',
                            profilePropertyKey: 'analysisProfileId',
                            glossaryTerms: {
                                featureDescriptor: 'feature-descriptor',
                                analysisProfile: 'analysis-profile',
                            },
                        },
                        {
                            key: 'analysisProfileId',
                            type: 'audioAnalysisProfile',
                            label: 'Analysis Profile',
                            default: 'default',
                            trackPropertyKey: 'featureTrackId',
                            glossaryTerms: {
                                analysisProfile: 'analysis-profile',
                            },
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
                            label: 'Meter Width (px)',
                            default: 20,
                            min: 4,
                            max: 200,
                            step: 1,
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Meter Height (px)',
                            default: 200,
                            min: 20,
                            max: 800,
                            step: 1,
                        },
                        {
                            key: 'showText',
                            type: 'boolean',
                            label: 'Show Volume Text',
                            default: false,
                        },
                        {
                            key: 'textLocation',
                            type: 'select',
                            label: 'Text Location',
                            default: 'bottom',
                            options: [
                                { label: 'Bottom', value: 'bottom' },
                                { label: 'Top', value: 'top' },
                                { label: 'Track', value: 'track' },
                            ],
                            visibleWhen: [{ key: 'showText', truthy: true }],
                        },
                    ],
                    presets: [
                        {
                            id: 'calibrated',
                            label: 'Calibrated Meter',
                            values: { minValue: 0, maxValue: 1, meterColor: '#38bdf8', width: 24, height: 220 },
                        },
                        {
                            id: 'broadcast',
                            label: 'Broadcast Meter',
                            values: { minValue: 0.1, maxValue: 1.2, meterColor: '#f97316', width: 32, height: 260 },
                        },
                        {
                            id: 'club',
                            label: 'Club Meter',
                            values: { minValue: 0, maxValue: 1.5, meterColor: '#a855f7', width: 18, height: 200 },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const trackBinding = this.getBinding('featureTrackId');
        const trackValue = this.getProperty<string | string[] | null>('featureTrackId');
        const descriptorsValue = this.getProperty<AudioFeatureDescriptor[] | null>('features');
        const descriptors = coerceFeatureDescriptors(
            descriptorsValue,
            AudioVolumeMeterElement.DEFAULT_DESCRIPTOR,
        );
        const descriptor = descriptors[0] ?? AudioVolumeMeterElement.DEFAULT_DESCRIPTOR;
        const trackId = resolveTimelineTrackRefValue(trackBinding, trackValue);

        const sample: AudioFeatureFrameSample | null =
            trackId && descriptor.featureKey ? sampleFeatureFrame(trackId, descriptor, targetTime) : null;
        const rms = sample?.values?.[0] ?? 0;
        const minValue = this.getProperty<number>('minValue') ?? 0;
        const maxValue = this.getProperty<number>('maxValue') ?? 1;
        const width = Math.max(4, this.getProperty<number>('width') ?? 20);
        const height = Math.max(20, this.getProperty<number>('height') ?? 200);
        const color = this.getProperty<string>('meterColor') ?? '#f472b6';
        const showText = this.getProperty<boolean>('showText') ?? false;
        const textLocation = (this.getProperty<string>('textLocation') ?? 'bottom') as 'bottom' | 'top' | 'track';
        const clamped = Math.max(minValue, Math.min(maxValue, rms));
        const normalized = maxValue - minValue <= 0 ? 0 : (clamped - minValue) / (maxValue - minValue);
        const meterHeight = normalized * height;
        const objects: RenderObject[] = [];
        const layoutRect = new Rectangle(0, 0, width, height, null, null, 0, { includeInLayoutBounds: true });
        layoutRect.setVisible(false);
        objects.push(layoutRect);

        const rect = new Rectangle(0, height - meterHeight, width, meterHeight, color);
        rect.setIncludeInLayoutBounds(false);
        if (!(sample && sample.values?.length)) {
            rect.setVisible(false);
        }
        objects.push(rect);

        if (showText) {
            const dbValue = rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
            const formatted = Number.isFinite(dbValue) ? `${dbValue.toFixed(1)} dB` : '-∞ dB';
            const margin = 6;
            let textX = width / 2;
            let textY = height + margin;
            let align: CanvasTextAlign = 'center';
            let baseline: CanvasTextBaseline = 'top';

            if (textLocation === 'top') {
                textY = -margin;
                baseline = 'bottom';
            } else if (textLocation === 'track') {
                textX = width + margin;
                textY = height - meterHeight;
                align = 'left';
                baseline = 'middle';
            }

            const text = new Text(textX, textY, formatted, '12px Arial, sans-serif', '#ffffff', align, baseline);
            text.setIncludeInLayoutBounds(false);
            objects.push(text);
        }

        return objects;
    }
}
