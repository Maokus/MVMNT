# Asset Management — Current State & Design Notes

_Written 2026-04-29. Updated 2026-04-29 (visual scope, unified bundled APIs, race fix, bounds on demand, fit-mode clarification, Sparrow animation overrides, removed user Sparrow import)._

---

## 1. Big Picture

The visual asset system separates four concerns:

| Layer | Type | Description |
|-------|------|-------------|
| **Project asset** | `ProjectAsset` | Registry entry: name, type, stable UUID, source files. The user-facing list. |
| **Source descriptor** | `VisualSourceDescriptor` | Typed loading request (`image`, `atlas`, `sparrow`). Fully resolved before it reaches the cache. |
| **Decoded resource** | `VisualResource` | Decoded, frame-ready data. Pre-baked `ImageBitmap`s. Lives in `VisualResourceCache`. |
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

Sparrow assets are read-only in the registry UI — they can only be added by plugin-bundled assets via `bundledSparrow()`.

---

## 3. Source Descriptors

Descriptors are value types — fully describing a loading request:

```typescript
{ kind: 'image'; src: ImageSource }
{ kind: 'atlas'; src: ImageSource; layout: AtlasLayout }
{ kind: 'sparrow'; imageSrc: ImageSource; xmlSrc: ImageSource; defaultFps?: number; animations?: Record<string, SparrowAnimationOverride> }
```

`resolveProjectAssetDescriptor(assetId)` converts a registry UUID to the appropriate descriptor.

### Sparrow animation overrides

The optional `animations` field on `SparrowSourceDescriptor` lets callers override `loopMode` and `fps` per named animation without modifying the XML:

```typescript
{ kind: 'sparrow', imageSrc, xmlSrc, animations: { death: { loopMode: 'once' }, intro: { fps: 12 } } }
```

Overrides are applied in `_loadSparrow()` after prefix-based grouping. `fps` overrides create new `VisualFrame` copies rather than mutating the shared flat frame list. Different override sets produce different cache entries (the key includes the override map).

---

## 4. Decoded Resource Model

All resources are frame-based:

- **Still image**: one frame with `durationMs=0`. `getFrameAtTime` returns it unconditionally.
- **GIF**: N frames with per-frame delay.
- **Uniform atlas**: N grid-cropped frames, each with a `sourceRect` into the shared atlas bitmap.
- **Sparrow atlas**: all frames across all animations, in XML order. Named animations own sub-lists.

**No `imageElement`, `isAnimated`, or `pivot` on `VisualResource`.** The renderer operates uniformly on `frames` and `animations`.

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

---

## 5. VisualResourceHandle & Visual Scope

One class for all source types:

```typescript
const handle = new VisualResourceHandle();
const { resource, status, errorMessage } = handle.update(descriptor);
```

`update()` is safe to call every frame. It computes a cache key from the descriptor and only reloads when the key changes.

`destroy()` releases the reference. Call from `onDestroy()` — or better, use `this.visualHandle()` instead of `new VisualResourceHandle()` so the handle is auto-tracked and auto-destroyed when the element is disposed.

### Element-owned visual scope

`SceneElement` now tracks handles created through its factory methods:

- `this.visualHandle()` — creates a `VisualResourceHandle` that is auto-destroyed on `dispose()`.
- `this.bundledSprite(filename)` — creates a `BundledSprite` that is auto-destroyed on `dispose()`.
- `this.bundledSparrow(png, xml)` — creates a `BundledSparrowHandle` that is auto-destroyed on `dispose()`.

Elements no longer need an `onDestroy()` override solely to call `handle.destroy()`. Calling `destroy()` manually in `onDestroy()` is still safe — double-destroy is idempotent.

---

## 6. VisualMedia

Deterministic renderer with no internal asset slot:

- `setResource(resource, status)` — feeds decoded data in. No side effects.
- `setAnimation(name)` — selects a named animation's frame list. Pass `null` for full sequence.
- `setLocalTime(sec)` — advances frame for animated content.
- No `setAssetId()`. No `destroy()`.

