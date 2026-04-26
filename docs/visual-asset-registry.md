# Visual Asset Registry

The visual asset registry is the canonical way to add images and GIFs to your scenes. You upload an asset once via the **Asset Manager** panel, and every element that references it shares the same decoded data — no duplicate loading, and the asset survives save/load intact.

---

## The Asset Manager panel

The **Asset Manager** panel (left of the preview in MidiVisualizer) is the registry UI:

- **Upload** — drag a file onto the panel or click the upload button. Accepted types: JPEG, PNG, WebP, GIF.
- **Rename** — double-click an asset name to edit it.
- **Delete** — click the delete icon on an asset card. Only deletes the registry entry; it does not affect elements already referencing the asset until they are re-rendered.

Each asset is assigned a stable UUID at upload time. That ID is what gets stored in scene documents and referenced by element properties.

---

## Using images in a scene element

### 1. Declare the property

Use `prop.imageAsset()` in your `getConfigSchema()`:

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

This renders a dropdown in the properties panel showing all assets currently in the registry.

### 2. Load and draw the asset

Call `setAssetId()` and `setPlayback()` on a long-lived `VisualMedia` instance each frame. Call `destroy()` in `onDestroy()` to release the asset reference:

```typescript
import { SceneElement, prop, insertElementGroups } from '@mvmnt/plugin-sdk';
import { VisualMedia, type RenderObject } from '@mvmnt/plugin-sdk/render';

export class MyImageElement extends SceneElement {
    private readonly _media = new VisualMedia(0, 0, 200, 200, { includeInLayoutBounds: false });

    protected override onDestroy(): void {
        this._media.destroy();
        super.onDestroy();
    }

    protected override _buildRenderObjects(_cfg: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        this._media
            .setAssetId(props.imageSource as string | null)
            .setPlayback(1, targetTime)
            .setDimensions(200, 200)
            .setFitMode('contain');

        return [this._media];
    }
}
```

**Keep `VisualMedia` as a long-lived field** — `setAssetId()` manages retain/release internally and only re-loads the asset when the ID changes. Creating a new `VisualMedia` every frame would bypass that caching.

**Always call `this._media.destroy()` in `onDestroy()`** — it releases the asset's reference count so memory can be reclaimed when the element is removed from the scene.

### Animated assets and playback speed

`setPlayback(speed, sceneTimeSec)` computes the correct frame for the current scene time, including looping. For user-controllable playback speed:

```typescript
this._media
    .setAssetId(props.imageSource as string | null)
    .setPlayback(props.playbackSpeed as number ?? 1, targetTime)
    .setDimensions(props.width, props.height)
    .setFitMode('contain');
```

---

## Sprite atlas elements

For spritesheet animation, use `AssetRefAtlasSlot` explicitly — the atlas path requires a layout configuration that `VisualMedia` doesn't manage internally:

```typescript
import { AssetRefAtlasSlot, type AtlasLayout } from '@mvmnt/plugin-sdk';

private readonly _atlas = new AssetRefAtlasSlot();
private readonly _media = new VisualMedia(0, 0, 200, 200);

protected override onDestroy(): void {
    this._atlas.destroy();
    super.onDestroy();
}

protected override _buildRenderObjects(_cfg: unknown, targetTime: number): RenderObject[] {
    const layout: AtlasLayout = {
        columns: 4,
        rows: 4,
        frameDurationMs: 1000 / 12,  // 12 fps
    };

    const { asset, status } = this._atlas.update(props.imageSource as string | null, layout);
    this._media
        .setAsset(asset, status)
        .setLocalTime(targetTime)
        .setDimensions(200, 200);

    return [this._media];
}
```

The property declaration is identical — use `prop.imageAsset('imageSource', 'Sprite Sheet')`. The atlas-vs-plain distinction is purely in which slot class you use.

---

## Bundled plugin assets

Assets that ship *inside* a plugin (e.g. a default sprite that always loads) use a different mechanism — they bypass the user registry entirely:

```typescript
// In your element class:
private readonly _icon = this.bundledSprite('icon.png');

protected override onDestroy(): void {
    this._icon.destroy();
    super.onDestroy();
}

protected override _buildRenderObjects(_cfg: unknown, t: number): RenderObject[] {
    return [this._icon.build(0, 0, 64, 64)];
}
```

