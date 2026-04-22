Good. Now let me answer all the questions comprehensively:

---

## Answers to your questions

### Does plugin loader properly load assets into the asset store?

**No.** The plugin loader manages *bundled file bytes* (ZIP → blob URLs, tracked in an in-memory registry keyed by `pluginId:path`). It has no awareness of `VisualAssetStore`. Plugin elements call `this.loadBundledAsset(path)` which resolves to a blob URL string — the element is then responsible for passing that URL to the store if it wants cached/decoded assets.

**How does a plugin element get the reference?** It can't, until now. `visualAssetStore` was not exported from `@mvmnt/plugin-sdk`. I've added a new `sdk/visual-assets.ts` module that exports the store, key helpers, types, and `VisualMediaPlayback`. Templates can now import everything from `@mvmnt/plugin-sdk`.

### Is it possible to have an element with image assets not tied to properties?

**Yes, and it's a real gap.** An element can call `visualAssetStore.load(hardcodedUrl)` in `_buildRenderObjects` based on logic, MIDI state, etc., without any corresponding prop. In that case:
- Scene export only serializes props — the asset loading will be re-triggered on playback since `_buildRenderObjects` runs again.
- But the asset's bytes may not be available after import (no prop = no import path). This is acceptable for assets derived from bundled URLs or external URLs, but problematic for user-uploaded `File` objects.

For the plugin context: before this change, plugins couldn't use the store at all. Now they can, but using non-prop assets in plugins carries the same caveat.

### Do the calculated bounds include pivot offset?

**No — this is a bug.** `VisualMedia._getSelfBounds()` returns `_computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight)` — the draw params *before* pivot is applied. In `_renderSelf`, the image is drawn at `(drawX - pivot.x * drawWidth, drawY - pivot.y * drawHeight)`. When `pivot != (0,0)`, the actual rendered pixels are offset from the declared bounds. The `ImageDebugElement` makes this visible: set `pivotX/pivotY` to non-zero and you'll see the coloured outline (declared bounds) and red outline (actual draw area) diverge.

**Proposed fix** for `visual-media.ts:_getSelfBounds`:
```typescript
protected _getSelfBounds(): Bounds {
    // ... existing drawParams calculation ...
    const { drawX, drawY, drawWidth, drawHeight } = drawParams;
    const pX = this._asset?.pivot.x ?? 0;
    const pY = this._asset?.pivot.y ?? 0;
    return this._computeTransformedRectBounds(
        drawX - pX * drawWidth,
        drawY - pY * drawHeight,
        drawWidth, drawHeight
    );
}
```
I haven't applied this automatically — it's a behaviour change to existing layout calculations.

### How does VisualAssetStore key assets by src?

**Before (bug):** `makeKey(src)` returned the raw string/file-metadata key with no interpretation prefix. Both `load(src)` and `loadAtlas(src, layout)` used the same key, so loading `sprites.png` as a plain image and then as a 4×4 atlas would hit the same cache entry and return the wrong asset.

**After (fixed):**
- `makeImageKey(src)` → `image:${srcKey}`
- `makeAtlasKey(src, layout)` → `atlas:${srcKey}:cols=${c}:rows=${r}:count=${n}:dur=${d}`

The same PNG loaded as an image vs. as different atlas configurations now gets separate cache entries. `get()`, `retain()`, and `release()` now take the full key string (callers derive it via `makeImageKey`/`makeAtlasKey`).

### What is the difference between `_status` and `asset.status`?

- **`asset.status`** — the `VisualAsset`'s intrinsic state, set by the store during async loading (`'idle' | 'loading' | 'ready' | 'error'`). Lives on the asset object.
- **`_status`** — `VisualMedia`'s internal display state, independently settable via `setAsset(asset, status)`. Allows VisualMedia to show a "Loading…" placeholder *before* the store even has a placeholder object for the asset (i.e., when `visualAssetStore.get(key)` returns `undefined` because the load hasn't started yet but a source is set). The image element does: `asset?.status ?? (newSrc ? 'loading' : 'idle')` — it synthesises a `'loading'` status as the override when the asset isn't in the store yet.

---

## What was changed

| File | Change |
|------|--------|
| `visual-asset-store.ts` | Export `ImageSource`; rename `makeKey`→`makeSrcKey`; add exported `makeImageKey`/`makeAtlasKey`; `get/retain/release` now take `string` key |
| `misc/image.ts` | Remove all atlas props/logic; track `_currentAssetKey` instead of `_currentImageSource`+`_currentAtlasKey`; use `makeImageKey` |
| `plugins/sdk/visual-assets.ts` | New — exposes store, key functions, types, `VisualMediaPlayback` via the plugin SDK |
| `plugin-sdk.ts` | `export * from './sdk/visual-assets'` added |
| `_templates/image-simple.ts` | New template for plain image loading |
| `_templates/image-atlas.ts` | New template for atlas loading |
| `misc/image-debug.ts` | New debug element: 4 fit-mode cells with declared vs actual bounds indicators |
| `elements/index.ts` | Export `ImageDebugElement` |
| `scene-element-registry.ts` | Register `imageDebug` |
| `popcat-midi-display.ts` | Updated `get()` calls to use `makeImageKey` |