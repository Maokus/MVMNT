import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';
export const audioReactive = definePluginElement({
    type: 'audio-reactive',
    metadata: { name: 'Audio Reactive', description: 'Shape that reacts to audio volume', category: 'Custom' },
    schema: {
        tabs: [
            tab.content([
                group('audioSource', 'Audio Source', [
                    prop.audioTrack('audioTrackId', 'Audio Track'),
                    prop.number('smoothing', 'Smoothing', 4, { min: 0, max: 64, step: 1 }),
                ]),
            ]),
            tab.appearance([
                group('reactiveAppearance', 'Appearance', [
                    prop.number('baseSize', 'Base Size', 50, { min: 10, max: 500, step: 1 }),
                    prop.number('reactivityScale', 'Reactivity', 200, { min: 0, max: 1000, step: 10 }),
                    prop.colorAlpha('shapeColor', 'Color', '#F472B6FF'),
                ]),
            ]),
        ],
    },
    render({ props, time, context }) {
        const windowSeconds = Math.max(0.025, props.smoothing * 0.01);
        const rms = props.audioTrackId
            ? context.audio!.getRms({
                  trackId: props.audioTrackId,
                  startSeconds: time.seconds - windowSeconds / 2,
                  endSeconds: time.seconds + windowSeconds / 2,
              })
            : null;
        const values = rms?.ok ? rms.value : [];
        const volume = values.length ? Array.from(values).reduce((sum, value) => sum + value, 0) / values.length : 0;
        const size = props.baseSize + volume * props.reactivityScale;
        return [new Rectangle(-size / 2, -size / 2, size, size, { fillColor: props.shapeColor })];
    },
});
