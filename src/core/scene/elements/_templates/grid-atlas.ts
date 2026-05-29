// Template: Bundled Grid Atlas Element
// Displays a bundled spritesheet divided into a uniform grid of frames.
// Use this when your asset is a grid-layout spritesheet with no Sparrow XML.
// The frame to display is controlled via setLocalTime(frameIndex) when
// frameDurationMs is set to 1000 in the layout.
//
// Assets required in your plugin's assets/ directory:
//   assets/sprites.png   — the grid spritesheet image
//
// The handle created via this.bundledGridAtlas() is auto-tracked and destroyed
// on dispose — no onDestroy() override needed.
import { SceneElement, prop, insertElementConfig, tab } from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// Adjust these constants to match your actual spritesheet layout.
const COLUMNS = 4;
const ROWS = 2;

export class GridAtlasElement extends SceneElement {
    // Grid atlas — loaded from assets/sprites.png, divided into COLUMNS × ROWS cells.
    // frameDurationMs: 1000 means setLocalTime(N) freezes on frame index N.
    private readonly _sheet = this.bundledGridAtlas('sprites.png', {
        columns: COLUMNS,
        rows: ROWS,
        frameDurationMs: 1000,
    });
    private readonly _media = new VisualMedia(0, 0, 128, 128, { layoutBoundsMode: 'none' });
    private readonly _layoutRect = new Rectangle(0, 0, 128, 128, { fillColor: null });

    constructor(id: string = 'gridAtlas', config: Record<string, unknown> = {}) {
        super('grid-atlas', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Grid Atlas',
                description: 'Displays a single frame from a grid-layout spritesheet',
                category: 'Custom',
            },
            [
                tab.properties([
                    {
                        id: 'atlasSettings',
                        label: 'Atlas',
                        collapsed: false,
                        properties: [
                            prop.number('frameIndex', 'Frame Index', 0, {
                                min: 0,
                                max: COLUMNS * ROWS - 1,
                                step: 1,
                                description: 'Which frame to display (0-based, left-to-right, top-to-bottom).',
                            }),
                            prop.number('size', 'Size', 128, { step: 8 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const frameIndex = (props.frameIndex as number) ?? 0;
        const size = (props.size as number) ?? 128;

        this._layoutRect.width = size;
        this._layoutRect.height = size;

        const { resource, status } = this._sheet.get();

        this._media
            .setResource(resource, status)
            .setAnimation(null)
            .setLocalTime(frameIndex)
            .setDimensions(size, size)
            .setFitMode('contain');

        return [this._layoutRect, this._media];
    }
}
