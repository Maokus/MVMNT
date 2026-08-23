import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt-app/plugin-sdk/render';
const COLUMNS = 4,
    ROWS = 2;
// Add assets/sprites.png before using this bundled-media template.
export const gridAtlas = definePluginElement({
    type: 'grid-atlas',
    metadata: {
        name: 'Grid Atlas',
        description: 'Displays a single frame from a grid spritesheet',
        category: 'Custom',
    },
    schema: {
        tabs: [
            tab.properties([
                group('atlas', 'Atlas', [
                    prop.number('frameIndex', 'Frame Index', 0, { min: 0, max: COLUMNS * ROWS - 1 }),
                    prop.number('size', 'Size', 128),
                ]),
            ]),
        ],
    },
    create(_props, context) {
        return {
            sheet: context.assets.bundledGridAtlas('sprites.png', {
                columns: COLUMNS,
                rows: ROWS,
                frameDurationMs: 1000,
            }),
            media: new VisualMedia(0, 0, 128, 128),
            bounds: new Rectangle(0, 0, 128, 128),
        };
    },
    render(props, instanceState) {
        instanceState.bounds.width = instanceState.bounds.height = props.size;
        const asset = instanceState.sheet.get();
        instanceState.media
            .setResource(asset.resource as never, asset.status)
            .setAnimation(null)
            .setLocalTime(props.frameIndex)
            .setDimensions(props.size, props.size);
        return [instanceState.bounds, instanceState.media];
    },
});
