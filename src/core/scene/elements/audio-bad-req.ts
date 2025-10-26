import { EnhancedConfigSchema, RenderObject } from '@core/index';
import { SceneElement, asTrimmedString } from './base';
import { Rectangle, Text } from '@core/render/render-objects';
import { registerFeatureRequirements } from './audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

const ODD_PROFILE_ID = 'default';

registerFeatureRequirements('default', [
    {
        feature: 'fakeFeature',
        profile: ODD_PROFILE_ID,
    },
]);

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

export class AudioBadReqElement extends SceneElement {
    constructor(id: string = 'audioBadReq', config: Record<string, unknown> = {}) {
        super('audioBadReq', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            ...base,
            name: 'Audio Bad Request',
            description: 'Requests a non-existent analysis profile to validate cache handling',
            category: 'Misc',
            groups: [
                ...base.groups,
                {
                    id: 'audioBadReqBasics',
                    label: 'Audio Bad Request',
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
        const objects: RenderObject[] = [];
        return objects;
    }
}
