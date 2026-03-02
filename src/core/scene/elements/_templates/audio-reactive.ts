// Template: Audio Reactive Element
// Reacts to audio volume/RMS to create dynamic visualizations
import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from '@core/scene/elements/base';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@core/scene/plugins';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';

// Register audio features this element needs
registerFeatureRequirements('audioReactive', [
    { feature: 'rms' }, // Root mean square (volume)
]);

const normalizeAudioTrackId: PropertyTransform<string | null, SceneElementInterface> = (value, element) =>
    asTrimmedString(value, element) ?? null;

const clampSmoothing: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined) return undefined;
    return Math.max(0, Math.min(64, numeric));
};

export class AudioReactiveElement extends SceneElement {
    constructor(id: string = 'audioReactive', config: Record<string, unknown> = {}) {
        super('audio-reactive', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        
        return {
            ...base,
            name: 'Audio Reactive',
            description: 'Shape that reacts to audio volume',
            category: 'Custom',
            groups: [
                ...basicGroups,
                {
                    id: 'audioSource',
                    label: 'Audio Source',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                            description: 'Audio track to analyze',
                            runtime: { transform: normalizeAudioTrackId, defaultValue: null },
                        },
                        {
                            key: 'smoothing',
                            type: 'number',
                            label: 'Smoothing',
                            default: 4,
                            min: 0,
                            max: 64,
                            step: 1,
                            description: 'Smoothing factor for audio response',
                            runtime: { transform: clampSmoothing, defaultValue: 4 },
                        },
                    ],
                },
                {
                    id: 'reactiveAppearance',
                    label: 'Appearance',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'baseSize',
                            type: 'number',
                            label: 'Base Size',
                            default: 50,
                            min: 10,
                            max: 500,
                            step: 1,
                            description: 'Minimum size when audio is silent',
                            runtime: { transform: asNumber, defaultValue: 50 },
                        },
                        {
                            key: 'reactivityScale',
                            type: 'number',
                            label: 'Reactivity',
                            default: 200,
                            min: 0,
                            max: 1000,
                            step: 10,
                            description: 'How much the size scales with audio',
                            runtime: { transform: asNumber, defaultValue: 200 },
                        },
                        {
                            key: 'shapeColor',
                            type: 'colorAlpha',
                            label: 'Color',
                            default: '#F472B6FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#F472B6FF' },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        
        if (!props.visible) return [];
        
        const objects: RenderObject[] = [];

        const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead]);
        if (!api || status !== 'ok') {
            const message = status === 'unsupported-version'
                ? 'Plugin API version unsupported'
                : missingCapabilities.includes(PLUGIN_CAPABILITIES.audioFeaturesRead)
                    ? 'Audio API unavailable (requires audio.features.read)'
                    : 'Plugin host API unavailable';
            objects.push(new Text(0, 0, message, '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return objects;
        }
        
        // Get audio data from public host API
        const audioData = api.audio.sampleFeatureAtTime({
            element: this,
            trackId: props.audioTrackId,
            feature: 'rms',
            time: targetTime,
            samplingOptions: { smoothing: props.smoothing },
        });
        
        // Get volume value (0-1 range typically)
        const volume = audioData?.values?.[0] ?? 0;
        
        // Calculate reactive size
        const size = props.baseSize + (volume * props.reactivityScale);
        
        const half = size / 2;
        objects.push(new Rectangle(-half, -half, size, size, props.shapeColor));
        
        return objects;
    }
}
