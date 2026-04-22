// Image scene element — displays still images, animated GIFs, and sprite atlases
// via the unified VisualAsset system.
import { SceneElement, type EnhancedConfigSchema, insertElementGroups, prop } from '@mvmnt/plugin-sdk';
import { visualAssetStore } from '@core/resources/visual-asset-store';
import { VisualMediaPlayback } from '@core/resources/visual-media-playback';
import type { AtlasLayout } from '@core/resources/visual-asset';

import { VisualMedia, type RenderObject } from '@mvmnt/plugin-sdk/render';

export class ImageElement extends SceneElement {
    private _currentImageSource: string | File | null = null;
    private _currentAtlasKey: string = '';
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
            {
                id: 'atlasLayout',
                label: 'Sprite Atlas',
                variant: 'basic',
                collapsed: true,
                description: 'Treat the image as a sprite sheet with a uniform grid of animation frames.',
                properties: [
                    prop.number('atlasColumns', 'Columns', 1, { min: 1, step: 1, description: 'Number of frame columns in the sprite sheet.' }),
                    prop.number('atlasRows', 'Rows', 1, { min: 1, step: 1, description: 'Number of frame rows in the sprite sheet.' }),
                    prop.number('atlasFrameRate', 'Frame Rate (fps)', 12, { min: 1, step: 1, description: 'Playback speed for atlas frames.', visibleWhen: [{ key: 'atlasColumns', notEquals: 1 }, { key: 'atlasRows', notEquals: 1 }] }),
                    prop.number('atlasFrameCount', 'Frame Count', 0, { min: 0, step: 1, description: 'Total frames to use (0 = columns × rows).', visibleWhen: [{ key: 'atlasColumns', notEquals: 1 }, { key: 'atlasRows', notEquals: 1 }] }),
                ],
            },
        ]);
    }

    protected override onDestroy(): void {
        if (this._currentImageSource) {
            visualAssetStore.release(this._currentImageSource);
        }
        super.onDestroy();
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const atlasColumns = Math.max(1, Math.round((props.atlasColumns as number) ?? 1));
        const atlasRows = Math.max(1, Math.round((props.atlasRows as number) ?? 1));
        const atlasFrameRate = Math.max(1, (props.atlasFrameRate as number) ?? 12);
        const atlasFrameCountRaw = Math.max(0, Math.round((props.atlasFrameCount as number) ?? 0));
        const atlasFrameCount = atlasFrameCountRaw > 0 ? atlasFrameCountRaw : undefined;
        const atlasKey = `${atlasColumns}:${atlasRows}:${atlasFrameRate}:${atlasFrameCount ?? ''}`;

        const newSrc = props.imageSource ?? null;
        if (newSrc !== this._currentImageSource || atlasKey !== this._currentAtlasKey) {
            if (this._currentImageSource) {
                visualAssetStore.release(this._currentImageSource);
            }
            this._currentImageSource = newSrc;
            this._currentAtlasKey = atlasKey;
            if (newSrc) {
                if (atlasColumns > 1 || atlasRows > 1) {
                    const layout: AtlasLayout = {
                        columns: atlasColumns,
                        rows: atlasRows,
                        frameCount: atlasFrameCount,
                        frameDurationMs: 1000 / atlasFrameRate,
                    };
                    visualAssetStore.loadAtlas(newSrc, layout);
                } else {
                    visualAssetStore.load(newSrc);
                }
                visualAssetStore.retain(newSrc);
            }
        }

        if (!this._renderObject) {
            this._renderObject = new VisualMedia(0, 0, props.width, props.height);
        }

        const asset = newSrc ? visualAssetStore.get(newSrc) : undefined;

        this._playback.speed = props.playbackSpeed ?? 1;
        const localTime = this._playback.computeLocalTime(targetTime, asset?.clips);

        this._renderObject
            .setAsset(asset ?? null, asset?.status ?? (newSrc ? 'loading' : 'idle'))
            .setLocalTime(localTime)
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode ?? 'contain')
            .setPreserveAspectRatio(props.preserveAspectRatio ?? true);

        return [this._renderObject];
    }
}
