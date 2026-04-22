# Visual Asset System — Analysis & Implications

*Written 2026-04-22. Covers `visual-asset.ts`, `visual-asset-store.ts`, `visual-media-playback.ts`, `VisualMedia` render object, and `ImageElement`.*

---

## 1. Architecture Overview

The new system has four clean layers:

```
VisualAsset          — data model: decoded frames, pivot, clips, dimensions
VisualAssetStore     — loading, decoding, caching (ImageBitmap pre-baked at load time)
VisualMediaPlayback  — instance timing state (speed, startOffset, clipName)
VisualMedia          — render object: stateless drawing from VisualAsset + localTime
ImageElement         — scene element: orchestrates the above, exposes properties
```

Each layer has a single responsibility. A scene element holds one `VisualMediaPlayback`, references the shared store, and passes one `VisualMedia` render object to the renderer. The render object does zero decoding work at draw time.

---

## 2. What Improved Over the Old System

**Before:**
- `Image` render object owned an `HTMLImageElement` — loading and drawing were entangled.
- `AnimatedGif` render object defined a `GIFFrameDataProvider` interface — frame logic lived inside the render object.
- Two elements referencing the same image file each loaded their own copy.
- No playback timing abstraction; GIF timing was internal to the render object.

**After:**
- `VisualMedia` is completely neutral between still and animated — it calls `getFrameAtTime()` and does `ctx.drawImage()`. That's it.
- All `ImageData → ImageBitmap` conversion happens once, at load time in the store. Draw calls are purely `drawImage(prebakedBitmap, ...)`.
- Multiple elements sharing the same source file (same name+size+lastModified) share a single `VisualAsset` and its decoded frame data.
- Playback timing is fully separated: `VisualMediaPlayback.computeLocalTime()` lives on the element, not the render object.
- `VisualAsset` already has `clips`, `logicalWidth/logicalHeight`, and `pivot` designed in — these are the foundations for sprite/atlas support.

---

## 3. Critical Gap: Export / Import

This is the most pressing implication of the new system.

**Audio and fonts** both have a full export pipeline:
- Stable UUIDs are stored in the scene document.
- `collectAudioAssets()` and `collectFontAssets()` embed binary bytes into the ZIP under `assets/audio/` and `assets/fonts/`.
- On import, the bytes are extracted and the binary store is repopulated.

**Visual assets have none of this.** The `imageSource` property is stored as a `constant` binding (`{ type: 'constant', value: <File | string> }`). File objects are not JSON-serializable — they silently become `{}` or are omitted entirely. ObjectURLs are session-ephemeral. The result: any scene containing an image cannot be saved and reloaded, and cannot be shared with another user.

**What's needed:**
1. A `VisualAssetRecord` type with a stable UUID (modelled after `FontAssetRecord`/`AudioAssetRecord`).
2. A `visualAssets` section in the scene document (like `fontAssets`).
3. A `collectVisualAssets()` function that gathers raw bytes (via `File.arrayBuffer()` or similar) for all referenced assets.
4. ZIP embedding under `assets/visual/<id>/<filename>`.
5. Import-side extraction: create an ObjectURL or ImageBitmap, register in the store keyed by the stable asset ID.
6. Scene elements reference assets by ID string rather than by raw `File`.

Until this exists, the `prop.file` property for images is effectively session-only.

---

## 4. File Input Integration

The `prop.file` factory sets `asTrimmedString` as the runtime transform. This is a potential issue: `asTrimmedString` applied to a `File` object would not preserve the File reference. `image.ts` defines a correct `normalizeImageSource` transform that preserves `File | string | null`, but it does not appear to be wired into the `prop.file(...)` call at line 57 — the prop factory bakes in its own transform.

Worth verifying: how does `getSchemaProps()` return a `File` if the schema transform would coerce it to a string? There may be a per-element transform override mechanism in `SceneElement.getSchemaProps()`, or the file input widget bypasses the runtime transform path. If `normalizeImageSource` is dead code, the file input may be working by accident rather than by design.

