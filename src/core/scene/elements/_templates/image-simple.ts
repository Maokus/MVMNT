// Template: Simple Image Element
// Minimal starting point for displaying an image or animated GIF.
// Copy this file into your plugin and adapt as needed.
import {
    SceneElement,
    prop,
    insertElementGroups,
    visualAssetStore,
    makeImageKey,
    VisualMediaPlayback,
    type ImageSource,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class SimpleImageElement extends SceneElement {
    private _currentAssetKey: string | null = null;
    private readonly _playback = new VisualMediaPlayback();
    private _renderObject: VisualMedia | null = null;
    private _layoutRect: Rectangle | null = null;

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
                    prop.file('imageSource', 'Image File', { accept: 'image/*' }),
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
        if (this._currentAssetKey) visualAssetStore.release(this._currentAssetKey);
        super.onDestroy();
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        // Compute the asset key; load and retain when it changes.
        const src = (props.imageSource as ImageSource | null) ?? null;
        const key = src ? makeImageKey(src) : null;
        if (key !== this._currentAssetKey) {
            if (this._currentAssetKey) visualAssetStore.release(this._currentAssetKey);
            this._currentAssetKey = key;
            if (src && key) {
                visualAssetStore.load(src);
                visualAssetStore.retain(key);
            }
        }

        const w = props.width as number ?? 200;
        const h = props.height as number ?? 200;

        if (!this._layoutRect) {
            this._layoutRect = new Rectangle(0, 0, w, h, null, null);
        } else {
            this._layoutRect.width = w;
            this._layoutRect.height = h;
        }

        if (!this._renderObject) {
            this._renderObject = new VisualMedia(0, 0, w, h, { includeInLayoutBounds: false });
        }

        const asset = key ? visualAssetStore.get(key) : undefined;
        const localTime = this._playback.computeLocalTime(targetTime, asset?.clips);

        this._renderObject
            .setAsset(asset ?? null, asset?.status ?? (src ? 'loading' : 'idle'))
            .setLocalTime(localTime)
            .setDimensions(w, h)
            .setFitMode((props.fitMode as any) ?? 'contain')
            .setPreserveAspectRatio(true);

        return [this._layoutRect, this._renderObject];
    }
}
