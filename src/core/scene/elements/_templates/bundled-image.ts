// Template: Bundled Image Element
// Displays a bundled image or animated GIF that ships with the plugin's assets/
// directory. The default asset is loaded automatically — no user configuration
// required. Users can optionally override it with any image from their Asset Manager.
//
// Assets required in your plugin's assets/ directory:
//   assets/cooltext491233707844001.gif   — the default bundled image/GIF
import { SceneElement, prop, insertElementGroups, VisualMediaPlayback, VisualResourceHandle, resolveProjectAssetDescriptor } from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class BundledImageElement extends SceneElement {
    // Bundled asset — loaded from assets/cooltext491233707844001.gif.
    // Automatically registered in the Asset Manager on first render.
    private readonly _bundled = this.bundledSprite('cooltext491233707844001.gif');
    private readonly _overrideHandle = new VisualResourceHandle();
    private readonly _playback = new VisualMediaPlayback();
    private readonly _media = new VisualMedia(0, 0, 200, 200, { includeInLayoutBounds: false });
    private readonly _layoutRect = new Rectangle(0, 0, 200, 200, null, null);

    constructor(id: string = 'bundledImage', config: Record<string, unknown> = {}) {
        super('bundled-image', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Bundled Image',
                description: 'Displays a bundled image with optional user override',
                category: 'Custom',
            },
            [
                {
                    id: 'imageSource',
                    label: 'Image',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        prop.imageAsset('imageSource', 'Override Image', {
                            description: 'Leave empty to use the bundled default.',
                        }),
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
            ]
        );
    }

    protected override onDestroy(): void {
        this._bundled.destroy();
        this._overrideHandle.destroy();
        super.onDestroy();
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const w = (props.width as number) ?? 200;
        const h = (props.height as number) ?? 200;
        const fitMode = (props.fitMode as 'contain' | 'cover' | 'fill' | 'none') ?? 'contain';

        this._layoutRect.width = w;
        this._layoutRect.height = h;

        const overrideId = props.imageSource as string | null;
        const { resource, status } = overrideId
            ? this._overrideHandle.update(resolveProjectAssetDescriptor(overrideId))
            : this._bundled.get();

        this._media
            .setResource(resource, status)
            .setLocalTime(this._playback.computeLocalTime(targetTime, resource?.animations))
            .setDimensions(w, h)
            .setFitMode(fitMode);

        return [this._layoutRect, this._media];
    }
}
