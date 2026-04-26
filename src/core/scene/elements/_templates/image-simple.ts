// Template: Simple Image Element
// Displays a static image or animated GIF from the visual asset registry.
// Copy this file into your plugin and adapt as needed.
import {
    SceneElement,
    prop,
    insertElementGroups,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class SimpleImageElement extends SceneElement {
    private readonly _media = new VisualMedia(0, 0, 200, 200, { includeInLayoutBounds: false });
    private readonly _layoutRect = new Rectangle(0, 0, 200, 200, null, null);

    constructor(id: string = 'simpleImage', config: Record<string, unknown> = {}) {
        super('simple-image', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Simple Image',
            description: 'Displays an image or animated GIF',
            category: 'Custom',
        }, [
            {
                id: 'imageSource',
                label: 'Image',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.imageAsset('imageSource', 'Image'),
                    prop.number('width', 'Width', 200, { step: 10 }),
                    prop.number('height', 'Height', 200, { step: 10 }),
                    prop.select('fitMode', 'Fit Mode', 'contain', [
                        { value: 'contain', label: 'Contain' },
                        { value: 'cover', label: 'Cover' },
                        { value: 'fill', label: 'Fill' },
                        { value: 'none', label: 'Original size' },
                    ]),
                ],
            },
        ]);
    }

    protected override onDestroy(): void {
        this._media.destroy();
        super.onDestroy();
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const w = (props.width as number) ?? 200;
        const h = (props.height as number) ?? 200;

        this._layoutRect.width = w;
        this._layoutRect.height = h;

        this._media
            .setAssetId(props.imageSource as string | null)
            .setPlayback(1, targetTime)
            .setDimensions(w, h)
            .setFitMode((props.fitMode as any) ?? 'contain');

        return [this._layoutRect, this._media];
    }
}
