// Template: SDK 2 bundled grid-atlas element.
import { definePluginElement, type BundledVisualAssetHandle } from '@mvmnt/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt/plugin-sdk/render';

const COLUMNS = 4;
const ROWS = 2;
interface Props extends Readonly<Record<string, unknown>> { readonly frameIndex: number; readonly size: number }
interface State { readonly sheet: BundledVisualAssetHandle; readonly media: VisualMedia; readonly bounds: Rectangle }

export const gridAtlas = definePluginElement<Props, State>({
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
