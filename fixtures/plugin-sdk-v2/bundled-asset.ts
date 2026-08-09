import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';
import type { BundledVisualAssetHandle } from '@mvmnt-app/plugin-sdk/visual-assets';

export const bundledAsset = definePluginElement<Readonly<Record<string, never>>, BundledVisualAssetHandle>({
    type: 'sdk-v2-bundled-asset',
    metadata: { name: 'Bundled Asset Fixture' },
    schema: { tabs: [] },
    create(_props, context) {
        return context.assets.bundledImage('fixture.png');
    },
    render(_props, handle) {
        const asset = handle.get();
        return [new VisualMedia(0, 0, 64, 64).setResource(asset.resource, asset.status)];
    },
});
