# Visual Asset Registry

The visual asset registry is the canonical way to add images and GIFs to your scenes. You upload an asset once via the **Asset Manager** panel, and every element that references it shares the same decoded data — no duplicate loading, and the asset survives save/load intact.

---

## Concepts

| Term                  | Type                     | Description                                                                                               |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Project asset**     | `ProjectAsset`           | Registry entry: name, type, source files, stable UUID. Lives in `VisualAssetRegistryStore`.               |
| **Source descriptor** | `VisualSourceDescriptor` | Typed description of where to load data from (`image`, `atlas`, or `sparrow`). Passed to a handle.        |
| **Decoded resource**  | `VisualResource`         | Decoded, frame-ready representation. Frames are pre-baked `ImageBitmap`s. Lives in `VisualResourceCache`. |
| **Resource handle**   | `VisualResourceHandle`   | Manages one resource reference (retain/release). Single class for all source types.                       |
| **Render object**     | `VisualMedia`            | Draws a `VisualResource` to canvas. Asset-agnostic — receives resources via `setResource()`.              |

---

## The Asset Manager panel

The **Asset Manager** panel (left of the preview in MidiVisualizer) is the registry UI:

- **Upload** — drag a file onto the panel or click the upload button. Accepted types: JPEG, PNG, WebP, GIF.
- **Rename** — double-click an asset name to edit it.
- **Delete** — click the delete icon on an asset card. Only user assets are deletable.

Each asset is assigned a stable UUID at upload time. That ID is what gets stored in scene documents and referenced by element properties.

> Sparrow atlases are not user-importable. Plugins load them through
> `context.assets.bundledSparrow()`, which registers them when the element loads.

---

## SDK 2 asset handles

`CapabilityContext.assets` provides lifecycle-scoped handles. Every returned handle is disposed
automatically with the element:

| Method                                         | Returns       | Use for                               |
| ---------------------------------------------- | ------------- | ------------------------------------- |
| `context.assets.project()`                     | `AssetHandle` | User-selected project asset           |
| `context.assets.bundledImage(filename)`        | `AssetHandle` | Image or GIF shipped with the plugin  |
| `context.assets.bundledSparrow(png, xml)`      | `AssetHandle` | Sparrow atlas shipped with the plugin |
| `context.assets.bundledGridAtlas(image, grid)` | `AssetHandle` | Grid atlas shipped with the plugin    |

Do not construct host resource handles directly.

---

## Using images in a scene element

### 1. Declare the property

```typescript
const schema = {
    tabs: [
        {
            id: 'content',
            label: 'Content',
            groups: [
                {
                    id: 'imageSource',
                    label: 'Image',
                    collapsed: false,
                    properties: [{ key: 'imageSource', label: 'Image', type: 'assetRef', default: null }],
                },
            ],
        },
    ],
} as const;
```

### 2. Load and draw the asset

```typescript
import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';

export const myImage = definePluginElement({
    type: 'my-image',
    metadata: { name: 'My Image' },
    schema: { tabs: [] },
    capabilities: { required: [], optional: [] },
    create(_props, context) {
        return { handle: context.assets.project(), media: new VisualMedia(0, 0, 200, 200) };
    },
    render(props, state, time) {
        if (!props.visible) return [];
        const asset = state.handle.update(props.imageSource);
        state.media.setResource(asset.resource, asset.status).setLocalTime(time.seconds).setFitMode('contain');
        return [state.media];
    },
});
```

Handles created through `context.assets` are scoped to the element lifecycle and disposed automatically.

If you do need `onDestroy()` for other cleanup, you can still call `this._handle.destroy()` explicitly — double-destroy is safe.

### Animated assets and named animations

For Sparrow atlases, `resource.animations` is a map of named animations (e.g. `'idle'`, `'run'`). To play a specific animation:

```typescript
this._media
    .setResource(resource, status)
    .setAnimation('idle') // play only the 'idle' animation frames
    .setLocalTime(this._playback.computeLocalTime(targetTime));
```

`VisualMediaPlayback.animationName` can also be set to select the active animation
(its `loopMode` is then used by `getFrameAtTime` to handle `'loop'`, `'once'`, or `'pingpong'`):

```typescript
this._playback.animationName = 'idle';
this._media
    .setResource(resource, status)
    .setAnimation(this._playback.animationName)
    .setLocalTime(this._playback.computeLocalTime(targetTime));
```

---

## Sprite atlas elements

