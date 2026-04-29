# Asset Management — Current State & Design Notes

_Written 2026-04-29. Supersedes the earlier notes from 2026-04-28._

---

## 1. Big Picture

The visual asset system separates four concerns:

| Layer | Type | Description |
|-------|------|-------------|
| **Project asset** | `ProjectAsset` | Registry entry: name, type, stable UUID, source files. The user-facing list. |
| **Source descriptor** | `VisualSourceDescriptor` | Typed loading request (`image`, `atlas`, `sparrow`). Fully resolved before it reaches the cache. |
| **Decoded resource** | `DecodedResource` | Decoded, frame-ready data. Pre-baked `ImageBitmap`s. Lives in `VisualResourceCache`. |
| **Render object** | `VisualMedia` | Canvas renderer. Asset-agnostic. Receives resources via `setResource()`, animations via `setAnimation()`. |

Registry lookup (UUID → file) and bundled URL resolution happen in the resolver/wrapper layer. `VisualResourceCache` and `VisualResourceHandle` never read the registry.

---

## 2. Asset Types

Three `ProjectAssetType` values exist:

| Type | Files | Description |
|------|-------|-------------|
| `'image'` | Single PNG/JPG/WebP/etc. | Still image. |
| `'gif'` | Single GIF | Animated; frames decoded by the cache. |
| `'sparrow'` | PNG + XML | Texture atlas. XML lists named sub-regions grouped into named animations. |

---

## 3. Source Descriptors

Descriptors are value types — fully describing a loading request:

```typescript
{ kind: 'image'; src: ImageSource }
{ kind: 'atlas'; src: ImageSource; layout: AtlasLayout }
{ kind: 'sparrow'; imageSrc: ImageSource; xmlSrc: ImageSource; defaultFps?: number }
```

`resolveProjectAssetDescriptor(assetId)` converts a registry UUID to the appropriate descriptor. This is the only place the registry is read for loading purposes.

---

## 4. Decoded Resource Model

All resources are frame-based:

- **Still image**: one frame with `durationMs=0`. `getFrameAtTime` returns it unconditionally.
- **GIF**: N frames with per-frame delay.
- **Uniform atlas**: N grid-cropped frames, each with a `sourceRect` into the shared atlas bitmap.
- **Sparrow atlas**: all frames across all animations, in XML order. Named animations own sub-lists.

**No `imageElement`, `isAnimated`, or `pivot` on `DecodedResource`.** The renderer operates uniformly on `frames` and `animations`.

**Named animations** replace flat clips:

```typescript
interface VisualAnimation {
    name: string;
    frames: VisualFrame[];      // direct refs — no startMs/endMs offset
    fps: number;
    totalDurationMs: number;
    loopMode: 'loop' | 'once' | 'pingpong';
}
```

Each animation owns its frame list. Callers pass `animation.frames` and `animation.totalDurationMs` directly to `getFrameAtTime()`.

---

## 5. VisualResourceHandle

One class for all source types:

```typescript
const handle = new VisualResourceHandle();
const { resource, status, errorMessage } = handle.update(descriptor);
```

`update()` is safe to call every frame. It computes a cache key from the descriptor and only reloads when the key changes.

`destroy()` releases the reference. Call from `onDestroy()`.

---

## 6. VisualMedia

Deterministic renderer with no internal asset slot:

- `setResource(resource, status)` — feeds decoded data in. No side effects.
- `setAnimation(name)` — selects a named animation's frame list. Pass `null` for full sequence.
- `setLocalTime(sec)` — advances frame for animated content.
- No `setAssetId()`. No `destroy()`.

---

## 7. Bundled Assets

`BundledSprite` (images/GIFs) and `BundledSparrowHandle` (Sparrow pairs) resolve filenames to blob URLs asynchronously, then feed descriptors into internal `VisualResourceHandle`s.

`SceneElement` convenience methods:
- `bundledSprite(filename)` → `BundledSprite`
- `bundledImage(filename)` → `BundledSprite` (same class, different name)
- `bundledSparrow(pngFilename, xmlFilename)` → `BundledSparrowHandle`

`BundledSparrowHandle` calls `addBundledSparrowEntry()` once both URLs are resolved, making the asset appear in the Asset Manager.

---

## 8. Error Messages

`DecodedResource.errorMessage` is set when `status === 'error'`, with the original exception message. `ResourceHandleResult.errorMessage` forwards this to callers. Renderers can display it (currently the placeholder shows 'Error'; the message is available for richer diagnostics).

---

## 9. File Map

| Path | Role |
|------|------|
| `src/state/visualAssetRegistryStore.ts` | Registry store + `resolveProjectAssetDescriptor()` |
| `src/core/resources/visual-source-descriptor.ts` | Descriptor types, `AtlasLayout`, `makeDescriptorKey` |
| `src/core/resources/visual-resource.ts` | `DecodedResource`, `VisualAnimation`, `getFrameAtTime` |
| `src/core/resources/visual-resource-cache.ts` | `VisualResourceCache` singleton — decode, cache, refcount |
| `src/core/resources/visual-resource-handle.ts` | `VisualResourceHandle` — managed resource lifecycle |
| `src/core/resources/bundled-sprite.ts` | `BundledSprite`, `BundledSparrowHandle` |
| `src/core/resources/visual-media-playback.ts` | `VisualMediaPlayback` — timing + animation selection |
| `src/core/render/render-objects/visual-media.ts` | `VisualMedia` render object |
| `src/workspace/panels/asset-manager/AssetManagerPanel.tsx` | Asset Manager UI |
| `docs/visual-asset-registry.md` | User-facing documentation |

---

## 10. Known Limitations / Future Work

- **`loopMode` on animations**: the field exists but `VisualMedia` always loops. `'once'` and `'pingpong'` are not yet implemented.
- **Thumbnail for Sparrow atlases**: cards show the raw packed texture. First-frame preview requires a background decode pass.
- **Drag-and-drop Sparrow pairs**: dropping both files simultaneously is not yet handled.
- **CI enforcement**: no lint rule prevents `@core/` imports in `src/plugins/`.
