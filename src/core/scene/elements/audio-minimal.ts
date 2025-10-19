import { EnhancedConfigSchema, RenderObject, SceneElement, asTrimmedString } from '@core/index';
import { Rectangle, Text } from '@core/render/render-objects';
import { registerFeatureRequirements } from './audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

//registerFeatureRequirements('audioMinimal', [{ feature: 'rms' }, { feature: 'waveform' }, { feature: 'spectrogram' }]);

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

        const frame = props.audioTrackId ? getFeatureData(this, props.audioTrackId, 'spectrogram', targetTime) : null;

        if (!frame || frame.values.length === 0) {
            return [new Rectangle(0, 0, 200, 200, '#ff0000')];
        }

        const objects: RenderObject[] = [];

        for (let i = 0; i < frame.values.length; i++) {
            objects.push(new Text(0, i * 50, `${frame.values[i]}`, '40px Arial', '#ffffff'));
        }
        return objects;
    }
}
