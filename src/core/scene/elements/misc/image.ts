// Image scene element — displays still images and animated GIFs via the unified VisualAsset system.
import { SceneElement, asBoolean, asNumber, asTrimmedString, type PropertyTransform } from '../base';
import { VisualMedia } from '@core/render/render-objects/visual-media';
import { RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';
import type { SceneElementInterface } from '@core/types.js';
import { visualAssetStore } from '@core/resources/visual-asset-store';
import { VisualMediaPlayback } from '@core/resources/visual-media-playback';
import { insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';

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
                    {
                        key: 'imageSource',
                        type: 'file',
                        label: 'Image File',
                        default: '',
                        accept: 'image/*',
                        description: 'Image or animated GIF to display.',
                        runtime: { transform: normalizeImageSource, defaultValue: null },
                    },
                    {
                        key: 'playbackSpeed',
                        type: 'number',
                        label: 'Playback Speed (×)',
                        default: 1,
                        min: 0.1,
                        max: 10,
                        step: 0.1,
                        description: 'Speed multiplier for animated GIFs (1 = normal).',
                        runtime: { transform: ensurePositivePlaybackSpeed, defaultValue: 1 },
                    },
                ],
                presets: [
                    { id: 'stillImage', label: 'Still Image', values: { playbackSpeed: 1 } },
                    { id: 'slowLoop', label: 'Slow GIF Loop', values: { playbackSpeed: 0.5 } },
                    { id: 'hyperLoop', label: 'Hyper GIF Loop', values: { playbackSpeed: 2 } },
                ],
            },
            {
                id: 'imageLayout',
                label: 'Layout',
                variant: 'basic',
                collapsed: false,
                description: 'Size and crop behaviour for the image frame.',
                properties: [
                    {
                        key: 'width',
                        type: 'number',
                        label: 'Width (px)',
                        default: 200,
                        min: 10,
                        max: 2000,
                        step: 10,
                        description: 'Width of the image container in pixels.',
                        runtime: { transform: asNumber, defaultValue: 200 },
                    },
                    {
                        key: 'height',
                        type: 'number',
                        label: 'Height (px)',
                        default: 200,
                        min: 10,
                        max: 2000,
                        step: 10,
                        description: 'Height of the image container in pixels.',
                        runtime: { transform: asNumber, defaultValue: 200 },
                    },
                    {
                        key: 'fitMode',
                        type: 'select',
                        label: 'Fit Mode',
                        default: 'contain',
                        options: [
                            { value: 'contain', label: 'Contain (fit within bounds)' },
                            { value: 'cover', label: 'Cover (fill bounds, may crop)' },
                            { value: 'fill', label: 'Fill (stretch to fit)' },
                            { value: 'none', label: 'None (original size)' },
                        ],
                        description: 'How the image should fit within its bounds.',
                        runtime: { transform: normalizeFitMode, defaultValue: 'contain' as const },
                    },
                    {
                        key: 'preserveAspectRatio',
                        type: 'boolean',
                        label: 'Preserve Aspect Ratio',
                        default: true,
                        description: 'Maintain the original proportions when resizing.',
                        visibleWhen: [{ key: 'fitMode', notEquals: 'fill' }],
                        runtime: { transform: asBoolean, defaultValue: true },
                    },
                ],
                presets: [
                    {
                        id: 'fullWidth',
                        label: 'Full Width Banner',
                        values: { width: 1280, height: 720, fitMode: 'cover' },
                    },
                    {
                        id: 'squareThumb',
                        label: 'Square Thumbnail',
                        values: { width: 512, height: 512, fitMode: 'contain' },
                    },
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
