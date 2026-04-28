# Asset Management — Current State & Design Notes

_Written 2026-04-28. Supersedes the scattered observations in `visual-asset-system-analysis.md`, `some-asset-thoughts.md`, and `bundled-assets-in-asset-browser.md`._

---

## 1. Big Picture

MVMNT now has a proper visual asset system. The primary user-facing surfaces are:

- **Asset Manager panel** — left panel in MidiVisualizer; holds all assets for the session.
- **`assetRef`/`imageAsset`/`sparrowAsset` properties on elements** — dropdowns that let users pick from registered assets.
- **Bundled assets** — images/spritesheets shipped inside plugin source; automatically appear as non-deletable entries in the panel.

Under the hood, two stores collaborate:

| Store                      | Responsibility                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VisualAssetRegistryStore` | The _registry_ of all assets the user or plugins know about. Source of truth for the Asset Manager panel and property dropdowns.                                 |
| `VisualAssetStore`         | The _loading cache_. Decodes `File`/URL → `VisualAsset` (holding pre-baked `ImageBitmap` frames). Shared; multiple elements can reference the same cached asset. |

The registry tells you _what assets exist and what they're called_. The loading cache tells you _whether an asset is decoded and ready to draw_.

---

## 2. Asset Types

Three `VisualAssetType` values exist:

| Type        | File(s)                  | Description                                                                              |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `'image'`   | Single PNG/JPG/WebP/etc. | Still image.                                                                             |
| `'gif'`     | Single GIF               | Animated; frames decoded by `VisualAssetStore`.                                          |
| `'sparrow'` | PNG + XML                | Texture atlas. XML lists named sub-regions; animations are grouped by frame-name prefix. |

All three are registered in `VisualAssetRegistryStore` and rendered via `VisualMedia`. The difference is in how `VisualAssetStore` decodes them:

- `image` / `gif` → `VisualAssetStore.load(src)` (single source).
- `sparrow` → `VisualAssetStore.loadSparrow(imageSrc, xmlSrc, defaultFps)` — parses frame rects from XML, groups by prefix into named `VisualClip`s (e.g. `idle0, idle1` → clip `idle`).

---

## 3. Asset Sources: Bundled vs User

### User assets

Uploaded via the Asset Manager panel (either `+ Upload` for images/GIFs or `+ Sparrow` for atlas pairs). Stored in the registry with:

```typescript
source: 'user'
deletable: true
file: File          // the raw File object from the browser picker
xmlFile?: File      // present only for 'sparrow' type
```

User assets are serialized when the project is saved. `collectVisualAssets()` reads their bytes and embeds them in the project ZIP under `assets/visual/<id>/`. On project import, they are extracted and re-registered via `_hydrateFromImport()`.

### Bundled assets

Shipped inside plugin source files. A plugin element declares:

```typescript
private readonly _sprite = this.bundledSprite('character.png');
```

`BundledImageAssetSlot` resolves the filename to a blob URL via the `bundledAssetRegistry` (populated when the plugin ZIP is loaded). After resolution, it calls:

```typescript
visualAssetRegistryStore.getState().addBundledEntry(id, name, blobUrl, type);
```

where `id` is derived deterministically from `pluginId + ':' + filename`, making repeated calls idempotent. The entry appears in the Asset Manager panel as a non-deletable card with a "plugin" badge.

Bundled entries carry:

```typescript
source: 'bundled';
deletable: false;
file: string; // blob URL (not a File object)
```

They are skipped by `collectVisualAssets()` — the plugin ZIP already contains them; re-embedding would be redundant.

---

## 4. How an Asset Goes from Upload to Pixels

For a user-uploaded image:

```
User clicks "+ Upload"
  → file input → File object
  → addAsset(file) in VisualAssetRegistryStore
     → entry created with stable UUID, stored in registry
  → AssetManagerPanel renders a card (creates ObjectURL for thumbnail)

User picks asset in element property dropdown
  → element's assetRef property holds the UUID string
  → AssetRefSlot.update(assetId) called each frame
     → looks up UUID in registry → gets File
     → calls ImageAssetSlot.update(file)
        → derives cache key (filename + size + lastModified)
        → calls VisualAssetStore.load(file) if not cached
           → async: decodes to ImageBitmap frames, sets status 'ready'
     → returns { asset: VisualAsset | null, status }
  → ImageElement passes asset to VisualMedia.setAsset()
  → VisualMedia._renderSelf() calls asset.getFrameAtTime(localMs)
     → returns the correct ImageBitmap for that frame
  → ctx.drawImage(bitmap, ...)