The store's key derivation (`file:${name}:${size}:${lastModified}`) is a reasonable session-scoped proxy for identity but is not a content hash. Two files with identical metadata but different content would share the wrong cached asset. This is an unlikely edge case for a session cache but worth documenting.

---

## 5. Asset Lifecycle

`VisualAssetStore.clearAll()` is the only eviction method. This is appropriate for a hard reset (scene clear, memory pressure) but is too coarse for normal element lifecycle:

- When an element changes its `imageSource`, the old asset is never evicted — the store grows unboundedly in a long session.
- When an element is deleted, its asset is never released.
- There is no reference counting or LRU.

**Better lifecycle primitives would be:**
- `release(key)`: decrements a reference count; evicts when it reaches zero.
- `retain(key)` / `release(key)`: called by scene elements in `_buildRenderObjects` on source change and on element destroy.
- Or simpler: a per-scene periodic scan that evicts assets whose key is no longer referenced by any active element binding.

For the current scope (small local sessions, modest image counts), this is not urgent. But it becomes important once video frames or large spritesheets enter the picture.

---

## 6. Asset Management: Should There Be Shared File Uploads?

**What the current system provides:** session-scoped loading with element-level triggering. Each `ImageElement` calls `visualAssetStore.load(newSrc)` when its source changes. Sharing is implicit (via key matching) but has no UI or document representation.

**What shared asset management would add:**
- A first-class asset library panel (like a font manager or audio track) where the user uploads images once and assigns them to elements by reference.
- Stable IDs that survive serialization — enabling proper export/import (see §3).
- A foundation for a character rig that references 8 animation clips all sourced from the same spritesheet.
- The ability to swap a shared asset (e.g. replace a character spritesheet with a higher-res version) and have all elements update automatically.

This mirrors how the audio system works: audio assets have stable IDs, are uploaded once, and referenced everywhere. Visual assets should eventually follow the same pattern. The current file-per-element approach is fine as a starting point but will limit the system once multi-element scenes or complex character rigs are built.

---

## 7. Character Animation / Animated Sprite Workflow

### What works today

A GIF with correct frame timing will loop correctly via `getFrameAtTime()`, driven by `VisualMediaPlayback.computeLocalTime()`. Speed control via `playbackSpeed` property works. This is adequate for simple animated overlays.

### What the system already anticipates

`VisualAsset` has:
- `clips: Record<string, VisualClip>` — named regions with `startMs / endMs`
- `pivot: { x, y }` — draw-origin as fraction of logical size
- `logicalWidth / logicalHeight` — separate from raw texture dimensions

`VisualMediaPlayback` has:
- `clipName: string | null` — selects a named clip; `null` = full animation

These are stubs. `computeLocalTime()` ignores `clipName`. `VisualMedia._renderSelf()` has a `TODO: apply asset.pivot offset`. But the API surface is there.

### What a full character animation would look like

**Option A: Multiple GIFs (simplest)**
- One `ImageElement` per animation state, shown/hidden via timeline automation.
- Works today, no new code. Downside: separate upload for each animation state, no clean state machine.

**Option B: Named clips on a single GIF**
The `VisualClip` / `clipName` system was clearly designed for this. To activate it:
1. `VisualMediaPlayback.computeLocalTime()` needs to look up the asset's clip by name, clamp time to `[clipStart, clipEnd)`, and apply loop/one-shot mode.
2. The scene element exposes a `clipName` property (possibly driven by a macro or MIDI note-on).
3. The asset still loads as a single GIF; clips are defined as metadata.

This gives a simple state machine: `clipName = 'run'` drives the run loop, `clipName = 'jump'` plays once, etc.

**Option C: Sprite atlas**
A single PNG with a grid of frames. This requires extending the system:
1. Add an atlas definition to `VisualAsset`: frame grid (cols × rows), or an array of `{ x, y, w, h }` source rects per frame.
2. `getFrameAtTime()` returns not just a drawable but also a source rect `{ sx, sy, sw, sh }`.
3. `VisualMedia._renderSelf()` calls `ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh)` — the 9-argument form.
4. `logicalWidth / logicalHeight` becomes the frame size (not the atlas texture size), enabling correct layout.
5. `pivot` applies the anchor offset.