`bundledSprite()` loads the file from the plugin's `assets/` directory via the plugin loader. There is no user-visible property and no registry entry. See [creating-custom-elements.md](creating-custom-elements.md) for how to include bundled assets in your plugin.

### Subdirectories in bundled assets

Subdirectories inside `assets/` are fully supported. Pass the path relative to `assets/`:

```typescript
private readonly _head = this.bundledSprite('characters/head.png');
private readonly _body = this.bundledSprite('characters/body.png');
private readonly _bg   = this.bundledSprite('backgrounds/stage.png');
```

The asset will appear in the Asset Manager as just the filename (`head`, `body`, `stage`) — the directory path is stripped from the display name.

In a packaged `.mvmnt-plugin` ZIP, include the files at `assets/characters/head.png`, etc. The loader strips the `assets/` prefix and uses the remainder (`characters/head.png`) as the lookup key, matching the path you pass to `bundledSprite()`.

### Overrideable bundled assets

If you want a *default* bundled image that users can **optionally override** from the registry, use both:

```typescript
private readonly _bundled = this.bundledSprite('default.png');
private readonly _media   = new VisualMedia(0, 0, 200, 200);

protected override onDestroy(): void {
    this._bundled.destroy();
    super.onDestroy();
}

// In _buildRenderObjects:
const overrideId = props.imageSource as string | null;
if (overrideId) {
    this._media.setAssetId(overrideId).setPlayback(1, targetTime);
} else {
    const { asset, status } = this._bundled.get();
    this._media.setAsset(asset, status).setLocalTime(targetTime);
}
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
| User-selected image from registry | `prop.imageAsset()` | `VisualMedia.setAssetId()` |
| User-selected spritesheet from registry | `prop.imageAsset()` | `AssetRefAtlasSlot` + `setAsset()` |
| Plugin-bundled default image | — (no property) | `this.bundledSprite()` / `this.bundledImage()` |
| Non-image file (audio, etc.) | `prop.file()` | n/a |

---

## Migration from `AssetRefSlot` / `prop.file()` / `ImageAssetSlot`

### From `AssetRefSlot` + `VisualMediaPlayback` (previous pattern)

```typescript
// Old — requires separate slot and playback fields
import { AssetRefSlot, VisualMediaPlayback } from '@mvmnt/plugin-sdk';

private readonly _image = new AssetRefSlot();
private readonly _playback = new VisualMediaPlayback();
private readonly _media = new VisualMedia(0, 0, 200, 200);

protected override onDestroy(): void {
    this._image.destroy();  // separate destroy
    super.onDestroy();
}

// In _buildRenderObjects:
const { asset, status } = this._image.update(props.imageSource as string | null);
this._media
    .setAsset(asset, status)
    .setLocalTime(this._playback.computeLocalTime(targetTime, asset?.clips))
    .setDimensions(200, 200);
```

```typescript
// New — lifecycle managed by VisualMedia
private readonly _media = new VisualMedia(0, 0, 200, 200);

protected override onDestroy(): void {
    this._media.destroy();
    super.onDestroy();
}

// In _buildRenderObjects:
this._media
    .setAssetId(props.imageSource as string | null)
    .setPlayback(1, targetTime)
    .setDimensions(200, 200);
```

`AssetRefSlot`, `VisualMediaPlayback`, and `ImageAssetSlot` remain exported from `@mvmnt/plugin-sdk` for cases that need them (e.g. atlas elements, mixing bundled and user assets), but they are no longer needed for the common image element pattern.

### From `prop.file()` / `ImageAssetSlot` (legacy)

The old pattern used a file upload dialog and raw `File` objects:

```typescript
// Old — do not use for images
prop.file('imageSource', 'Image File', { accept: 'image/*' })
private readonly _image = new ImageAssetSlot();
const { asset, status } = this._image.update(props.imageSource as File | null);
```

Migrate to:

```typescript
// New
prop.imageAsset('imageSource', 'Image')
// ...in _buildRenderObjects:
this._media.setAssetId(props.imageSource as string | null)
```

Key differences:
- `prop.file()` stored a transient `File` object; `prop.imageAsset()` stores a stable UUID string.
- `setAssetId()` accepts `string | File | null` — it handles both new UUID strings and any legacy `File` values during import.
- Assets uploaded via the registry survive save/load and can be shared between elements. File-upload assets were session-only and could not be serialised.
