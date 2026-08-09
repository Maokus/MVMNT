import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle, VisualMedia } from '@mvmnt-app/plugin-sdk/render';
export const simpleImage = definePluginElement({
    type: 'simple-image',
    metadata: { name: 'Simple Image', description: 'Displays an image or animated GIF', category: 'Custom' },
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
    create(_props, context) {
        return {
            handle: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200, { layoutParticipation: 'exclude' }),
            bounds: new Rectangle(0, 0, 200, 200),
        };
    },
    render(props, state, time) {
        state.bounds.width = props.width;
        state.bounds.height = props.height;
        const asset = state.handle.update(props.imageSource);
        state.media
            .setResource(asset.resource as never, asset.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height)
            .setFitMode(props.fitMode);
        return [state.bounds, state.media];
    },
});
