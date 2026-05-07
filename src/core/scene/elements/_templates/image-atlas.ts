// Template: Animated Sprite / Sparrow Atlas Element
// Animates a Sparrow-format sprite atlas (PNG + XML) loaded from the plugin's
// bundled assets. The default atlas (BOYFRIEND.png + BOYFRIEND.xml) is always
// available without any user configuration. Users can optionally override it
// with any Sparrow atlas from their Asset Manager.
//
// Assets required in your plugin's assets/ directory:
//   assets/BOYFRIEND.png   — the spritesheet image
//   assets/BOYFRIEND.xml   — the Sparrow XML frame definitions
//
// All handles created via this.bundledSparrow(), this.bundledSprite(), and
// this.visualHandle() are auto-tracked and destroyed on dispose —
// no onDestroy() override needed.
import {
    SceneElement,
    prop,
    insertElementGroups,
    tab,
    VisualMediaPlayback,
    resolveProjectAssetDescriptor,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class AtlasImageElement extends SceneElement {
    // Bundled Sparrow atlas — loaded from assets/BOYFRIEND.png + assets/BOYFRIEND.xml.
    // Automatically registered in the Asset Manager as a 'sparrow' entry on first render.
    private readonly _bundledAtlas = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
    // Bundled plain image — the same PNG rendered as a static background.
    private readonly _bundledBg = this.bundledSprite('BOYFRIEND.png');
    // Handle for an optional user-selected sparrow atlas override.
    private readonly _atlasOverrideHandle = this.visualHandle();
    private readonly _playback = new VisualMediaPlayback();
    private readonly _media = new VisualMedia(0, 0, 200, 200, { layoutBoundsMode: 'none' });
    private readonly _bg = new VisualMedia(0, 0, 200, 200, { layoutBoundsMode: 'none' });
    private readonly _layoutRect = new Rectangle(0, 0, 200, 200, null, null);

    constructor(id: string = 'atlasImage', config: Record<string, unknown> = {}) {
        super('atlas-image', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Atlas Image',
                description: 'Sparrow atlas animation with a bundled default',
                category: 'Custom',
            },
            [
                tab.properties([
                    {
                        id: 'atlasSource',
                        label: 'Atlas',
                        variant: 'basic',
                        collapsed: false,
                        properties: [
                            prop.sparrowAsset('atlas', 'Override Atlas', {
                                description: 'Leave empty to use the bundled BOYFRIEND atlas.',
                            }),
                            prop.number('width', 'Display Width', 200, { step: 10 }),
                            prop.number('height', 'Display Height', 200, { step: 10 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const w = (props.width as number) ?? 200;
        const h = (props.height as number) ?? 200;

        this._layoutRect.width = w;
        this._layoutRect.height = h;

        // Background: the raw spritesheet PNG, rendered as a static image.
        const bgResult = this._bundledBg.get();
        this._bg
            .setResource(bgResult.resource, bgResult.status)
            .setLocalTime(0)
            .setDimensions(w, h)
            .setFitMode('contain');

        // Foreground: animated Sparrow atlas (bundled default or user override).
        const overrideId = props.atlas as string | null;
        const { resource, status } = overrideId
            ? this._atlasOverrideHandle.update(resolveProjectAssetDescriptor(overrideId))
            : this._bundledAtlas.get();

        this._media
            .setResource(resource, status)
            .setLocalTime(this._playback.computeLocalTime(targetTime))
            .setDimensions(w, h)
            .setFitMode('contain');

        return [this._layoutRect, this._bg, this._media];
    }
}
