import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const rawAudio = definePluginElement({
    type: 'sdk-v2-raw-audio',
    metadata: { name: 'Raw Audio Fixture' },
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
    render(props, _instanceState, time, context) {
        const rms = props.trackId
            ? context.audio!.getRms({
                  trackId: props.trackId,
                  startSeconds: Math.max(0, time.seconds - 0.05),
                  endSeconds: time.seconds + 0.05,
              })
            : null;
        const height = rms?.ok ? 10 + (rms.value[0] ?? 0) * 100 : 10;
        return [new Rectangle(0, 0, 20, height, { fillColor: '#22D3EE' })];
    },
});
