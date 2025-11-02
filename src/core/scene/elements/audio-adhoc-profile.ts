import { EnhancedConfigSchema, RenderObject } from '@core/index';
import { SceneElement, asTrimmedString } from './base';
import { Rectangle, Text } from '@core/render/render-objects';
import { registerFeatureRequirements } from './audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';
import type { AudioAnalysisProfileOverrides } from '@audio/features/audioFeatureTypes';

const ADHOC_PROFILE_OVERRIDES: AudioAnalysisProfileOverrides = {
    windowSize: 4096,
    hopSize: 1024,
    window: 'hann',
};

registerFeatureRequirements('audioAdhocProfile', [
    {
        feature: 'spectrogram',
        profileParams: ADHOC_PROFILE_OVERRIDES,
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

export class AudioAdhocProfileElement extends SceneElement {
    constructor(id: string = 'AudioAdhocProfile', config: Record<string, unknown> = {}) {
        super('audioAdhocProfile', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            ...base,
            name: 'Audio Adhoc Profile',
            description: 'Requests an adhoc analysis profile to validate cache handling',
            category: 'Misc',
            groups: [
                ...base.groups,
                {
                    id: 'audioAdhocProfileBasics',
                    label: 'Audio Adhoc Profile',
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

        const result = props.audioTrackId ? getFeatureData(this, props.audioTrackId, 'spectrogram', targetTime) : null;
        const sample = result?.metadata?.frame ?? null;
        const channelValues =
            sample?.channelValues && sample.channelValues.length
                ? sample.channelValues
                : result?.values?.length
                ? [result.values]
                : [];
        const aliases = result?.metadata?.channelAliases ?? sample?.channelAliases ?? null;
        const descriptor = result?.metadata?.descriptor;
        const resolvedProfileId = descriptor?.analysisProfileId ?? descriptor?.requestedAnalysisProfileId ?? 'default';
        const overridesHash = descriptor?.profileOverridesHash ?? null;

        if (!result || !channelValues.length) {
            return [new Rectangle(0, 0, 200, 200, '#ff0000')];
        }

        const objects: RenderObject[] = [];

        const profileLabel = `Profile: ${resolvedProfileId}`;
        objects.push(new Text(0, -48, profileLabel, '28px Arial', '#00ffcc'));

        if (overridesHash) {
            const hashLabel = `Overrides hash: ${overridesHash}`;
            objects.push(new Text(0, -16, hashLabel, '24px Arial', '#66ffe0'));
        }

        const overrides = descriptor?.profileOverrides ?? null;
        if (overrides) {
            const entries = Object.entries(overrides)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ');
            const overridesLabel = entries.length ? `Overrides: ${entries}` : 'Overrides: <empty>';
            objects.push(new Text(0, 16, overridesLabel, '24px Arial', '#66ffe0'));
        }

        channelValues.forEach((values, index) => {
            const alias = aliases?.[index];
            const label = alias && alias.length ? `${alias} (#${index + 1})` : `Channel ${index + 1}`;
            const y = index * 48 + 64;
            objects.push(new Text(0, y, `${label}: ${formatChannelValues(values)}`, '32px Arial', '#ffffff'));
        });

        return objects;
    }
}