For uniform-grid spritesheets, construct an `AtlasSourceDescriptor` directly:

```typescript
create(_props, context) {
    return { handle: context.assets.project(), media: new VisualMedia(0, 0, 200, 200) };
},
render(props, state, time) {
    const asset = state.handle.update(props.imageSource);
    state.media.setResource(asset.resource, asset.status).setLocalTime(time.seconds).setDimensions(200, 200);
    return [state.media];
},
```

---

## Sparrow atlas elements

Sparrow is a format that stores frame regions in an XML file alongside the spritesheet PNG.
Sparrow atlases can only enter the registry through plugin-bundled assets — see [Bundled plugin assets](#bundled-plugin-assets).

### Overrideable bundled Sparrow atlas

```typescript
create(_props, context) {
    return {
        bundled: context.assets.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml'),
        override: context.assets.project(),
        media: new VisualMedia(0, 0, 200, 200),
    };
},
render(props, state, time) {
    const asset = props.atlas ? state.override.update(props.atlas) : state.bundled.get();
    state.media.setResource(asset.resource, asset.status).setLocalTime(time.seconds).setDimensions(200, 200);
    return [state.media];
},
```

### Per-animation loop mode overrides

By default every Sparrow animation loops. Override `loopMode` (and optionally `fps`) per animation via the descriptor:

```typescript
const descriptor = {
    kind: 'sparrow' as const,
    imageSrc: pngUrl,
    xmlSrc: xmlUrl,
    animations: {
        idle: { loopMode: 'loop' as const },
        death: { loopMode: 'once' as const },
        intro: { loopMode: 'pingpong' as const, fps: 12 },
    },
};
```

Overrides are applied after the XML is parsed and animations are grouped from their name prefixes. The override key must match the animation name exactly (the prefix extracted from frame names).

---

## Bundled plugin assets

Assets that ship inside a plugin use the bundled handle methods on `context.assets`.

### Bundled image

```typescript
create(_props, context) {
    return { icon: context.assets.bundledImage('icon.png'), media: new VisualMedia(0, 0, 64, 64) };
},
render(_props, state, time) {
    const asset = state.icon.get();
    state.media.setResource(asset.resource, asset.status).setLocalTime(time.seconds);
    return [state.media];
},
```

Keep `VisualMedia` in element state so render callbacks reuse it rather than allocating it per frame.

### Bundled Sparrow atlas

```typescript
const sparrow = context.assets.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
const asset = sparrow.get();
media.setResource(asset.resource, asset.status).setAnimation('idle');
```

Animation selection and frame timing are configured on `VisualMedia`.

### Load errors

If a bundled asset fails to load (file not found, bad URL, etc.), `.get()` and `.build()` return `status:'error'` with an `errorMessage` — a visible "Error" placeholder is drawn instead of silently showing nothing. Check `errorMessage` for the cause.

### Subdirectories in bundled assets

Subdirectories inside `assets/` are fully supported:

```typescript
const head = context.assets.bundledImage('characters/head.png');
const body = context.assets.bundledImage('characters/body.png');
```

---

## Fit modes

`VisualMedia.setFitMode()` accepts:

| Value       | Behaviour                                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'contain'` | Scale to fit within the bounds, preserving aspect ratio. Empty bars (letterbox/pillarbox) appear when aspect ratios differ. Bounds reflect the scaled image rect, not the full container.                                                                                                   |
| `'cover'`   | Scale to fill the bounds, preserving aspect ratio. Image overflows and is clipped. Bounds equal the full container.                                                                                                                                                                         |
| `'fill'`    | Stretch to exactly fill the bounds. Distorts non-square images.                                                                                                                                                                                                                             |
| `'clip'`    | Draw at the image's native pixel size (1:1 scale, no scaling). Centered inside the container by default. Use `setFramePlacement()` to control where the frame is positioned. If the image overflows it is clipped to the container edges. Bounds reflect the actual drawn (clipped) region. |

---

## What to use when

| Situation                            | Property   | API                               |
| ------------------------------------ | ---------- | --------------------------------- |
| User-selected image from registry    | `assetRef` | `context.assets.project()`        |
| User-selected spritesheet            | `assetRef` | `context.assets.project()`        |
| Plugin-bundled default image         | —          | `context.assets.bundledImage()`   |
| Plugin-bundled default Sparrow atlas | —          | `context.assets.bundledSparrow()` |
| Non-image file                       | `file`     | n/a                               |
