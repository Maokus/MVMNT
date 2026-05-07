// Example: Beat Rings
//
// Three concentric rings that pulse to audio with a visual echo effect.
// Each ring uses a different smoothing level so the outermost ring reacts
// slowly (ghostly echo) and the innermost ring reacts instantly (sharp beat).
//
// Key concepts demonstrated:
//   - Audio API: registerFeatureRequirements, sampleFeatureAtTime, 'rms' feature
//   - Multiple render objects built in a single _buildRenderObjects() call
//   - Arc options: strokeColor, strokeWidth, setGlobalAlpha()
//   - Graceful degradation when the audio API is unavailable
//
// To use: run `npm run create-example`, pick "beat-rings", and choose a plugin ID.
import {
    SceneElement,
    prop,
    insertElementGroups,
    tab,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    registerFeatureRequirements,
    Arc,
    Text,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// Declare which audio features this element needs.
// The host uses this to ensure the audio pipeline produces the right data.
registerFeatureRequirements('beatRings', [{ feature: 'rms' }]);

export class BeatRingsElement extends SceneElement {
    constructor(id: string = 'beatRings', config: Record<string, unknown> = {}) {
        super('beat-rings', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Beat Rings',
                description: 'Concentric rings that pulse to the beat',
                category: 'Examples',
            },
            [
                tab.content([
                    {
                        id: 'audio',
                        label: 'Audio',
                        variant: 'basic',
                        collapsed: false,
                        properties: [
                            prop.audioTrack('audioTrackId', 'Audio Track', {
                                description: 'Audio track to react to',
                            }),
                            prop.number('baseRadius', 'Base Radius', 60, {
                                min: 10,
                                max: 300,
                                step: 1,
                                description: 'Ring radius when audio is silent',
                            }),
                            prop.number('reactivity', 'Reactivity', 150, {
                                min: 0,
                                max: 500,
                                step: 10,
                                description: 'How much the radius grows with volume',
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        variant: 'basic',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('ringColor', 'Ring Color', '#818CF8FF'),
                            prop.number('strokeWidth', 'Stroke Width', 3, { min: 1, max: 20, step: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        // Request the audioFeaturesRead capability.
        // If unavailable, render a plain-text fallback instead of crashing.
        const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead]);
        if (!api || status !== 'ok') {
            const message = missingCapabilities.includes(PLUGIN_CAPABILITIES.audioFeaturesRead)
                ? 'Audio API unavailable (requires audio.features.read)'
                : 'Plugin host API unavailable';
            return [new Text(0, 0, message, '12px Inter, sans-serif', '#64748b', 'left', 'top')];
        }

        // Helper: sample RMS at the given smoothing level.
        // Higher smoothing = slower reaction = "lag" / echo effect.
        const sampleRms = (smoothing: number): number =>
            api.audio.sampleFeatureAtTime({
                element: this,
                trackId: props.audioTrackId,
                feature: 'rms',
                time: targetTime,
                samplingOptions: { smoothing },
            })?.values?.[0] ?? 0;

        const fast = sampleRms(2); // sharp — foreground ring
        const mid = sampleRms(10); // medium — middle ring
        const slow = sampleRms(30); // sluggish — ghost ring

        const base = props.baseRadius as number;
        const scale = props.reactivity as number;
        const color = props.ringColor as string;
        const sw = props.strokeWidth as number;

        // Build one ring per smoothing level.
        // Outer ghost rings have lower opacity; the fast ring is fully opaque.
        const makeRing = (volume: number, alpha: number): Arc => {
            const arc = new Arc(0, 0, base + volume * scale, 0, Math.PI * 2, false, {
                strokeColor: color,
                strokeWidth: sw,
            });
            arc.setGlobalAlpha(alpha);
            return arc;
        };

        return [
            makeRing(slow, 0.25), // outermost — slowest echo
            makeRing(mid, 0.55), // middle
            makeRing(fast, 1.0), // innermost — sharpest beat
        ];
    }
}
