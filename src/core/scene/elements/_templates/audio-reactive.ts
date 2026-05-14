// Template: Audio Reactive Element
// Reacts to audio volume/RMS to create dynamic visualizations
import {
    SceneElement,
    prop,
    insertElementGroups,
    tab,
    Rectangle,
    getRequiredPluginApi,
    PLUGIN_CAPABILITIES,
    registerFeatureRequirements,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// Register audio features this element needs
registerFeatureRequirements('audioReactive', [
    { feature: 'rms' }, // Root mean square (volume)
]);

export class AudioReactiveElement extends SceneElement {
    constructor(id: string = 'audioReactive', config: Record<string, unknown> = {}) {
        super('audio-reactive', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Audio Reactive',
                description: 'Shape that reacts to audio volume',
                category: 'Custom',
            },
            [
                tab.content([
                    {
                        id: 'audioSource',
                        label: 'Audio Source',
                        collapsed: false,
                        properties: [
                            prop.audioTrack('audioTrackId', 'Audio Track', { description: 'Audio track to analyze' }),
                            prop.number('smoothing', 'Smoothing', 4, {
                                min: 0,
                                max: 64,
                                step: 1,
                                description: 'Smoothing factor for audio response',
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'reactiveAppearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            prop.number('baseSize', 'Base Size', 50, {
                                min: 10,
                                max: 500,
                                step: 1,
                                description: 'Minimum size when audio is silent',
                            }),
                            prop.number('reactivityScale', 'Reactivity', 200, {
                                min: 0,
                                max: 1000,
                                step: 10,
                                description: 'How much the size scales with audio',
                            }),
                            prop.colorAlpha('shapeColor', 'Color', '#F472B6FF'),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioFeaturesRead]);
        if (!host.ok) return host.renderFallback();

        // Get audio data from public host API
        const audioData = host.api.audio.sampleFeatureAtTime({
            element: this,
            trackId: props.audioTrackId,
            feature: 'rms',
            time: targetTime,
            samplingOptions: { smoothing: props.smoothing },
        });

        // Get volume value (0-1 range typically)
        const volume = audioData?.values?.[0] ?? 0;

        // Calculate reactive size
        const size = props.baseSize + volume * props.reactivityScale;

        const half = size / 2;
        objects.push(new Rectangle(-half, -half, size, size, props.shapeColor));

        return objects;
    }
}
