import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';
// Add assets/atlas.png and assets/atlas.xml before using this bundled-atlas template.
export const atlasImage = definePluginElement({
    type: 'atlas-image',
    metadata: {
        name: 'Atlas Image',
        description: 'Sparrow atlas animation with a bundled default',
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
            atlas: context.assets.bundledSparrow('atlas.png', 'atlas.xml'),
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