```

For a Sparrow atlas, the path is the same except `AssetRefSparrowSlot` calls `VisualAssetStore.loadSparrow(pngFile, xmlFile)` instead.

---

## 5. The Asset Manager Panel UI

Located at `src/workspace/panels/asset-manager/AssetManagerPanel.tsx`.

**Header buttons:**

- `+ Sparrow` — opens a two-step picker (PNG first, then XML). Uses two hidden `<input type="file">` elements chained via state: selecting the PNG opens the XML picker automatically. Calls `addSparrowAsset(pngFile, xmlFile)`.
- `+ Upload` — multi-file picker for images/GIFs. Calls `addAsset(file)` for each.

Drag-and-drop onto the panel body also calls `addAsset()` for each dropped file. (Drag-dropping a Sparrow pair is not currently supported — the two-file requirement makes it ambiguous.)

**Asset cards:**

- Thumbnail (ObjectURL for user assets; blob URL for bundled).
- Name — double-click to rename (calls `renameAsset()`).
- Delete button — shown only if `entry.deletable` is true (user assets only).
- `plugin` badge — shown if `entry.source === 'bundled'`.

---

## 6. What Changed From the Original System

The original system had:

- `prop.file()` — an element-level file picker that stored a raw `File` directly in the property binding.
- `visualAssetStore` — a session cache keyed by filename+size+lastModified.
- No shared registry, no stable IDs, no panel.

Problems with that approach:

- **Serialization:** `File` objects are not JSON-serializable. Saving a project silently dropped all image references. There was no export pipeline.
- **No sharing:** Two elements showing the same image each held their own `File` reference. The cache prevented double-decoding, but the UX had no notion of a shared asset.
- **Discoverability:** There was no way to see what images were in use in the scene.
- **Atlas support:** The `prop.file()` approach had no natural extension point for multi-file assets (PNG + XML pairs).

The new system addresses all of these:

| Old                       | New                                                                     |
| ------------------------- | ----------------------------------------------------------------------- |
| `prop.file()` per element | `prop.imageAsset()` / `prop.sparrowAsset()` referencing a registry UUID |
| File stored in binding    | UUID stored in binding; File lives in registry                          |
| No export                 | `collectVisualAssets()` embeds bytes in ZIP                             |
| No panel                  | Asset Manager panel                                                     |
| No bundled asset UX       | Bundled entries appear as non-deletable cards                           |
| No atlas import           | `+ Sparrow` button in panel header                                      |

---

## 7. Potential Points of Confusion

### 7.1 Two stores, different responsibilities

`VisualAssetRegistryStore` (Zustand) and `VisualAssetStore` (class, singleton) are easy to conflate. The registry is the user-facing list; the loading cache is internal infrastructure. An asset can be in the registry but not yet in the loading cache (user never assigned it to an element). An entry can be in the loading cache without being in the registry (older elements using raw `File` or URL directly, or bundled blob URLs loaded before the registry was populated).

### 7.2 `file: File | string` in registry entries

`VisualAssetRegistryEntry.file` is typed as `File | string`. For user assets it's always a `File`. For bundled assets it's a blob URL string. Code that reads `entry.file` must handle both branches. `AssetRefSlot` does handle this correctly, but it's a footgun for anyone adding new code that destructures an entry.

### 7.3 The Sparrow two-step picker

Clicking `+ Sparrow` opens a PNG picker. Selecting a PNG immediately opens an XML picker. If the user cancels the XML picker, `pendingSparrowPng` state is cleaned up via a 60-second timeout (not immediately on dialog cancel, because browser file pickers don't fire a cancel event reliably). This means: if a user picks a PNG, cancels the XML, then immediately clicks `+ Sparrow` again — there are now two pending PNG files. The new one overwrites the state, so the first PNG is silently dropped. This is fine for normal use but could confuse someone who clicks rapidly.

### 7.4 Thumbnail display for Sparrow atlases

The `AssetCard` thumbnail renders `entry.file` (the PNG). For a Sparrow atlas this shows the raw packed texture, not an individual frame — which can look like a confusing grid of sprites. There is no "first frame" preview. This is acceptable for now but can look odd.

### 7.5 `makeKey` is not a content hash

`VisualAssetStore` derives cache keys from `filename + size + lastModified`. This means:

- Two files with identical content but different modification times → two cache entries (wasteful but harmless).
- Two files with the same name+size+lastModified but different content → wrong cached asset (extremely unlikely in practice but theoretically broken).

The registry IDs (UUIDs) are stable and correct; the loading cache keys are a session-scoped heuristic. These two identity systems are parallel and should not be confused.

### 7.6 Bundled assets and the loading cache

Bundled asset blob URLs are registered in the registry but the `VisualAssetStore` hasn't necessarily loaded them yet. `AssetRefSlot` triggers loading lazily when an element actually references the ID. If you inspect the loading cache before any element uses a bundled asset, you'll find it absent. This is correct and intentional — don't interpret an absent loading-cache entry as a missing asset.

### 7.7 `clipName` on `VisualMediaPlayback` is a stub

Sparrow atlases create named `VisualClip`s on the `VisualAsset` (e.g. `idle`, `run`, `jump`). `VisualMediaPlayback` has a `clipName: string | null` field. But `computeLocalTime()` does not yet read it — the full animation always plays regardless of `clipName`. The field is defined and documented but disconnected. Setting `clipName` currently has no effect.

---

## 8. How the System Could Be Improved

In rough priority order:

### 8.1 Wire `VisualMediaPlayback.clipName`

The most impactful change for the Sparrow/animation use case. `computeLocalTime()` should:

1. Look up the clip by name in `asset.clips`.
2. Clamp local time to `[clip.startMs, clip.endMs)`.
3. Apply loop vs one-shot mode per clip.

This unlocks the full sprite animation workflow: an element exposes a `clipName` property (possibly driven by MIDI note-on or an automation lane) and switches animation state without any extra loading.

### 8.2 `+ Sparrow` as a single multi-file picker

Some browsers now support `<input multiple>` with `accept="image/png,.xml"`. This would let users select both files in one dialog instead of two chained ones. The UX is better; the implementation just needs to sort the selected files into PNG/XML by extension. Worth switching once browser support is confirmed.

### 8.3 Asset type badges in the panel

Cards currently show only a "plugin" badge. Adding type badges (`gif`, `sparrow`, `png`) would help users understand what they're looking at without opening an element property panel. Sparrow atlases in particular look confusing as raw textures.

### 8.4 Frame preview for Sparrow atlases

Show the first decoded frame (first `SubTexture` rect) rather than the raw texture. Requires the loading cache to have decoded the atlas — possible if the panel triggers a background load of panel-visible assets.

### 8.5 Drag-and-drop for Sparrow pairs

Support dropping both files simultaneously onto the panel. Detect `png + xml` in the dropped `FileList`, pair them, call `addSparrowAsset`. Requires handling the case where only one file is dropped (treat as image or show an error).

### 8.6 `release(key)` in `VisualAssetStore`

Currently assets are never evicted from the loading cache within a session. For large spritesheets or many GIFs this is a memory concern. A reference-counting `retain`/`release` pair (called by elements on source change and element destroy) would allow proper cleanup. The store already has `clearAll()` for full reset; per-asset eviction is the missing piece.

### 8.7 `VisualMedia` should use `logicalWidth/logicalHeight`

`_renderSelf` currently uses `asset.width` and `asset.height` (raw texture dimensions). For Sparrow atlases, `logicalWidth/logicalHeight` is the intended frame size (with padding stripped). Until this is switched, the element will size itself to the full texture rather than a single frame. The fix is mechanical: swap `asset.width → asset.logicalWidth` (etc.) in `_renderSelf` and `_getSelfBounds`.

### 8.8 Apply pivot in `VisualMedia._renderSelf` and fix `_getSelfBounds`

`VisualAsset.pivot` is set but `_renderSelf` has a `TODO` comment — the offset is not applied. Similarly `_getSelfBounds` does not account for pivot, so layout bounds diverge from actual pixels. One-line fix each. Unblocks per-asset anchor points (useful for character sprites with variable origin).

### 8.9 CI enforcement for bundled asset registration

There's no automated check that a plugin element which calls `bundledSprite()`/`bundledImage()` also calls `addBundledEntry()`. If a plugin author forgets, the asset loads fine for rendering but is invisible in the Asset Manager panel and unselectable in dropdowns. A lint rule or documentation note would help.

---

## 9. File Map

| Path                                                       | Role                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `src/state/visualAssetRegistryStore.ts`                    | Registry store: all user/bundled asset metadata                 |
| `src/workspace/panels/asset-manager/AssetManagerPanel.tsx` | Asset Manager UI                                                |
| `src/core/resources/visual-asset-store.ts`                 | Loading cache: decode, cache, share VisualAssets                |
| `src/core/resources/visual-asset.ts`                       | `VisualAsset` data model (frames, clips, pivot, dims)           |
| `src/core/resources/visual-asset-slot.ts`                  | `AssetRefSlot`, `AssetRefSparrowSlot` — bridge registry → store |
| `src/core/resources/visual-media.ts`                       | `VisualMedia` render object                                     |
| `src/core/resources/visual-media-playback.ts`              | `VisualMediaPlayback` — timing + clip selection                 |
| `src/core/scene/plugins/plugin-sdk-prop-factories.ts`      | `prop.imageAsset()`, `prop.sparrowAsset()`                      |
| `src/core/scene/elements/misc/image.ts`                    | `ImageElement` — the default image scene element                |
