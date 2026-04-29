# Visual Asset Registry

The visual asset registry is the canonical way to add images and GIFs to your scenes. You upload an asset once via the **Asset Manager** panel, and every element that references it shares the same decoded data — no duplicate loading, and the asset survives save/load intact.

---

## Concepts

| Term | Type | Description |
|------|------|-------------|
| **Project asset** | `ProjectAsset` | Registry entry: name, type, source files, stable UUID. Lives in `VisualAssetRegistryStore`. |
| **Source descriptor** | `VisualSourceDescriptor` | Typed description of where to load data from (`image`, `atlas`, or `sparrow`). Passed to a handle. |
| **Decoded resource** | `DecodedResource` | Decoded, frame-ready representation. Frames are pre-baked `ImageBitmap`s. Lives in `VisualResourceCache`. |
| **Resource handle** | `VisualResourceHandle` | Manages one resource reference (retain/release). Single class for all source types. |
| **Render object** | `VisualMedia` | Draws a `DecodedResource` to canvas. Asset-agnostic — receives resources via `setResource()`. |

---

## The Asset Manager panel

The **Asset Manager** panel (left of the preview in MidiVisualizer) is the registry UI:

- **Upload** — drag a file onto the panel or click the upload button. Accepted types: JPEG, PNG, WebP, GIF.
- **+ Sparrow** — two-step picker for PNG + XML atlas pairs.
- **Rename** — double-click an asset name to edit it.
- **Delete** — click the delete icon on an asset card. Only user assets are deletable.

Each asset is assigned a stable UUID at upload time. That ID is what gets stored in scene documents and referenced by element properties.

---

## Using images in a scene element

### 1. Declare the property

```typescript
import { prop, insertElementGroups } from '@mvmnt/plugin-sdk';

static override getConfigSchema() {
    return insertElementGroups(super.getConfigSchema(), { name: 'My Element' }, [
        {
            id: 'imageSource',
            label: 'Image',
            variant: 'basic',
            collapsed: false,
            properties: [
                prop.imageAsset('imageSource', 'Image'),
            ],
        },
    ]);
}
```

### 2. Load and draw the asset

```typescript
import { SceneElement, prop, insertElementGroups, VisualMediaPlayback, VisualResourceHandle, resolveProjectAssetDescriptor } from '@mvmnt/plugin-sdk';
import { VisualMedia, type RenderObject } from '@mvmnt/plugin-sdk/render';

export class MyImageElement extends SceneElement {
    private readonly _media = new VisualMedia(0, 0, 200, 200, { includeInLayoutBounds: false });
    private readonly _playback = new VisualMediaPlayback();
    private readonly _handle = new VisualResourceHandle();

    protected override onDestroy(): void {
        this._handle.destroy();
        super.onDestroy();
    }

    protected override _buildRenderObjects(_cfg: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const descriptor = resolveProjectAssetDescriptor(props.imageSource as string | null);
        const { resource, status } = this._handle.update(descriptor);

        this._media
            .setResource(resource, status)
            .setLocalTime(this._playback.computeLocalTime(targetTime, resource?.animations))
            .setDimensions(200, 200)
            .setFitMode('contain');

        return [this._media];
    }
}
```

**Keep `VisualResourceHandle` as a long-lived field** — `update()` manages retain/release internally and only reloads when the descriptor key changes.

**Always call `this._handle.destroy()` in `onDestroy()`** — releases the reference count so memory can be reclaimed.

### Animated assets and named animations

For Sparrow atlases, `resource.animations` is a map of named animations (e.g. `'idle'`, `'run'`). To play a specific animation:

```typescript
this._media
    .setResource(resource, status)
    .setAnimation('idle')   // play only the 'idle' animation frames
    .setLocalTime(this._playback.computeLocalTime(targetTime, resource?.animations));
```

`VisualMediaPlayback.animationName` can also be set to confine `computeLocalTime()` to the animation's duration:

```typescript
this._playback.animationName = 'idle';
this._media
    .setResource(resource, status)
    .setAnimation(this._playback.animationName)
    .setLocalTime(this._playback.computeLocalTime(targetTime, resource?.animations));
```

---

## Sprite atlas elements

For uniform-grid spritesheets, construct an `AtlasSourceDescriptor` directly:

```typescript
import { type AtlasSourceDescriptor, VisualResourceHandle } from '@mvmnt/plugin-sdk';

private readonly _handle = new VisualResourceHandle();

protected override onDestroy(): void { this._handle.destroy(); }

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

### User-uploaded Sparrow atlas

```typescript
import { prop, VisualResourceHandle, resolveProjectAssetDescriptor } from '@mvmnt/plugin-sdk';

static override getConfigSchema() {
    return insertElementGroups(super.getConfigSchema(), { name: 'My Element' }, [{
        id: 'atlasSource',
        label: 'Atlas',
        variant: 'basic',
        collapsed: false,
        properties: [prop.sparrowAsset('atlas', 'Sparrow Atlas')],
    }]);
}

