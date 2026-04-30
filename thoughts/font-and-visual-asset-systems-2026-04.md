# Font System & Visual Asset System — Architecture Notes (April 2026)

## Bug Fixed: Fonts Lost on File Save/Load

**Root cause:** `src/persistence/export.ts` constructed the `SceneExportEnvelopeV6.scene` object without `fontAssets` or `fontLicensingAcknowledgedAt`, even though `DocumentGateway.build()` correctly gathered them into `doc.scene`. The import path (`import.ts:876`) correctly reads `envelope.scene?.fontAssets` — it just never arrived.

**Effect:** Font binaries were packed into the ZIP correctly (under `assets/fonts/{id}/`), but the metadata record was absent from the JSON envelope. On reload, the import loop found no entries to hydrate, so all custom fonts disappeared from the scene.

**Fix:** Two lines added to `SceneExportEnvelopeV6`'s `scene` type and to the envelope literal at line 821:

```ts
fontAssets: doc.scene?.fontAssets,
fontLicensingAcknowledgedAt: doc.scene?.fontLicensingAcknowledgedAt,
```

---

## How the Font System Works

### Storage layers

| Layer                                                      | What it stores                                                                         | Lifetime                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `SceneFontsState` (Zustand, inside `sceneStore`)           | Font metadata: `FontAsset` records (id, family, variants, originalFileName, licensing) | Session + persisted to project file                                   |
| `FontBinaryStore` (`src/persistence/font-binary-store.ts`) | Raw font bytes (ArrayBuffer) keyed by asset id                                         | IndexedDB (persistent across sessions), with in-memory cache fallback |
| Browser FontFace API                                       | Active CSS @font-face registrations                                                    | Session only — re-registered on every project load                    |

### Upload path

1. User picks a file in `SceneFontManager`.
2. `registerFontAsset()` (sceneStore) stores metadata into `fonts.assets`.
3. Bytes are written to `FontBinaryStore.put(id, buffer)`.
4. `registerCustomFontVariant()` (font-loader) registers a `FontFace` so the font is immediately usable in canvas/CSS.

### Save path (ZIP export)

1. `DocumentGateway.build()` calls `exportSceneDraft()` → reads `fonts.assets` metadata into `doc.scene.fontAssets`.
2. `export.ts` copies `doc.scene.fontAssets` and `doc.scene.fontLicensingAcknowledgedAt` into the JSON envelope.
3. `collectFontAssets()` (`font-asset-export.ts`) reads bytes from `FontBinaryStore` for every known asset and returns `assetPayloads`.
4. `buildZip()` writes font bytes into `assets/fonts/{id}/{filename}` inside the ZIP.

### Load path (ZIP import)

1. `parseScenePackage()` extracts `fontPayloads: Map<string, Uint8Array>` from `assets/fonts/` ZIP paths.
2. `DocumentGateway.apply()` passes `doc.scene.fontAssets` to `sceneStore.importScene()`, which restores metadata.
3. `import.ts` hydration loop (`line 876`) matches each asset id to a `fontPayloads` entry and calls `FontBinaryStore.put()`, then `ensureFontVariantsRegistered()` to re-register FontFace objects.

---

## How the Visual Asset System Works

The visual asset registry lives in a separate Zustand store (`src/state/visualAssetRegistryStore.ts`, type `ProjectAsset`) and manages project-level image/sprite assets.

| Aspect            | Visual asset system                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| State store       | `useVisualAssetRegistryStore` — standalone, not nested in scene                                                                        |
| Binary storage    | Decoded into GPU textures via the resource cache; raw bytes in ZIP only                                                                |
| Scene reference   | Props store UUIDs (`imageAsset`, `sparrowAsset` prop types); registry maps UUID → source descriptor                                    |
| Export            | `buildVisualAssetRegistry()` writes a top-level `visualAssetRegistry` key in the envelope JSON; binaries go to `assets/visual/` in ZIP |
| Import            | `hydrateVisualAssetRegistry()` called after `DocumentGateway.apply()` — separate from scene hydration                                  |
| In-memory caching | Resource cache keyed by `VisualSourceDescriptor`; `VisualResourceHandle` manages ref-counts                                            |

---

## Should the Two Systems Be Unified?

### Structural similarities

- Both have: a metadata record, an opaque binary blob, a ZIP storage path, a post-load registration step.
- Both reference assets by UUID, and both require hydration before rendering can work.

### Key differences

|                              | Font system                                                             | Visual asset system                                                            |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Binary reuse across sessions | IndexedDB keeps font bytes between sessions even without a project file | No separate persistent binary cache; bytes only come from the ZIP on each load |
| Scene vs. project scope      | Fonts live inside `sceneStore` (scene-scoped)                           | Visual registry is project-scoped (standalone store)                           |
| Registration side-effect     | Must call `FontFace` API — browser global mutation                      | Decoded to textures lazily on first render                                     |
| Variants / metadata richness | Multiple variant entries per family (weight, italic, format)            | Single source descriptor per asset                                             |
| Plugin API exposure          | Not currently in SDK                                                    | Exposed via `resolveProjectAssetDescriptor` in `@mvmnt/plugin-sdk`             |

### Verdict: partial unification is worth considering, full unification is not

**Do unify:** The export/import plumbing is copy-pasted in spirit. A shared `AssetPackager` abstraction — responsible for collecting `(id, bytes)` pairs, writing them to ZIP, and running post-load callbacks — would eliminate the class of bugs where a new asset type's metadata is serialized but omitted from the envelope (which is exactly what caused this bug). Both systems would register their entries with the packager; the packager handles ZIP paths and envelope placement uniformly.

**Don't unify:** The state stores should remain separate. Fonts are scene-scoped and have session-persistent binary storage (IndexedDB) which visual assets don't need. Merging the state would create tight coupling and complicate the plugin API boundary.

**Immediate action worth taking:** Add an integration test that round-trips a project with custom fonts through export→import and asserts that font metadata and binaries are both present after reload. The bug caught here would have been caught immediately by such a test.
