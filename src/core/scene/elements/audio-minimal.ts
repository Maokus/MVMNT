import { EnhancedConfigSchema, RenderObject, SceneElement, asTrimmedString } from '@core/index';
import { Rectangle, Text } from '@core/render/render-objects';
import { registerFeatureRequirements } from './audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

//registerFeatureRequirements('audioMinimal', [{ feature: 'rms' }, { feature: 'waveform' }, { feature: 'spectrogram' }]);

function formatChannelValues(values: number[], limit = 8): string {
    if (!values.length) {
        return '[]';
    }
    const slice = values.slice(0, limit).map((value) => {
        if (!Number.isFinite(value)) {
            return String(value);
        }
        if (Math.abs(value) >= 100) {
            return value.toFixed(0);
        }
        if (Math.abs(value) >= 1) {
            return value.toFixed(2);
        }
        return value.toFixed(3);
    });
    const remainder = values.length - slice.length;
    const suffix = remainder > 0 ? `, … (+${remainder})` : '';
    return `[${slice.join(', ')}${suffix}]`;
}

export class AudioMinimalElement extends SceneElement {
    constructor(id: string = 'audioMinimal', config: Record<string, unknown> = {}) {
        super('audioMinimal', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            ...base,
            name: 'Audio Minimal',
            description: 'Minimal audio element for basic audio functionality testing',
            category: 'Misc',
            groups: [
                ...base.groups,
                {
                    id: 'audioMinimalBasics',
                    label: 'Audio Minimal',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                            runtime: {
                                transform: (value, element) => asTrimmedString(value, element) ?? null,
                                defaultValue: null,
                            },
                        },
                    ],
                },
            ],
        };
    }

    protected override _buildRenderObjects(_config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const result = props.audioTrackId
            ? getFeatureData(this, props.audioTrackId, 'waveform', targetTime)
            : null;
        const sample = result?.metadata?.frame ?? null;
        const channelValues =
            sample?.channelValues && sample.channelValues.length
                ? sample.channelValues
                : result?.values?.length
                ? [result.values]
                : [];
        const aliases = result?.metadata?.channelAliases ?? sample?.channelAliases ?? null;
        const channelCount = channelValues.length;

        if (!result || channelCount === 0) {
            return [new Rectangle(0, 0, 200, 200, '#ff0000')];
        }

        const objects: RenderObject[] = [];

        let y = 0;

        objects.push(new Text(0, y, `Channels: ${channelCount}`, '30px Arial', '#00ffcc'));
        y += 40;

        channelValues.forEach((values, index) => {
            const alias = aliases?.[index];
            const label = alias && alias.length ? `${alias} (#${index + 1})` : `Channel ${index + 1}`;
            objects.push(new Text(0, y, `${label}: ${formatChannelValues(values)}`, '28px Arial', '#ffffff'));
            y += 36;
        });

        const summary = {
            frameIndex: sample?.frameIndex ?? null,
            hopTicks: sample?.hopTicks ?? null,
            format: sample?.format ?? null,
            frameLength: sample?.frameLength ?? null,
        };
        objects.push(new Text(0, y, `Metadata: ${JSON.stringify(summary)}`, '24px Arial', '#00ff00'));
        return objects;
    }
}