private readonly _handle = new VisualResourceHandle();

protected override onDestroy(): void { this._handle.destroy(); }

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    const descriptor = resolveProjectAssetDescriptor(props.atlas as string | null);
    const { resource, status } = this._handle.update(descriptor);
    this._media.setResource(resource, status).setLocalTime(t).setDimensions(200, 200);
    return [this._media];
}
```

### Bundled Sparrow atlas

Plugins can ship a Sparrow atlas inside their `assets/` directory:

```typescript
private readonly _sparrow = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');

protected override onDestroy(): void {
    this._sparrow.destroy();
}

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    const { resource, status } = this._sparrow.get();
    this._media.setResource(resource, status).setLocalTime(t).setDimensions(200, 200);
    return [this._media];
}
```

### Overrideable bundled Sparrow atlas

```typescript
private readonly _bundledAtlas = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
private readonly _overrideHandle = new VisualResourceHandle();

protected override onDestroy(): void {
    this._bundledAtlas.destroy();
    this._overrideHandle.destroy();
}

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    const overrideId = props.atlas as string | null;
    const { resource, status } = overrideId
        ? this._overrideHandle.update(resolveProjectAssetDescriptor(overrideId))
        : this._bundledAtlas.get();

    this._media.setResource(resource, status).setLocalTime(t).setDimensions(200, 200);
    return [this._media];
}
```

---

## Bundled plugin assets

Assets that ship inside a plugin use `bundledSprite()` or `bundledImage()`:

```typescript
private readonly _icon = this.bundledSprite('icon.png');

protected override onDestroy(): void { this._icon.destroy(); }

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    return [this._icon.build(0, 0, 64, 64)];
}
```

`build()` creates a new `VisualMedia` each call — use only for simple cases where the render object isn't reused frame to frame. For long-lived instances, use `.get()` and `setResource()` manually:

```typescript
const { resource, status } = this._icon.get();
this._media.setResource(resource, status);
```

### Subdirectories in bundled assets

Subdirectories inside `assets/` are fully supported:

```typescript
private readonly _head = this.bundledSprite('characters/head.png');
private readonly _body = this.bundledSprite('characters/body.png');
```

---

## Fit modes

`VisualMedia.setFitMode()` accepts:

| Value | Behaviour |
|-------|-----------|
| `'contain'` | Scale to fit within the bounds, preserving aspect ratio. Letterbox visible. |
| `'cover'` | Scale to fill the bounds, preserving aspect ratio. Image may be cropped. |
| `'fill'` | Stretch to exactly fill the bounds. Distorts non-square images. |
| `'none'` | Draw at the image's original pixel size (no scaling). |

---

## What to use when

| Situation | Property | API |
|-----------|----------|-----|
| User-selected image from registry | `prop.imageAsset()` | `VisualResourceHandle` + `resolveProjectAssetDescriptor` |
| User-selected spritesheet (grid) | `prop.imageAsset()` | `VisualResourceHandle` with `AtlasSourceDescriptor` |
| User-selected Sparrow atlas | `prop.sparrowAsset()` | `VisualResourceHandle` + `resolveProjectAssetDescriptor` |
| Plugin-bundled default image | — (no property) | `this.bundledSprite()` / `this.bundledImage()` |
| Plugin-bundled default Sparrow atlas | — (no property) | `this.bundledSparrow()` |
| Non-image file (audio, etc.) | `prop.file()` | n/a |

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
// New — element owns the handle, VisualMedia is purely a renderer
private readonly _media = new VisualMedia(0, 0, 200, 200);
private readonly _handle = new VisualResourceHandle();

protected override onDestroy(): void {
    this._handle.destroy();  // element manages lifecycle
}

// In _buildRenderObjects:
const descriptor = resolveProjectAssetDescriptor(props.imageSource as string | null);
const { resource, status } = this._handle.update(descriptor);
this._media.setResource(resource, status).setLocalTime(t);
```

### From `AssetRefSparrowSlot`

```typescript
// Old
private readonly _sparrow = new AssetRefSparrowSlot();
const { asset, status } = this._sparrow.update(props.atlas as string | null);
this._media.setAsset(asset, status);
```

```typescript
// New
private readonly _handle = new VisualResourceHandle();
const descriptor = resolveProjectAssetDescriptor(props.atlas as string | null);
const { resource, status } = this._handle.update(descriptor);
this._media.setResource(resource, status);
```

### `clips` → `animations`

`VisualAsset.clips` (flat `startMs/endMs`) is replaced by `DecodedResource.animations`, where each animation owns its frame list and FPS:

```typescript
// Old
this._media.setLocalTime(this._playback.computeLocalTime(targetTime, asset?.clips));

// New
this._media
    .setAnimation(this._playback.animationName)
    .setLocalTime(this._playback.computeLocalTime(targetTime, resource?.animations));
```

`VisualMediaPlayback.clipName` is now `animationName`.
