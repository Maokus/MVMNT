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

> Sparrow atlases are not user-importable. They can only enter the registry through plugin-bundled assets (via `bundledSparrow()`), which register automatically when the element first loads.

---

## Factory methods on SceneElement

`SceneElement` provides these auto-tracked factory methods — all returned handles are automatically destroyed when the element is disposed, so **no `onDestroy()` override is needed** just for cleanup:

| Method                                       | Returns                | Use for                                       |
| -------------------------------------------- | ---------------------- | --------------------------------------------- |
| `this.visualHandle()`                        | `VisualResourceHandle` | User-selected image / atlas from the registry |
| `this.bundledSprite(filename)`               | `BundledSprite`        | Image or GIF that ships with the plugin       |
| `this.bundledImage(filename)`                | `BundledSprite`        | Alias for `bundledSprite()`                   |
| `this.bundledSparrow(png, xml, defaultFps?)` | `BundledSparrowHandle` | Sparrow atlas that ships with the plugin      |

Always use these factory methods instead of `new VisualResourceHandle()`, `new BundledSprite()`, etc. Manual handles require a matching `handle.destroy()` in `onDestroy()` — factory handles do not.

---

## Using images in a scene element

### 1. Declare the property

```typescript
import { prop, insertElementGroups, tab } from '@mvmnt/plugin-sdk';

static override getConfigSchema() {
    return insertElementGroups(super.getConfigSchema(), { name: 'My Element' }, [
        tab.content([{
            id: 'imageSource',
            label: 'Image',
            collapsed: false,
            properties: [
                prop.imageAsset('imageSource', 'Image'),
            ],
        }]),
    ]);
}
```

### 2. Load and draw the asset

```typescript
import {
    SceneElement,
    prop,
    insertElementGroups,
    VisualMediaPlayback,
    resolveProjectAssetDescriptor,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, type RenderObject } from '@mvmnt/plugin-sdk/render';

export class MyImageElement extends SceneElement {
    private readonly _media = new VisualMedia(0, 0, 200, 200, { includeInLayoutBounds: false });
    private readonly _playback = new VisualMediaPlayback();
    // visualHandle() creates a VisualResourceHandle and auto-destroys it on dispose().
    private readonly _handle = this.visualHandle();

    protected override _buildRenderObjects(_cfg: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const descriptor = resolveProjectAssetDescriptor(props.imageSource as string | null);
        const { resource, status } = this._handle.update(descriptor);

        this._media
            .setResource(resource, status)
            .setLocalTime(this._playback.computeLocalTime(targetTime))
            .setDimensions(200, 200)
            .setFitMode('contain');

        return [this._media];
    }
}
```

Use `this.visualHandle()` instead of `new VisualResourceHandle()` — the handle is then automatically destroyed when the element is disposed, so no `onDestroy()` override is needed just for the handle.

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
import { type AtlasSourceDescriptor } from '@mvmnt/plugin-sdk';

private readonly _handle = this.visualHandle();

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    const src = props.imageSource as string | File | null;
    const descriptor: AtlasSourceDescriptor | null = src
        ? { kind: 'atlas', src: src as string, layout: { columns: 4, rows: 4, frameDurationMs: 1000 / 12 } }
        : null;
    const { resource, status } = this._handle.update(descriptor);
    this._media.setResource(resource, status).setLocalTime(t).setDimensions(200, 200);
    return [this._media];
}
```

---

## Sparrow atlas elements

Sparrow is a format that stores frame regions in an XML file alongside the spritesheet PNG.
Sparrow atlases can only enter the registry through plugin-bundled assets — see [Bundled plugin assets](#bundled-plugin-assets).

### Overrideable bundled Sparrow atlas

```typescript
private readonly _bundledAtlas = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
private readonly _overrideHandle = this.visualHandle();

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    const overrideId = props.atlas as string | null;
    const { resource, status } = overrideId
        ? this._overrideHandle.update(resolveProjectAssetDescriptor(overrideId))
        : this._bundledAtlas.get();

    this._media.setResource(resource, status).setLocalTime(t).setDimensions(200, 200);
    return [this._media];
}
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

Assets that ship inside a plugin use `bundledSprite()`, `bundledImage()`, or `bundledSparrow()`. All three are factory methods on `SceneElement`; the returned handles are auto-tracked and destroyed when the element is disposed.

### Bundled image

```typescript
private readonly _icon = this.bundledSprite('icon.png');

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    return [this._icon.build(0, 0, 64, 64)];
}
```

`build()` creates a new `VisualMedia` each call, which can cause performance issues. For long-lived instances, use `.get()` and `setResource()` manually:

