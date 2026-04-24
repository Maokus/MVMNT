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

Create an `AssetRefSlot` instance field, call `update()` every frame, and pass the result to `VisualMedia.setAsset()`:

```typescript
import { SceneElement, prop, insertElementGroups, AssetRefSlot, VisualMediaPlayback } from '@mvmnt/plugin-sdk';
import { VisualMedia, type RenderObject } from '@mvmnt/plugin-sdk/render';

export class MyImageElement extends SceneElement {
    private readonly _image = new AssetRefSlot();
    private readonly _playback = new VisualMediaPlayback();

    protected override onDestroy(): void {
        this._image.destroy();
        super.onDestroy();
    }

    protected override _buildRenderObjects(_cfg: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const { asset, status } = this._image.update(props.imageSource as string | null);

        const media = new VisualMedia(0, 0, 200, 200, { includeInLayoutBounds: false });
        media
            .setAsset(asset, status)
            .setLocalTime(this._playback.computeLocalTime(targetTime, asset?.clips))
            .setDimensions(200, 200)
            .setFitMode('contain');

        return [media];
    }
}
```

`AssetRefSlot.update()` resolves the asset ID to the registered `File`, triggers loading on the first call, and returns `{ asset, status }` safe to pass directly to `VisualMedia.setAsset()`.

**Always call `this._image.destroy()` in `onDestroy()`** — it releases the asset's reference count so memory can be reclaimed when the element is removed from the scene.

---

## Sprite atlas elements

For spritesheet animation, use `AssetRefAtlasSlot` instead of `AssetRefSlot`. It takes the same asset ID but feeds it through the atlas loading path:

```typescript
import { AssetRefAtlasSlot, type AtlasLayout } from '@mvmnt/plugin-sdk';

private readonly _atlas = new AssetRefAtlasSlot();

protected override _buildRenderObjects(_cfg: unknown, targetTime: number): RenderObject[] {
    const layout: AtlasLayout = {
        columns: 4,
        rows: 4,
        frameDurationMs: 1000 / 12,  // 12 fps
    };

    const { asset, status } = this._atlas.update(props.imageSource as string | null, layout);
    // ... pass to VisualMedia as usual
}
```

The property declaration is identical — use `prop.imageAsset('imageSource', 'Sprite Sheet')`. The atlas-vs-plain distinction is purely in which slot class you use.

---

## Bundled plugin assets

Assets that ship *inside* a plugin (e.g. a default sprite that always loads) use a different mechanism — they bypass the registry entirely:

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

If you want a *default* bundled image that users can **optionally override** from the registry, use both:

```typescript
private readonly _bundled = this.bundledSprite('default.png');
private readonly _override = new AssetRefSlot();

// In _buildRenderObjects:
const overrideId = props.imageSource as string | null;
const { asset, status } = overrideId
    ? this._override.update(overrideId)
    : this._bundled.get();
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

| Situation | Property | Slot |
|-----------|----------|------|
| User-selected image from registry | `prop.imageAsset()` | `AssetRefSlot` |
| User-selected spritesheet from registry | `prop.imageAsset()` | `AssetRefAtlasSlot` |
| Plugin-bundled default image | — (no property) | `this.bundledSprite()` / `this.bundledImage()` |
| Non-image file (audio, etc.) | `prop.file()` | n/a |

---

## Migration from `prop.file()` / `ImageAssetSlot`

The old pattern used a file upload dialog and raw `File` objects:

```typescript
// Old — do not use for images
prop.file('imageSource', 'Image File', { accept: 'image/*' })
private readonly _image = new ImageAssetSlot();
const { asset, status } = this._image.update(props.imageSource as File | null);
```

The new pattern:

```typescript
// New
prop.imageAsset('imageSource', 'Image')
private readonly _image = new AssetRefSlot();
const { asset, status } = this._image.update(props.imageSource as string | null);
```

Key differences:
- `prop.file()` stored a transient `File` object; `prop.imageAsset()` stores a stable UUID string.
- `AssetRefSlot` accepts `string | File | null` — it handles both new UUID strings and any legacy `File` values during import.
- Assets uploaded via the registry survive save/load and can be shared between elements. File-upload assets were session-only and could not be serialised.
