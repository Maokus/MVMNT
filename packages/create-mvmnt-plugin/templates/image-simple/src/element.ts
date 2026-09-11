import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt-app/plugin-sdk/render';
export const simpleImage = definePluginElement({
    type: '{{ELEMENT_TYPE}}',
    metadata: { name: '{{ELEMENT_NAME}}', description: '{{ELEMENT_DESCRIPTION}}', category: 'Custom' },
    schema: {
        tabs: [
            tab.properties([
                group('imageSource', 'Image', [
                    prop.imageAsset('imageSource', 'Image'),
                    prop.number('width', 'Width', 200, { step: 10 }),
                    prop.number('height', 'Height', 200, { step: 10 }),
                    prop.select('fitMode', 'Fit Mode', 'contain', ['contain', 'cover', 'fill', 'clip']),
                ]),
            ]),
        ],
    },
    createResources(context) {
        return {
            handle: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200, { layoutParticipation: 'exclude' }),
            bounds: new Rectangle(0, 0, 200, 200),
        };
    },
    render({ props, resources, time }) {
        resources.bounds.width = props.width;
        resources.bounds.height = props.height;
        const asset = resources.handle.update(props.imageSource);
        resources.media
            .setResource(asset.resource as never, asset.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode);
        return [resources.bounds, resources.media];
    },
});
