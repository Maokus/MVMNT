import { EnhancedConfigSchema, RenderObject } from '@core/index';
import { SceneElement, asTrimmedString } from './base';
import { Rectangle, Text } from '@core/render/render-objects';
import { registerFeatureRequirements } from './audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

const ODD_PROFILE_ID = 'oddProfile';

registerFeatureRequirements('audioOddProfile', [
    {
        feature: 'spectrogram',
        profile: ODD_PROFILE_ID,
    },
]);

export class AudioOddProfileElement extends SceneElement {
    constructor(id: string = 'audioOddProfile', config: Record<string, unknown> = {}) {
        super('audioOddProfile', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            ...base,
            name: 'Audio Odd Profile',
            description: 'Requests a non-default analysis profile to validate cache handling',
            category: 'Misc',
            groups: [
                ...base.groups,
                {
                    id: 'audioOddProfileBasics',
                    label: 'Audio Odd Profile',
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
            ? getFeatureData(this, props.audioTrackId, 'spectrogram', { profile: ODD_PROFILE_ID }, targetTime)
            : null;
        const values = result?.values ?? [];

        if (!values.length) {
            return [new Rectangle(0, 0, 200, 200, '#ff0000')];
        }

        const objects: RenderObject[] = [];

        objects.push(new Text(0, -40, `Profile: ${ODD_PROFILE_ID}`, '28px Arial', '#00ffcc'));

        for (let i = 0; i < values.length; i++) {
            objects.push(new Text(0, i * 50, `${values[i]}`, '40px Arial', '#ffffff'));
        }
        return objects;
    }
}