The VisualMedia render object's `#calculateDrawParams` already takes `imgW/imgH` as parameters. Swapping to the 9-argument drawImage call is a minimal change — the frame selection and source rect computation belong in a helper on `VisualAsset` (or in `getFrameAtTime`).

The scene element would expose atlas layout properties (columns, rows, frame count, frame rate) or accept them from the asset metadata. Most of the work lives in `VisualAssetStore.load()` (parsing the layout, pre-slicing if using ImageBitmap per frame) and `VisualAsset` (storing source rects alongside `frames`).

---

## 8. Elegance and Generality Assessment

### Strengths

- The four-layer architecture is correct and the responsibilities are well separated.
- Pre-baked `ImageBitmap` at load time is the right performance choice — draw calls never allocate.
- `VisualMedia` is a genuine improvement: it's smaller than `Image`, draws less distinction, and is forward-compatible with atlas support.
- The `clips` / `pivot` / `logicalWidth` fields show good forward-thinking; they won't be wasted.
- The singleton `visualAssetStore` gives implicit sharing without scene elements needing to coordinate.

### Issues and Loose Ends

**`Image` and `AnimatedGif` render objects are now vestigial.** `ImageElement` uses `VisualMedia` exclusively. The `Image` render object (`render-objects/image.ts`) has virtually identical `#calculateDrawParams` logic to `VisualMedia` — they diverged from the same origin. These should be deleted or clearly marked deprecated once any remaining callers are confirmed absent.

**`VisualMedia` ignores `logicalWidth/logicalHeight`.** `_renderSelf` uses `asset.width` and `asset.height` (line 149) rather than `logicalWidth/logicalHeight`. The pivot TODO comment notes this. The logical/physical distinction is only meaningful for sprites with transparent padding or atlas crops — it's fine to leave this until atlas support is added, but the fields will mislead readers until wired.

**`VisualMediaPlayback.clipName` is disconnected.** It's defined, documented, and referenced in comments, but `computeLocalTime()` doesn't read it. This is intentional stub behaviour, but it makes the class slightly misleading. A comment at the stub site (`// TODO: clip lookup`) would make the intent explicit.

**`VisualAsset` fields are mutable despite being conceptually append-only.** The store mutates `placeholder.status`, `placeholder.frames`, etc. directly during loading. Only `key` is `readonly`. This is an implementation detail that leaks the loading pattern — callers with a reference to the asset object could accidentally mutate it. Consider freezing the object after load completes or making mutable fields private to the store.

**`makeKey` uses filename + size + lastModified.** Adequate for a session cache. Would fail for content-hash deduplication (two files, same content, different timestamps). Not a practical problem now, but worth noting if this ever becomes a persistent asset ID.

---

## 9. Summary of Outstanding Work

Priority order:

1. **Visual asset export/import pipeline** — scenes with images cannot be saved. Implement `collectVisualAssets()` and ZIP embedding following the audio/font pattern. Replace raw `File` references in bindings with stable string IDs.

2. **Delete `Image` and `AnimatedGif` render objects** — confirm no scene elements reference them (popcat still uses Image renderobject). Remove both files plus their `index.ts` exports.

3. **Wire `VisualMediaPlayback.clipName`** — connect to `getFrameAtTime()` so named clips actually function. Required before `ImageElement` can expose a clip selector property.

4. **Apply `asset.pivot` in `VisualMedia._renderSelf()`** — one-line offset on `drawX/drawY`. Unblocks per-asset anchor points.

5. **Per-asset eviction in `VisualAssetStore`** — add `release(key)` / retain-count; call from `ImageElement` on source change and element destroy.

6. **Atlas frame support** — extend `VisualFrame` with optional source rect, add atlas layout parsing to the store, switch `VisualMedia` to 9-argument `drawImage`. All prerequisite architecture is already in place.
