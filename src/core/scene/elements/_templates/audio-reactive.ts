// Template: Audio Reactive Element
// Reacts to live audio volume/RMS to create dynamic visualizations.
// Use raw PCM RMS for a volume control; cached feature tracks are for spectral
// or history-based visualizations.
import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    Rectangle,
    getRequiredPluginApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class AudioReactiveElement extends SceneElement {
    constructor(id: string = 'audioReactive', config: Record<string, unknown> = {}) {
        super('audio-reactive', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
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
                                description: 'RMS averaging window: 25 ms plus 10 ms per step',
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

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioRawRead]);
        if (!host.ok) return host.renderFallback();

        const trackId = props.audioTrackId as string | null;
        const smoothing = props.smoothing as number;
        const windowSec = Math.max(0.025, smoothing * 0.01);
        const rms = trackId
            ? host.api.audio.getRmsInWindow({
                  trackId,
                  startSec: targetTime - windowSec / 2,
                  endSec: targetTime + windowSec / 2,
              })
            : null;
        // Average per-channel RMS readings into one 0–1 volume value.
        const volume = rms && rms.length > 0 ? rms.reduce((sum, value) => sum + value, 0) / rms.length : 0;

        // Calculate reactive size
        const size = props.baseSize + volume * props.reactivityScale;

        const half = size / 2;
        objects.push(new Rectangle(-half, -half, size, size, { fillColor: props.shapeColor }));

        return objects;
    }
}
