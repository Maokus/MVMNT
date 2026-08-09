import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const featureAudio = definePluginElement({
    type: 'sdk-v2-feature-audio',
    metadata: { name: 'Feature Audio Fixture' },
    schema: {
        tabs: [
            {
                id: 'content',
                label: 'Content',
                groups: [
                    {
                        id: 'source',
                        label: 'Source',
                        collapsed: false,
                        properties: [
                            {
                                key: 'trackId',
                                label: 'Audio Track',
                                type: 'timelineTrackRef',
                                allowedTrackTypes: ['audio'],
                                default: null,
                            },
                        ],
                    },
                ],
            },
        ],
    },
    load(context) {
        const result = context.audio!.requireFeatures([{ feature: 'rms' }]);
        if (!result.ok) throw new Error(result.error.message);
    },
    render(props, _state, time, context) {
        const frame = props.trackId
            ? context.audio!.sampleFeature({ trackId: props.trackId, feature: 'rms', timeSeconds: time.seconds })
            : null;
        const value = frame?.ok && typeof frame.value.value === 'number' ? frame.value.value : 0;
        return [new Rectangle(0, 0, 20 + value * 100, 20, { fillColor: '#F472B6' })];
    },
});
