import { definePluginElement, type ProjectVisualAssetHandle } from '@mvmnt-app/plugin-sdk';
import { Rectangle, VisualMedia, type RenderObject } from '@core/render/render-objects';
import { createBuiltInDefinitionElementClass } from '@core/scene/plugins/built-in-definition';

interface ImageProps extends Readonly<Record<string, unknown>> {
    readonly imageSource: string | null;
    readonly playbackSpeed: number;
    readonly width: number;
    readonly height: number;
    readonly fitMode: 'contain' | 'cover' | 'fill' | 'clip';
    readonly preserveAspectRatio: boolean;
    readonly opacity: number;
    readonly blendMode: GlobalCompositeOperation;
    readonly showBorder: boolean;
    readonly borderColor: string;
    readonly borderWidth: number;
    readonly cornerRadius: number;
    readonly shadowEnabled: boolean;
    readonly shadowColor: string;
    readonly shadowBlur: number;
    readonly shadowOffsetX: number;
    readonly shadowOffsetY: number;
}
interface ImageState {
    readonly handle: ProjectVisualAssetHandle;
    readonly media: VisualMedia;
    readonly bounds: Rectangle;
}

export const image = definePluginElement<ImageProps, ImageState>({
    type: 'image',
    metadata: { name: 'Image', description: 'Display an image with transformations', category: 'Misc' },
    schema: {
        tabs: [
            {
                id: 'content',
                label: 'Content',
                groups: [
                    {
                        id: 'imageSource',
                        label: 'Image Source',
                        collapsed: false,
                        properties: [
                            {
                                key: 'imageSource',
                                label: 'Image',
                                type: 'assetRef',
                                allowedAssetTypes: ['image', 'gif'],
                                default: null,
                            },
                            {
                                key: 'playbackSpeed',
                                label: 'Playback Speed (×)',
                                type: 'number',
                                default: 1,
                                step: 0.1,
                            },
                        ],
                    },
                    {
                        id: 'imageLayout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            { key: 'width', label: 'Width (px)', type: 'number', default: 200, step: 10 },
                            { key: 'height', label: 'Height (px)', type: 'number', default: 200, step: 10 },
                            {
                                key: 'fitMode',
                                label: 'Fit Mode',
                                type: 'select',
                                default: 'cover',
                                options: [
                                    { value: 'contain', label: 'Contain' },
                                    { value: 'cover', label: 'Cover' },
                                    { value: 'fill', label: 'Fill' },
                                    { value: 'clip', label: 'Clip' },
                                ],
                            },
                            {
                                key: 'preserveAspectRatio',
                                label: 'Preserve Aspect Ratio',
                                type: 'boolean',
                                default: true,
                            },
                        ],
                    },
                ],
            },
            {
                id: 'appearance',
                label: 'Appearance',
                groups: [
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            { key: 'opacity', label: 'Opacity', type: 'range', default: 1, min: 0, max: 1, step: 0.01 },
                            {
                                key: 'blendMode',
                                label: 'Blend Mode',
                                type: 'select',
                                default: 'source-over',
                                options: [
                                    { value: 'source-over', label: 'Normal' },
                                    { value: 'screen', label: 'Screen' },
                                    { value: 'multiply', label: 'Multiply' },
                                ],
                            },
                        ],
                    },
                    {
                        id: 'border',
                        label: 'Border',
                        collapsed: true,
                        properties: [
                            { key: 'showBorder', label: 'Show Border', type: 'boolean', default: false },
                            { key: 'borderColor', label: 'Border Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                            {
                                key: 'borderWidth',
                                label: 'Border Width',
                                type: 'range',
                                default: 1,
                                min: 0,
                                max: 50,
                                step: 0.5,
                            },
                            {
                                key: 'cornerRadius',
                                label: 'Corner Radius',
                                type: 'range',
                                default: 0,
                                min: 0,
                                max: 200,
                                step: 1,
                            },
                        ],
                    },
                    {
                        id: 'shadow',
                        label: 'Shadow',
                        collapsed: true,
                        properties: [
                            { key: 'shadowEnabled', label: 'Enable Shadow', type: 'boolean', default: false },
                            { key: 'shadowColor', label: 'Shadow Color', type: 'colorAlpha', default: '#000000FF' },
                            { key: 'shadowBlur', label: 'Shadow Blur', type: 'number', default: 8 },
                            { key: 'shadowOffsetX', label: 'Shadow X', type: 'number', default: 2 },
                            { key: 'shadowOffsetY', label: 'Shadow Y', type: 'number', default: 2 },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    create(_props, context) {
        return {
            handle: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200, { layoutParticipation: 'exclude' }),
            bounds: new Rectangle(0, 0, 200, 200, { fillColor: null }),
        };
    },
    render(props, state, time) {
        state.bounds.width = props.width;
        state.bounds.height = props.height;
        const asset = state.handle.update(props.imageSource);
        state.media
            .setResource(asset.resource as never, asset.status)
            .setLocalTime(time.seconds * props.playbackSpeed)
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode)
            .setPreserveAspectRatio(props.preserveAspectRatio);
        state.media.opacity = props.opacity;
        state.media.blendMode = props.blendMode === 'source-over' ? null : props.blendMode;
        if (props.shadowEnabled)
            state.media.setShadow(props.shadowColor, props.shadowBlur, props.shadowOffsetX, props.shadowOffsetY);
        else state.media.setShadow(null, 0, 0, 0);
        const result: RenderObject[] = [state.bounds, state.media];
        if (props.showBorder && props.borderWidth > 0) {
            const border = new Rectangle(0, 0, props.width, props.height, {
                fillColor: null,
                strokeColor: props.borderColor,
                strokeWidth: props.borderWidth,
            });
            border.cornerRadius = props.cornerRadius;
            result.push(border);
        }
        return result;
    },
});

export const ImageElement = createBuiltInDefinitionElementClass(image);