### Bounds computation

`_getSelfBounds()` no longer uses stale render-pass data (`_lastDrawParams`). Draw params are computed on demand from the current resource, animation name, and local time whenever bounds are requested. This means bounds are always correct even when called before the first render.

### Fit modes

| Mode | Bounds | Notes |
|------|--------|-------|
| `'contain'` | Scaled image rect (not full container) | Letterbox/pillarbox for mismatched aspects |
| `'cover'` | Full container | Clipped with `ctx.clip()` |
| `'fill'` | Full container | Distorts aspect |
| `'none'` | Actual drawn region (min of image and container, centered) | 1:1 pixel scale; no scaling. Image is centered and clipped to container edges if it overflows. |

---

## 7. Bundled Assets

`BundledSprite` (images/GIFs) and `BundledSparrowHandle` (Sparrow pairs) now expose identical public APIs:

```typescript
.get(): ResourceHandleResult     // same for both
.build(x, y, w, h, options?): VisualMedia   // same for both
.destroy(): void                 // same for both
```

`BundledBuildOptions` includes `fitMode`, `preserveAspectRatio`, `originX/Y`, `includeInLayoutBounds`, and `animation` (string name or null).

`bundledSparrow(png, xml, defaultFps?)` accepts an optional `defaultFps` argument (default 24).

### Error visibility

Load failures (bad path, network error, etc.) surface as `status:'error'` with an `errorMessage`, rather than silently staying at `status:'idle'`. The `VisualMedia` placeholder draws a red "Error" label. No retry is attempted — if a bundled asset fails to resolve, it stays in error state for the lifetime of the element.

### Cache pending-load race fix

When `release()` drops a key's refcount to 0 while the decode is still in-flight, the cache increments a per-key **generation counter** to invalidate the orphaned decode. The async task checks the generation in its `finally` block: if the generation no longer matches, it closes any decoded `ImageBitmap`s and discards the result rather than writing to a now-evicted placeholder. This prevents duplicate decoding and ensures stale decoded data never leaks into the cache.

---

## 8. Asset Manager (UI)

The `+ Sparrow` import button has been removed. Users can only add JPEG, PNG, WebP, and GIF files. Sparrow atlases appear in the Asset Manager only when a plugin registers them via `bundledSparrow()`.

---

## 9. File Map

| Path | Role |
|------|------|
| `src/state/visualAssetRegistryStore.ts` | Registry store + `resolveProjectAssetDescriptor()` |
| `src/core/resources/visual-source-descriptor.ts` | Descriptor types, `SparrowAnimationOverride`, `makeDescriptorKey` |
| `src/core/resources/visual-resource.ts` | `VisualResource`, `VisualAnimation`, `getFrameAtTime` |
| `src/core/resources/visual-resource-cache.ts` | `VisualResourceCache` singleton — decode, cache, refcount, generation race guard |
| `src/core/resources/visual-resource-handle.ts` | `VisualResourceHandle` — managed resource lifecycle |
| `src/core/resources/bundled-sprite.ts` | `BundledSprite`, `BundledSparrowHandle` (unified API, error visibility) |
| `src/core/resources/visual-media-playback.ts` | `VisualMediaPlayback` — timing + animation selection |
| `src/core/render/render-objects/visual-media.ts` | `VisualMedia` render object (on-demand bounds, clarified fit modes) |
| `src/core/scene/elements/base.ts` | `SceneElement` — `visualHandle()`, auto-tracking via `_trackedVisualHandles` |
| `src/workspace/panels/asset-manager/AssetManagerPanel.tsx` | Asset Manager UI (image/GIF upload only) |
| `docs/visual-asset-registry.md` | User-facing documentation |

---

## 10. Known Limitations / Future Work

- **Thumbnail for Sparrow atlases**: cards show the raw packed texture. First-frame preview requires a background decode pass.
- **Drag-and-drop Sparrow pairs**: not applicable — user Sparrow import has been removed.
- **CI enforcement**: no lint rule prevents `@core/` imports in `src/plugins/`.
