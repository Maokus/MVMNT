// Template: SDK 2 audio-reactive element using defensive raw-audio access.
import { definePluginElement } from '@mvmnt/plugin-sdk';
import { Rectangle } from '@mvmnt/plugin-sdk/render';

interface AudioReactiveProps extends Readonly<Record<string, unknown>> {
    readonly audioTrackId: string | null;
    readonly smoothing: number;
    readonly baseSize: number;
    readonly reactivityScale: number;
    readonly shapeColor: string;
}

export const audioReactive = definePluginElement<AudioReactiveProps, undefined>({
    type: 'audio-reactive',
    metadata: { name: 'Audio Reactive', description: 'Shape that reacts to audio volume', category: 'Custom' },
    schema: { tabs: [
        { id: 'content', label: 'Content', groups: [{ id: 'audioSource', label: 'Audio Source', collapsed: false, properties: [
            { key: 'audioTrackId', label: 'Audio Track', type: 'timelineTrackRef', allowedTrackTypes: ['audio'], default: null },
            { key: 'smoothing', label: 'Smoothing', type: 'number', default: 4, min: 0, max: 64, step: 1 },
        ] }] },
        { id: 'appearance', label: 'Appearance', groups: [{ id: 'reactiveAppearance', label: 'Appearance', collapsed: false, properties: [
            { key: 'baseSize', label: 'Base Size', type: 'number', default: 50, min: 10, max: 500, step: 1 },
            { key: 'reactivityScale', label: 'Reactivity', type: 'number', default: 200, min: 0, max: 1000, step: 10 },
            { key: 'shapeColor', label: 'Color', type: 'colorAlpha', default: '#F472B6FF' },
        ] }] },
    ] },
    capabilities: { required: ['audio.raw.read'], optional: [] },
    render(props, _state, time, context) {
        const windowSeconds = Math.max(0.025, props.smoothing * 0.01);
        const rms = props.audioTrackId ? context.audio!.getRms({
            trackId: props.audioTrackId,
            startSeconds: time.seconds - windowSeconds / 2,
            endSeconds: time.seconds + windowSeconds / 2,
        }) : null;
        const values: readonly number[] = rms?.ok ? Array.from(rms.value) : [];
        const volume = values.length ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length : 0;
        const size = props.baseSize + volume * props.reactivityScale;
        return [new Rectangle(-size / 2, -size / 2, size, size, { fillColor: props.shapeColor })];
    },
});
