# Plugin rendering and assets

Render callbacks return a paint-ordered array of SDK render objects. Use project assets for files
selected in a scene, bundled assets for files distributed with a plugin, and generated rasters for
deterministic pixels computed by the plugin.

## Render objects

Import render primitives from `@mvmnt-app/plugin-sdk/render`. The public module currently exposes
base objects, rectangles, text, lines, arcs, polygons, Bezier paths, clipping, compositing, glow,
visual media, and pixel grids. The [SDK manifest](../../packages/plugin-sdk/sdk-manifest.json) is the
canonical export inventory.

Render objects form a local hierarchy with position, rotation, scale, skew, opacity, origin,
visibility, blend mode, filter, and children. Use chainable setters and return the root objects in
paint order. For stable anchors and selection handles, return one invisible `Rectangle` with
`layoutParticipation: 'include'` as the element's fixed bounds and set every visible or decorative
object to `exclude`. See the [quickstart layout pattern](quickstart.md#keep-layout-bounds-stable).
Visual bounds still include drawn descendants.

Do not retain canvas contexts or host snapshots. Reusing a render object in
[instance resources](instance-state.md) is appropriate when its own setters fully describe the current
frame. For expensive deterministic pixel generation, prefer `context.assets.generatedRaster()`
with a content key derived from every input that affects the pixels.

## Project assets

An `assetRef` property stores a stable project asset ID. Create a scoped project handle in
`createResources()`, update it from the property during render, and pass its immutable snapshot to
`VisualMedia`:

```ts
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';

createResources(context) {
    return {
        asset: context.assets.project(),
        media: new VisualMedia(-100, -100, 200, 200),
    };
},
render({ props, resources, time }) {
    const snapshot = resources.asset.update(props.image);
    resources.media
        .setResource(snapshot.resource, snapshot.status)
        .setLocalTime(time.seconds)
        .setFitMode('contain');
    return [resources.media];
},
```

Handles are disposed automatically with their context.

## Bundled assets

Place packaged files under the plugin project's `assets/` directory. Resolve them with:

- `context.assets.bundledImage(filename)` for images and GIFs.
- `context.assets.bundledGridAtlas(image, grid)` for uniform atlases.
- `context.assets.bundledSparrow(image, xml)` for Sparrow atlases.

Subdirectories are supported. Missing or invalid bundled files return an error snapshot that
`VisualMedia` displays as a placeholder.

Use `setAnimation(name)` for named Sparrow animations. `VisualMedia` supports `contain`, `cover`,
`fill`, and `clip` fit modes; clip mode draws at native pixel size and supports explicit frame
placement.

## Generated rasters

`context.assets.generatedRaster()` memoizes deterministic RGBA pixels under a plugin-namespaced
content key and host memory budget. Builders run synchronously only on a cache miss. Cache entries,
eviction, scratch surfaces, and revision storage remain host-owned.
