# Plugin System vs Saving/Loading Research

_Last Updated: 10 February 2026_

## Current System Overview

MVMNT has two parallel persistence tracks:

- Scene files (.mvt) are exported/imported via the persistence pipeline, which serializes scene elements by type plus their bindings and scene settings.
- Runtime plugins are loaded from `.mvmnt-plugin` bundles and persisted separately in IndexedDB, then reloaded on app startup.

Key references:

- Scene export/import pipeline: [src/persistence/export.ts](src/persistence/export.ts), [src/persistence/import.ts](src/persistence/import.ts), [src/persistence/document-gateway.ts](src/persistence/document-gateway.ts)
- Scene element storage: [src/state/sceneStore.ts](src/state/sceneStore.ts)
- Runtime plugin loading & persistence: [src/core/scene/plugins/plugin-loader.ts](src/core/scene/plugins/plugin-loader.ts), [src/persistence/plugin-binary-store.ts](src/persistence/plugin-binary-store.ts), [src/app/index.tsx](src/app/index.tsx)
- Element registry + runtime adapter: [src/core/scene/registry/scene-element-registry.ts](src/core/scene/registry/scene-element-registry.ts), [src/state/scene/runtimeAdapter.ts](src/state/scene/runtimeAdapter.ts)

## What Happens When Saving a .mvt With Plugin Elements

1. `exportScene()` builds a persistent document using `DocumentGateway.build()`, which grabs the scene store’s element list and bindings. It serializes each element as `{ id, type, index, ...bindings }`.
2. There is no plugin metadata recorded in the export envelope. The scene element’s `type` field is preserved, but the plugin ID, plugin manifest, or plugin binary is not included.
3. The resulting .mvt bundle contains `document.json` plus audio/midi/font assets, but does not embed plugin bundles.

Implication: the exported .mvt file is not self-contained with respect to plugin code. It depends on the user already having the required plugin installed in IndexedDB.

## What Happens When Loading a .mvt With Plugin Elements

1. `importScene()` validates the envelope and applies it via `DocumentGateway.apply()`.
2. The scene store imports the elements exactly as serialized (including `type`). There is no validation that `type` is registered in the element registry.
3. The runtime adapter attempts to instantiate each element via `sceneElementRegistry.createElement(type, config)`. If the element type is missing (plugin not loaded), registry returns `null` and the adapter logs a warning and skips that element.

Net effect when the plugin is missing:

- The element remains in the scene store, but is not instantiated in the runtime cache and therefore does not render.
- Any UI that depends on registry schemas will have incomplete data (for example, element type display falls back to the raw type string when metadata is missing).

## How Plugin Persistence Works Today

- When a plugin bundle is loaded, the binary is written to IndexedDB via `PluginBinaryStore.put()`.
- On startup, `loadAllPluginsFromStorage()` pulls those binaries back and re-registers custom element types.
- This persistence is independent of the scene export/import pipeline; it is global per browser profile, not per .mvt file.

## Potential Flaws / Gaps

1. Non-portable scene files: .mvt exports do not include plugin dependencies, so loading on a new machine silently drops plugin elements from rendering.
2. Missing dependency awareness: there is no explicit dependency list in the scene file; load-time cannot warn that required plugins are missing.
3. No fallback rendering: missing plugin elements are skipped without a visible placeholder in the scene.
4. Version drift risk: plugin binaries are persisted globally in IndexedDB; a scene can load with a different plugin version than it was created with, without any compatibility checks.
5. No uninstall safety: unloading a plugin removes registry entries, which effectively disables those elements across all scenes without marking the scenes as degraded.

## Alternative Solutions (At Least Three)

### Option A: Embed Plugin Bundles in .mvt

- Store required `.mvmnt-plugin` files inside the .mvt zip (for each plugin used by scene elements).
- On import, install embedded plugins into the registry (and optionally persist them to IndexedDB).
- Pros: Fully portable files; no external dependency required.
- Cons: Larger file sizes; potential security concerns when auto-installing plugins.

### Option B: Save Plugin Dependency Manifest in .mvt

- Add a `plugins` section to the export envelope containing `pluginId`, `version`, `hash`, and the element types used.
- On import, check the plugin registry and show a blocking or warning dialog if dependencies are missing or version mismatched.
- Pros: Small file size increase; better user feedback; supports manual install.
- Cons: Still not self-contained; requires a way to fetch or obtain the plugins.

### Option C: In-Scene Fallback Elements

- When importing a scene, if an element type is missing, replace it with a placeholder element that preserves size/position and shows a warning badge.
- The placeholder can retain the original `type` and serialized bindings so that once the plugin is installed, it can be rehydrated automatically.
- Pros: Prevents silent failure; preserves the scene layout and signals missing dependencies.
- Cons: Requires placeholder element design and migration logic.

### Option D: Plugin Registry with Auto-Fetch

- Introduce a plugin catalog (remote or local). The .mvt file stores plugin IDs + semver ranges.
- On import, the app tries to auto-fetch and install missing plugins from the catalog, with user confirmation.
- Pros: Smooth UX for sharing; avoids large .mvt files.
- Cons: Requires hosting, signing, and versioning infrastructure; offline imports still fail.

### Option E: Compile-and-Embed Element Snapshots

- During export, render plugin elements to a cached visual representation (e.g., static image or baked timeline) stored in the .mvt as fallback.
- On import without plugins, display the cached output instead of failing entirely.
- Pros: Visual fidelity preserved for viewing/export; no plugin install required for playback.
- Cons: Loses editability; increased export time and storage.

## Recommendation Candidates

Short-term, Option B + Option C provides minimal disruption and immediate clarity for users.
Longer-term, Option A or Option D can be layered in to make scenes portable across machines and collaborators.
