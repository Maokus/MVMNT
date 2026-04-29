/**
 * Visual asset utilities: store access, key construction, types, and playback.
 *
 * Plugin authors use these to load and display images, animated GIFs, and
 * sprite atlases via VisualMedia render objects.
 *
 * @module @mvmnt/plugin-sdk (visual-assets subset)
 */

export {
    visualAssetStore,
    makeImageKey,
    makeAtlasKey,
    makeSparrowKey,
    type ImageSource,
} from '@core/resources/visual-asset-store';

export {
    type VisualAsset,
    type VisualAssetStatus,
    type VisualFrame,
    type AtlasLayout,
    type VisualClip,
    type FrameAtTime,
    getFrameAtTime,
} from '@core/resources/visual-asset';

export { VisualMediaPlayback } from '@core/resources/visual-media-playback';

export {
    ImageAssetSlot,
    AtlasAssetSlot,
    BundledImageAssetSlot,
    BundledSparrowAssetSlot,
    AssetRefSlot,
    AssetRefAtlasSlot,
    SparrowAssetSlot,
    AssetRefSparrowSlot,
    type AssetSlotResult,
} from '@core/resources/visual-asset-slot';

export { BundledSprite } from '@core/resources/bundled-sprite';
