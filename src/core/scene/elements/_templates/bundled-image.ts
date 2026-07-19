// Template: SDK 2 bundled image/GIF with an optional project override.
import { definePluginElement, type BundledVisualAssetHandle, type ProjectVisualAssetHandle } from '@mvmnt/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt/plugin-sdk/render';

interface Props extends Readonly<Record<string, unknown>> { readonly imageSource: string | null; readonly width: number; readonly height: number; readonly fitMode: 'contain' | 'cover' | 'fill' | 'clip' }
interface State { readonly bundled: BundledVisualAssetHandle; readonly override: ProjectVisualAssetHandle; readonly media: VisualMedia; readonly bounds: Rectangle }

export const bundledImage = definePluginElement<Props, State>({
    type: 'bundled-image',
    metadata: { name: 'Bundled Image', description: 'Displays a bundled image with optional user override', category: 'Custom' },
    schema: { tabs: [{ id: 'properties', label: 'Properties', groups: [{ id: 'imageSource', label: 'Image', collapsed: false, properties: [
        { key: 'imageSource', label: 'Override Image', type: 'assetRef', allowedAssetTypes: ['image', 'gif'], default: null },
        { key: 'width', label: 'Width', type: 'number', default: 200, step: 10 },
        { key: 'height', label: 'Height', type: 'number', default: 200, step: 10 },
        { key: 'fitMode', label: 'Fit Mode', type: 'select', default: 'contain', options: [
            { value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' },
            { value: 'fill', label: 'Fill' }, { value: 'clip', label: 'Clip (native size)' },
        ] },
    ] }] }] },
    capabilities: { required: [], optional: [] },
    create(_props, context) { return {
        bundled: context.assets.bundledImage('cooltext491233707844001.gif'), override: context.assets.project(),
        media: new VisualMedia(0, 0, 200, 200, { layoutBoundsMode: 'none' }), bounds: new Rectangle(0, 0, 200, 200),
    }; },
    render(props, state, time) {
        state.bounds.width = props.width; state.bounds.height = props.height;
        const asset = props.imageSource ? state.override.update(props.imageSource) : state.bundled.get();
        state.media.setResource(asset.resource as never, asset.status).setLocalTime(time.seconds).setDimensions(props.width, props.height).setFitMode(props.fitMode);
        return [state.bounds, state.media];
    },
});
