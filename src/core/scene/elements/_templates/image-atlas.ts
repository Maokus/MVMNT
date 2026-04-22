// Template: Atlas Image Element
// Minimal starting point for displaying a sprite atlas (spritesheet) animation.
// Copy this file into your plugin and adapt the layout to your spritesheet grid.
import {
    SceneElement,
    prop,
    insertElementGroups,
    visualAssetStore,
    makeAtlasKey,
    VisualMediaPlayback,
    type AtlasLayout,
    type ImageSource,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class AtlasImageElement extends SceneElement {
    private _currentAssetKey: string | null = null;
    private readonly _playback = new VisualMediaPlayback();
    private _renderObject: VisualMedia | null = null;
    private _layoutRect: Rectangle | null = null;

    constructor(id: string = 'atlasImage', config: Record<string, unknown> = {}) {
        super('atlas-image', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Atlas Image',
            description: 'Sprite atlas (spritesheet) animation',
            category: 'Custom',
        }, [
            {
                id: 'atlasSource',
                label: 'Sprite Sheet',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.file('imageSource', 'Sprite Sheet', { accept: 'image/*' }),
                    prop.number('width', 'Display Width', 200, { step: 10 }),
                    prop.number('height', 'Display Height', 200, { step: 10 }),
                ],
            },
            {
                id: 'atlasLayout',
                label: 'Atlas Layout',
                variant: 'basic',
                collapsed: false,
                description: 'Describe the uniform grid of frames in the sprite sheet.',
                properties: [
                    prop.number('columns', 'Columns', 4, { min: 1, step: 1 }),
                    prop.number('rows', 'Rows', 4, { min: 1, step: 1 }),
                    prop.number('frameRate', 'Frame Rate (fps)', 12, { min: 1, step: 1 }),
                    prop.number('frameCount', 'Frame Count', 0, {
                        min: 0,
                        step: 1,
                        description: '0 = columns × rows (use all cells)',
                    }),
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

        const src = (props.imageSource as ImageSource | null) ?? null;
        const columns = Math.max(1, Math.round((props.columns as number) ?? 4));
        const rows = Math.max(1, Math.round((props.rows as number) ?? 4));
        const frameRate = Math.max(1, (props.frameRate as number) ?? 12);
        const frameCountRaw = Math.max(0, Math.round((props.frameCount as number) ?? 0));

        const layout: AtlasLayout = {
            columns,
            rows,
            frameCount: frameCountRaw > 0 ? frameCountRaw : undefined,
            frameDurationMs: 1000 / frameRate,
        };

        // The asset key encodes the full layout — different grid configs of the
        // same source are cached as separate assets.
        const key = src ? makeAtlasKey(src, layout) : null;

        if (key !== this._currentAssetKey) {
            if (this._currentAssetKey) visualAssetStore.release(this._currentAssetKey);
            this._currentAssetKey = key;
            if (src && key) {
                visualAssetStore.loadAtlas(src, layout);
                visualAssetStore.retain(key);
            }
        }

        const w = (props.width as number) ?? 200;
        const h = (props.height as number) ?? 200;

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
            .setFitMode('contain')
            .setPreserveAspectRatio(true);

        return [this._layoutRect, this._renderObject];
    }
}
