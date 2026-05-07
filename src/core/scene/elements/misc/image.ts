// Image scene element — displays still images and animated GIFs via the
// unified visual resource system. For sprite atlas / spritesheet support, use
// the atlas-image template instead.
import {
    SceneElement,
    type EnhancedConfigSchema,
    insertElementGroups,
    prop,
    VisualMediaPlayback,
    propGroup,
    tab,
} from '@mvmnt/plugin-sdk';

import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import { VisualResourceHandle } from '@core/resources/visual-resource-handle';
import { resolveProjectAssetDescriptor } from '@state/visualAssetRegistryStore';

export class ImageElement extends SceneElement {
    private _renderObject: VisualMedia | null = null;
    private _layoutRect: Rectangle | null = null;
    private readonly _playback = new VisualMediaPlayback();
    private readonly _assetHandle = new VisualResourceHandle();

    constructor(id: string = 'image', config: { [key: string]: any } = {}) {
        super('image', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Image',
                description: 'Display an image with transformations',
                category: 'Misc',
            },
            [
                tab.content([
                    {
                        id: 'imageSource',
                        label: 'Image Source',
                        collapsed: false,
                        description: 'Pick the artwork and playback speed for animated assets.',
                        properties: [
                            prop.imageAsset('imageSource', 'Image'),
                            prop.number('playbackSpeed', 'Playback Speed (×)', 1, { step: 0.1 }),
                        ],
                    },
                    {
                        id: 'imageLayout',
                        label: 'Layout',
                        collapsed: false,
                        description: 'Size and crop behaviour for the image frame.',
                        properties: [
                            prop.number('width', 'Width (px)', 200, { step: 10 }),
                            prop.number('height', 'Height (px)', 200, { step: 10 }),
                            prop.select('fitMode', 'Fit Mode', 'contain', [
                                { value: 'contain', label: 'Contain (fit within bounds)' },
                                { value: 'cover', label: 'Cover (fill bounds, may crop)' },
                                { value: 'fill', label: 'Fill (stretch to fit)' },
                                { value: 'clip', label: 'Clip (native pixel size)' },
                            ]),
                            prop.boolean('preserveAspectRatio', 'Preserve Aspect Ratio', true, {
                                visibleWhen: [{ key: 'fitMode', notEquals: 'fill' }],
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    propGroup.appearance({ blendMode: true }),
                    {
                        id: 'border',
                        label: 'Border',
                        collapsed: true,
                        properties: [
                            prop.boolean('showBorder', 'Show Border', false),
                            prop.color('borderColor', 'Border Color', '#ffffff', {
                                visibleWhen: [{ key: 'showBorder', truthy: true }],
                            }),
                            prop.range('borderWidth', 'Border Width', 1, {
                                min: 0,
                                max: 50,
                                step: 0.5,
                                visibleWhen: [{ key: 'showBorder', truthy: true }],
                            }),
                            prop.range('cornerRadius', 'Corner Radius', 0, {
                                min: 0,
                                max: 200,
                                step: 1,
                                visibleWhen: [{ key: 'showBorder', truthy: true }],
                            }),
                        ],
                    },
                    propGroup.shadow(),
                ]),
            ]
        );
    }

    protected override onDestroy(): void {
        this._assetHandle.destroy();
        super.onDestroy();
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        if (!this._renderObject) {
            this._renderObject = new VisualMedia(0, 0, props.width, props.height, { layoutBoundsMode: 'none' });
        }

        if (!this._layoutRect) {
            this._layoutRect = new Rectangle(0, 0, props.width, props.height, null, null);
        } else {
            this._layoutRect.width = props.width;
            this._layoutRect.height = props.height;
        }

        this._playback.speed = props.playbackSpeed ?? 1;

        const descriptor = resolveProjectAssetDescriptor(props.imageSource as string | null);
        const { resource, status } = this._assetHandle.update(descriptor);

        this._renderObject
            .setResource(resource, status)
            .setLocalTime(this._playback.computeLocalTime(targetTime))
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode ?? 'contain')
            .setPreserveAspectRatio(props.preserveAspectRatio ?? true);

        this._renderObject.opacity = props.opacity ?? 1;
        const bm = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;
        this._renderObject.blendMode = bm === 'source-over' ? null : bm;

        const result: RenderObject[] = [this._layoutRect, this._renderObject];
        const showBorder = props.showBorder ?? false;
        const borderWidth = props.borderWidth ?? 0;
        if (showBorder && borderWidth > 0) {
            const borderRect = new Rectangle(
                0,
                0,
                props.width,
                props.height,
                null,
                props.borderColor ?? '#ffffff',
                borderWidth
            );
            borderRect.cornerRadius = props.cornerRadius ?? 0;
            result.push(borderRect);
        }
        return result;
    }
}
