// Template: SDK 2 bundled grid-atlas element.
import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt-app/plugin-sdk/render';

const COLUMNS = 4;
const ROWS = 2;
export const gridAtlas = definePluginElement({
    type: 'grid-atlas',
    metadata: { name: 'Grid Atlas', description: 'Displays a single frame from a grid-layout spritesheet', category: 'Custom' },
    schema: { tabs: [{ id: 'properties', label: 'Properties', groups: [{ id: 'atlasSettings', label: 'Atlas', collapsed: false, properties: [
        { key: 'frameIndex', label: 'Frame Index', type: 'number', default: 0, min: 0, max: COLUMNS * ROWS - 1, step: 1 },
        { key: 'size', label: 'Size', type: 'number', default: 128, step: 8 },
    ] }] }] },
    capabilities: { required: [], optional: [] },
    create(_props, context) { return {
        sheet: context.assets.bundledGridAtlas('sprites.png', { columns: COLUMNS, rows: ROWS, frameDurationMs: 1000 }),
        media: new VisualMedia(0, 0, 128, 128, { layoutBoundsMode: 'none' }), bounds: new Rectangle(0, 0, 128, 128),
    }; },
    render(props, state) {
        state.bounds.width = props.size; state.bounds.height = props.size;
        const asset = state.sheet.get();
        state.media.setResource(asset.resource as never, asset.status).setAnimation(null).setLocalTime(props.frameIndex).setDimensions(props.size, props.size).setFitMode('contain');
        return [state.bounds, state.media];
    },
});