```typescript
const { resource, status } = this._icon.get();
this._media.setResource(resource, status);
```

### Bundled Sparrow atlas

```typescript
private readonly _sparrow = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    return [this._sparrow.build(0, 0, 200, 200, { animation: 'idle' })];
}
```

`bundledSparrow()` accepts an optional third argument `defaultFps` (default 24).

`BundledSparrowHandle.build()` has the same signature as `BundledSprite.build()` — both accept a `BundledBuildOptions` object with `fitMode`, `originX/Y`, and `animation`.

### Load errors

If a bundled asset fails to load (file not found, bad URL, etc.), `.get()` and `.build()` return `status:'error'` with an `errorMessage` — a visible "Error" placeholder is drawn instead of silently showing nothing. Check `errorMessage` for the cause.

### Subdirectories in bundled assets

Subdirectories inside `assets/` are fully supported:

```typescript
private readonly _head = this.bundledSprite('characters/head.png');
private readonly _body = this.bundledSprite('characters/body.png');
```

---

## Fit modes

`VisualMedia.setFitMode()` accepts:

| Value       | Behaviour                                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'contain'` | Scale to fit within the bounds, preserving aspect ratio. Empty bars (letterbox/pillarbox) appear when aspect ratios differ. Bounds reflect the scaled image rect, not the full container.                                                                  |
| `'cover'`   | Scale to fill the bounds, preserving aspect ratio. Image overflows and is clipped. Bounds equal the full container.                                                                                                                                        |
| `'fill'`    | Stretch to exactly fill the bounds. Distorts non-square images.                                                                                                                                                                                            |
| `'none'`    | Draw at the image's native pixel size (1:1 scale, no scaling). Centered inside the container. If the image overflows it is clipped to the container edges; if smaller, empty space is visible around it. Bounds reflect the actual drawn (clipped) region. |

---

## What to use when

| Situation                            | Property            | API                                                     |
| ------------------------------------ | ------------------- | ------------------------------------------------------- |
| User-selected image from registry    | `prop.imageAsset()` | `this.visualHandle()` + `resolveProjectAssetDescriptor` |
| User-selected spritesheet (grid)     | `prop.imageAsset()` | `this.visualHandle()` with `AtlasSourceDescriptor`      |
| Plugin-bundled default image         | — (no property)     | `this.bundledSprite()` / `this.bundledImage()`          |
| Plugin-bundled default Sparrow atlas | — (no property)     | `this.bundledSparrow()`                                 |
| Non-image file (audio, etc.)         | `prop.file()`       | n/a                                                     |

---

## Migration from the old API

### From `setAssetId()` / `AssetRefSlot`

```typescript
// Old — VisualMedia managed lifecycle internally via setAssetId()
private readonly _media = new VisualMedia(0, 0, 200, 200);

protected override onDestroy(): void {
    this._media.destroy();  // OLD: released internal AssetRefSlot
}

// In _buildRenderObjects:
this._media.setAssetId(props.imageSource as string | null).setLocalTime(t);
```

```typescript
// New — element owns the handle via factory method (auto-destroyed on dispose)
private readonly _media = new VisualMedia(0, 0, 200, 200);
private readonly _handle = this.visualHandle();

// In _buildRenderObjects:
const descriptor = resolveProjectAssetDescriptor(props.imageSource as string | null);
const { resource, status } = this._handle.update(descriptor);
this._media.setResource(resource, status).setLocalTime(t);
```

### From `new VisualResourceHandle()` (manual)

Replace `new VisualResourceHandle()` with `this.visualHandle()` and remove the `handle.destroy()` call from `onDestroy()`. The handle is now auto-tracked.

### From `AssetRefSparrowSlot`

```typescript
// Old
private readonly _sparrow = new AssetRefSparrowSlot();
const { asset, status } = this._sparrow.update(props.atlas as string | null);
this._media.setAsset(asset, status);
```

```typescript
// New
private readonly _handle = this.visualHandle();
const descriptor = resolveProjectAssetDescriptor(props.atlas as string | null);
const { resource, status } = this._handle.update(descriptor);
this._media.setResource(resource, status);
```

### `clips` → `animations`

`VisualAsset.clips` (flat `startMs/endMs`) is replaced by `VisualResource.animations`, where each animation owns its frame list and FPS:

```typescript
// Old
this._media.setLocalTime(this._playback.computeLocalTime(targetTime, asset?.clips));

// New
this._media.setAnimation(this._playback.animationName).setLocalTime(this._playback.computeLocalTime(targetTime));
```

`VisualMediaPlayback.clipName` is now `animationName`.
