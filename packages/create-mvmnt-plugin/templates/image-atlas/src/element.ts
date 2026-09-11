import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';
export const atlasImage = definePluginElement({
    type: '{{ELEMENT_TYPE}}',
    metadata: {
        name: '{{ELEMENT_NAME}}',
        description: '{{ELEMENT_DESCRIPTION}}',
        category: 'Custom',
    },
    schema: {
        tabs: [
            tab.properties([
                group('atlas', 'Atlas', [
                    prop.sparrowAsset('atlas', 'Override Atlas'),
                    prop.number('width', 'Width', 200),
                    prop.number('height', 'Height', 200),
                ]),
            ]),
        ],
    },
    createResources(context) {
        return {
            atlas: context.assets.bundledSparrow('atlas.svg', 'atlas.xml'),
            override: context.assets.project(),
            media: new VisualMedia(0, 0, 200, 200),
        };
    },
    render({ props, resources, time }) {
        const asset = props.atlas ? resources.override.update(props.atlas) : resources.atlas.get();
        resources.media
            .setResource(asset.resource as never, asset.status)
            .setLocalTime(time.seconds)
            .setDimensions(props.width, props.height);
        return [resources.media];
    },
});
