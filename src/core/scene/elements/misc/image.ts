// Image scene element — displays still images and animated GIFs via the unified VisualAsset system.
import { SceneElement, asBoolean, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { VisualMedia } from '@core/render/render-objects/visual-media';
import { RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';
import type { SceneElementInterface } from '@core/types.js';
import { visualAssetStore } from '@core/resources/visual-asset-store';
import { VisualMediaPlayback } from '@core/resources/visual-media-playback';
import { insertElementGroups, prop } from '@core/scene/plugins/plugin-sdk-prop-factories';

const normalizeFitMode: PropertyTransform<'contain' | 'cover' | 'fill' | 'none', SceneElementInterface> = (
    value,
    element
) => {
    const normalized = asTrimmedString(value, element)?.toLowerCase();
    const allowed = ['contain', 'cover', 'fill', 'none'] as const;
    return allowed.includes(normalized as (typeof allowed)[number])
        ? (normalized as (typeof allowed)[number])
        : undefined;
};

const ensurePositivePlaybackSpeed: PropertyTransform<number, SceneElementInterface> = (value, element) => {
    const numeric = asNumber(value, element);
    if (numeric === undefined || numeric <= 0) return undefined;
    return numeric;
};

const normalizeImageSource: PropertyTransform<string | File | null, SceneElementInterface> = (value) => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (value instanceof File) return value;
    return null;
};

export class ImageElement extends SceneElement {
    private _currentImageSource: string | File | null = null;
    private _renderObject: VisualMedia | null = null;
    private readonly _playback = new VisualMediaPlayback();

    constructor(id: string = 'image', config: { [key: string]: any } = {}) {
        super('image', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Image',
            description: 'Display an image with transformations',
            category: 'Misc',
        }, [
            {
                id: 'imageSource',
                label: 'Image Source',
                variant: 'basic',
                collapsed: false,
                description: 'Pick the artwork and playback speed for animated assets.',
                properties: [
                    prop.file('imageSource', 'Image File', {accept:"image/*", description: 'Image or animated GIF to display.'}),
                    prop.number('playbackSpeed', 'Playback Speed (×)', 1, {step: 0.1})
                    
                ],
            },
            {
                id: 'imageLayout',
                label: 'Layout',
                variant: 'basic',
                collapsed: false,
                description: 'Size and crop behaviour for the image frame.',
                properties: [
                    prop.number('width', 'Width (px)', 200, { step: 10 }),
                    prop.number('height', 'Height (px)', 200, { step: 10 }),
                    prop.select('fitMode', 'Fit Mode', 'contain', [
                        { value: 'contain', label: 'Contain (fit within bounds)' },
                        { value: 'cover', label: 'Cover (fill bounds, may crop)' },
                        { value: 'fill', label: 'Fill (stretch to fit)' },
                        { value: 'none', label: 'None (original size)' }
                    ]),
                    prop.boolean('preserveAspectRatio', 'Preserve Aspect Ratio', true, {
                        visibleWhen: [{ key: 'fitMode', notEquals: 'fill' }],
                    }),
                ],
            },
        ]);
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        // Kick off load when the source changes
        const newSrc = props.imageSource ?? null;
        if (newSrc !== this._currentImageSource) {
            this._currentImageSource = newSrc;
            if (newSrc) visualAssetStore.load(newSrc);
        }

        // Lazily create / reuse the single render object
        if (!this._renderObject) {
            this._renderObject = new VisualMedia(0, 0, props.width, props.height);
        }

        const asset = newSrc ? visualAssetStore.get(newSrc) : undefined;

        // Compute local asset time via the instance playback state
        this._playback.speed = props.playbackSpeed ?? 1;
        const localTime = this._playback.computeLocalTime(targetTime);

        this._renderObject
            .setAsset(asset ?? null, asset?.status ?? (newSrc ? 'loading' : 'idle'))
            .setLocalTime(localTime)
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode ?? 'contain')
            .setPreserveAspectRatio(props.preserveAspectRatio ?? true);

        return [this._renderObject];
    }
}
