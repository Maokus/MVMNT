/**
 * Visual resource utilities: cache access, descriptor types, handle, and playback.
 *
 * Plugin authors use these to load and display images, animated GIFs, and
 * sprite atlases via VisualMedia render objects.
 *
 * @module @mvmnt/plugin-sdk (visual-assets subset)
 */

export {
    visualResourceCache,
    type VisualResourceCache,
} from '@core/resources/visual-resource-cache';

export {
    type VisualSourceDescriptor,
    type ImageSourceDescriptor,
    type AtlasSourceDescriptor,
    type SparrowSourceDescriptor,
    type AtlasLayout,
    type ImageSource,
    makeDescriptorKey,
} from '@core/resources/visual-source-descriptor';

export {
    type VisualResource,
    type ResourceStatus,
    type VisualFrame,
    type VisualAnimation,
    type FrameAtTime,
    getFrameAtTime,
} from '@core/resources/visual-resource';

export { VisualMediaPlayback } from '@core/resources/visual-media-playback';

export {
    VisualResourceHandle,
    type ResourceHandleResult,
} from '@core/resources/visual-resource-handle';

export { BundledSprite, BundledSparrowHandle } from '@core/resources/bundled-sprite';

export { resolveProjectAssetDescriptor } from '@state/visualAssetRegistryStore';
