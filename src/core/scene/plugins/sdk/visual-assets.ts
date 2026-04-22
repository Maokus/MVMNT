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
    type ImageSource,
} from '@core/resources/visual-asset-store';

export {
    type VisualAsset,
    type VisualAssetStatus,
    type VisualFrame,
    type AtlasLayout,
    type VisualClip,
    getFrameAtTime,
} from '@core/resources/visual-asset';

export { VisualMediaPlayback } from '@core/resources/visual-media-playback';
