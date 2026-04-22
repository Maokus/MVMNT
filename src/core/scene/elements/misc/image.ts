// Image scene element — displays still images and animated GIFs via the
// unified VisualAsset system. For sprite atlas / spritesheet support, use
// the atlas-image template instead.
import { SceneElement, type EnhancedConfigSchema, insertElementGroups, prop } from '@mvmnt/plugin-sdk';
import { ImageAssetSlot } from '@core/resources/visual-asset-slot';
import { VisualMediaPlayback } from '@core/resources/visual-media-playback';

import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';

export class ImageElement extends SceneElement {
    private readonly _image = new ImageAssetSlot();
    private _renderObject: VisualMedia | null = null;
    private _layoutRect: Rectangle | null = null;
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

    protected override onDestroy(): void {
        this._image.destroy();
        super.onDestroy();
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const { asset, status } = this._image.update(props.imageSource ?? null);

        if (!this._renderObject) {
            this._renderObject = new VisualMedia(0, 0, props.width, props.height, { includeInLayoutBounds: false });
        }

        if (!this._layoutRect) {
            this._layoutRect = new Rectangle(0, 0, props.width, props.height, null, null);
        } else {
            this._layoutRect.width = props.width;
            this._layoutRect.height = props.height;
        }

        this._playback.speed = props.playbackSpeed ?? 1;
        const localTime = this._playback.computeLocalTime(targetTime, asset?.clips);

        this._renderObject
            .setAsset(asset, status)
            .setLocalTime(localTime)
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode ?? 'contain')
            .setPreserveAspectRatio(props.preserveAspectRatio ?? true);

        return [this._layoutRect, this._renderObject];
    }
}
