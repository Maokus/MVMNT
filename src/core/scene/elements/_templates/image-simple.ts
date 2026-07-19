// Template: SDK 2 project image/GIF element.
import { definePluginElement, type ProjectVisualAssetHandle } from '@mvmnt/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt/plugin-sdk/render';

interface ImageProps extends Readonly<Record<string, unknown>> {
    readonly imageSource: string | null;
    readonly width: number;
    readonly height: number;
    readonly fitMode: 'contain' | 'cover' | 'fill' | 'clip';
}
interface ImageState { readonly handle: ProjectVisualAssetHandle; readonly media: VisualMedia; readonly bounds: Rectangle }

export const simpleImage = definePluginElement<ImageProps, ImageState>({
    type: 'simple-image',
    metadata: { name: 'Simple Image', description: 'Displays an image or animated GIF', category: 'Custom' },
    schema: { tabs: [{ id: 'properties', label: 'Properties', groups: [{ id: 'imageSource', label: 'Image', collapsed: false, properties: [
        { key: 'imageSource', label: 'Image', type: 'assetRef', allowedAssetTypes: ['image', 'gif'], default: null },
        { key: 'width', label: 'Width', type: 'number', default: 200, step: 10 },
        { key: 'height', label: 'Height', type: 'number', default: 200, step: 10 },
        { key: 'fitMode', label: 'Fit Mode', type: 'select', default: 'contain', options: [
            { value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' },
            { value: 'fill', label: 'Fill' }, { value: 'clip', label: 'Clip (native size)' },
        ] },
    ] }] }] },
    capabilities: { required: [], optional: [] },
    create(_props, context) {
        return { handle: context.assets.project(), media: new VisualMedia(0, 0, 200, 200, { layoutBoundsMode: 'none' }), bounds: new Rectangle(0, 0, 200, 200, { fillColor: undefined }) };
    },
    render(props, state, time) {
        state.bounds.width = props.width; state.bounds.height = props.height;
        const asset = state.handle.update(props.imageSource);
        state.media.setResource(asset.resource as never, asset.status).setLocalTime(time.seconds).setDimensions(props.width, props.height).setFitMode(props.fitMode);
        return [state.bounds, state.media];
    },
});
