import { definePluginElement, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Text } from '@mvmnt-app/plugin-sdk/render';

export const propertyHeavy = definePluginElement({
    type: 'sdk-v2-properties',
    metadata: { name: 'Property DTO Fixture', category: 'Fixtures' },
    schema: {
        presets: [{ id: 'large', label: 'Large', values: { size: 72 } }],
        tabs: [
            tab.content([
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        prop.string('label', 'Label', 'SDK 2'),
                        prop.font('font', 'Font', 'Inter|400'),
                        prop.midiTrack('trackId', 'Track'),
                        prop.boolean('advanced', 'Advanced', false),
                        prop.number('size', 'Size', 32, {
                            min: 8,
                            max: 200,
                            visibleWhen: [{ key: 'advanced', truthy: true }],
                        }),
                    ],
                },
            ]),
        ],
    },
    render({ props }) {
        return [new Text(0, 0, props.label, `${props.size}px ${props.font}`)];
    },
});
