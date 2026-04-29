# Visual Asset System — Import/Export Bug Report (April 2026)

This document records findings from an investigation into how the visual asset system interacts with the import/export persistence system.

---

## System Overview

Visual assets go through a two-tier system:

1. **Visual Asset Registry** (`visualAssetRegistryStore`) — runtime store keyed by stable UUID, holds `File` objects (or blob URL strings for plugin-provided assets). User assets are `origin: 'user'`; plugin-bundled assets are `origin: 'plugin'`.

2. **Element property bindings** — some element types (`prop.file()`) store `File` objects directly in their constant bindings; others (`prop.imageAsset()`, `prop.sparrowAsset()`) store asset ID strings pointing into the registry.

**Export pipeline:** `collectVisualAssets()` scans both the registry and element bindings, assigns stable UUIDs, computes SHA-256 hashes, and packs bytes into the ZIP under `assets/visual/<id>/<filename>`. The in-memory `doc.scene` is then patched in-place to replace `File` values with their UUID strings before JSON serialisation.

**Import pipeline:** `restoreVisualAssets()` reconstructs `File` objects from ZIP bytes and patches `doc.scene` to replace UUID strings with `File` objects. After `DocumentGateway.apply()` populates the stores, `hydrateVisualAssetRegistry()` rebuilds the registry, and `migrateStoreAssetRefBindings()` converts any lingering `File` values in the store back to asset ID strings (for `assetRef`-type properties).

---

## Identified Bugs

### BUG-1: `buildVisualAssetRegistry` leaked plugin asset IDs into `assetsOrder` _(Fixed)_

**File:** `src/persistence/export.ts` — `buildVisualAssetRegistry()`

**Cause:** The `assets` map was correctly filtered to exclude `origin: 'plugin'` entries, but `assetsOrder` was returned as-is from the raw registry — including plugin asset IDs.

**Impact:** The exported `visualAssetRegistry.assetsOrder` array contained IDs for plugin-provided assets (e.g., bundled sprite sheets). On re-import, `hydrateVisualAssetRegistry()` iterated these IDs as `orderedIds`, called `fileById.get(assetId)` for each, and silently skipped them (no corresponding ZIP entry). Functionally harmless since plugin assets are re-registered by the plugin itself, but the exported file contained stale/irrelevant data and could confuse future tooling.

**Fix:** Filter `assetsOrder` in parallel with the `assets` map; return `undefined` if no user assets remain. Committed.

---

### BUG-2: `migrateSceneAudioSystemV5` called twice during every import

**Files:** `src/persistence/document-gateway.ts:238`, `src/state/sceneStore.ts:1612`

**Cause:** `DocumentGateway.apply()` calls `migrateSceneAudioSystemV5(rawSceneData)` and passes the result to `importScene()`. `importScene()` unconditionally calls `migrateSceneAudioSystemV5(payload)` again at its entry point.

**Impact:** Currently harmless — the migration is idempotent (channel-selector normalisation and binding shape changes are safe to apply twice). However:

- Wasted CPU on every import (migration iterates all element bindings)
- If the migration is ever made non-idempotent (e.g., appending to arrays), it will silently corrupt data
- Code is confusing: `DocumentGateway.apply` is the call-site owner but has to know about an internal migration that `importScene` already applies

**Recommended fix:** Remove the `migrateSceneAudioSystemV5` call from `DocumentGateway.apply()` and let `importScene` own the migration. Alternatively, remove it from `importScene` and make `DocumentGateway.apply` responsible — but the former is preferable since `importScene` is the lower-level primitive that may be called independently.

---

### BUG-3: Registry cleared before `DocumentGateway.apply()` — no recovery path

**File:** `src/persistence/import.ts:856–862`

```typescript
// Clear registry before applying (previous project's assets should not persist)
useVisualAssetRegistryStore.getState()._clear();   // registry is now empty

DocumentGateway.apply(doc as any);                 // if this throws...

hydrateVisualAssetRegistry(fileById, ...);         // ...this never runs
migrateStoreAssetRefBindings(fileById);
```

**Impact:** If `DocumentGateway.apply()` throws an uncaught exception, the registry is left permanently empty. Any render that then tries to resolve asset IDs gets `undefined` for all visual assets. The scene store was partially updated (depending on how far into `apply()` it got), leaving the app in an inconsistent state.

**Recommended fix:** Either:

- Wrap `DocumentGateway.apply()` + the hydration calls in a single try/catch, and on failure restore the original registry snapshot before the `_clear()`.
- Or: move `_clear()` into `hydrateVisualAssetRegistry()` so it only clears after a successful apply, and call hydration unconditionally even on partial failure.

---

### OBSERVATION: `restoreVisualAssets` patches any string that matches an asset UUID

**File:** `src/persistence/import.ts:483–491`

The function patches `doc.scene` constant bindings: any string value that matches a known asset ID is replaced with the reconstructed `File` object.

This works because asset IDs are UUIDs (`crypto.randomUUID()`), and the only values stored as UUIDs in constant bindings are asset IDs themselves. However, there is no explicit type-tagged guard — the code relies on UUID uniqueness as the implicit discriminator.

This is not currently a bug but is fragile. If a user ever assigns a raw UUID string as a text property, and that UUID happens to collide with an asset ID in the same file, the property would be silently overwritten with a `File` object. Probability is negligible (UUID collision space is 2^122) but the code comment should be updated to explain this assumption.

---

## What is working correctly

- Export correctly skips `origin: 'plugin'` registry entries — plugin-bundled assets (e.g. from `bundledSparrow()`) are re-provided by the plugin on load, not round-tripped through the ZIP.
- File object identity is correctly preserved through the `doc.scene → normalizeElements → deserializeElementBindings → store` pipeline (no deep cloning of binding values occurs).
- The `fileKeyToId` deduplication in `collectVisualAssets` correctly prevents the same physical file from being packed multiple times even if it appears in both the registry and a prop.file() binding.
- SHA-256 hashes are recorded in the export metadata — these could be used for future integrity checking or deduplication, though they are not currently validated on import.
