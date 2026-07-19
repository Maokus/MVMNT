// Template: SDK 2 animated Sparrow atlas with bundled defaults.
import { definePluginElement, type BundledVisualAssetHandle, type ProjectVisualAssetHandle } from '@mvmnt/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt/plugin-sdk/render';

interface Props extends Readonly<Record<string, unknown>> { readonly atlas: string | null; readonly width: number; readonly height: number }
interface State { readonly atlas: BundledVisualAssetHandle; readonly background: BundledVisualAssetHandle; readonly override: ProjectVisualAssetHandle; readonly media: VisualMedia; readonly bg: VisualMedia; readonly bounds: Rectangle }

export const atlasImage = definePluginElement<Props, State>({
    type: 'atlas-image',
    metadata: { name: 'Atlas Image', description: 'Sparrow atlas animation with a bundled default', category: 'Custom' },
    schema: { tabs: [{ id: 'properties', label: 'Properties', groups: [{ id: 'atlasSource', label: 'Atlas', collapsed: false, properties: [
        { key: 'atlas', label: 'Override Atlas', type: 'assetRef', allowedAssetTypes: ['sparrow'], default: null },
        { key: 'width', label: 'Display Width', type: 'number', default: 200, step: 10 },
        { key: 'height', label: 'Display Height', type: 'number', default: 200, step: 10 },
    ] }] }] },
    capabilities: { required: [], optional: [] },
    create(_props, context) { return {
        atlas: context.assets.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml'),
        background: context.assets.bundledImage('BOYFRIEND.png'), override: context.assets.project(),
        media: new VisualMedia(0, 0, 200, 200, { layoutBoundsMode: 'none' }),
        bg: new VisualMedia(0, 0, 200, 200, { layoutBoundsMode: 'none' }), bounds: new Rectangle(0, 0, 200, 200),
    }; },
    render(props, state, time) {
        state.bounds.width = props.width; state.bounds.height = props.height;
        const bg = state.background.get();
        state.bg.setResource(bg.resource as never, bg.status).setLocalTime(0).setDimensions(props.width, props.height).setFitMode('contain');
        const atlas = props.atlas ? state.override.update(props.atlas) : state.atlas.get();
        state.media.setResource(atlas.resource as never, atlas.status).setLocalTime(time.seconds).setDimensions(props.width, props.height).setFitMode('contain');
        return [state.bounds, state.bg, state.media];
    },
});
