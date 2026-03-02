# Plugin System Research: Current State and Path to Target Behaviour

Date: 2026-03-02

## Goal

Desired behaviour:

1. Plugins live in browser storage so users can reuse custom plugin elements conveniently.
2. Plugins used by a scene are embedded into the saved scene file.
3. When loading a scene, if required plugins are missing from browser storage, the user is prompted to install them.

---

## Executive Summary

The current system already implements most of this behaviour, but with important caveats:

- **Browser storage persistence exists today** via `PluginBinaryStore` (IndexedDB + memory fallback), and plugins are reloaded at app startup.
- **Scene plugin embedding exists today**, but only when `embedPlugins` is enabled in the Save modal (default is off).
- **Missing-plugin install prompt exists today** on import, but it uses coarse `window.confirm` prompts and only installs embedded plugins; non-embedded missing dependencies still degrade to placeholders.

So this is not a greenfield feature. It is mostly a **product/UX hardening + flow tightening** task.

---

## Current Architecture

### 1) Plugin persistence model (browser storage)

Core files:
- `src/persistence/plugin-binary-store.ts`
- `src/core/scene/plugins/plugin-loader.ts`
- `src/state/pluginStore.ts`
- `src/app/index.tsx`

Behaviour:
- `loadPlugin()` persists plugin bundles by default (`persist !== false`) into `PluginBinaryStore.put(pluginId, bundleData)`.
- `PluginBinaryStore` stores binaries in IndexedDB (`mvmnt-plugins/plugins`) and also mirrors in an in-memory cache.
- At startup (`src/app/index.tsx`), `loadAllPluginsFromStorage()` lists stored plugin IDs and reloads each bundle.
- Loaded plugins are tracked in Zustand (`usePluginStore`) for runtime/UX state.

Implication:
- Requirement #1 (plugins in browser storage for convenience) is already implemented.

### 2) Scene save/export embedding model

Core files:
- `src/persistence/export.ts`
- `src/workspace/layout/SaveSceneModal.tsx`
- `src/context/SceneContext.tsx`
- `src/context/useMenuBar.ts`

Behaviour:
- Save modal exposes checkbox: **“Embed required plugins in this file”**.
- Export calls `collectPluginDependencies(...)` which:
  - scans scene element types,
  - resolves plugin ownership (`sceneElementRegistry.getPluginId(type)` fallback to manifest mapping),
  - records dependency metadata in envelope `plugins[]`:
    - `pluginId`, `version`, `hash`, `elementTypesUsed`, `embedded`.
- If `embedPlugins === true` and storage mode is zip package (`.mvt`), exporter adds plugin bundles under `plugins/*.mvmnt-plugin` in archive.

Implication:
- Requirement #2 is implemented **conditionally**, not as default.

### 3) Scene load/import dependency handling

Core files:
- `src/persistence/scene-package.ts`
- `src/persistence/import.ts`
- `src/state/scene/runtimeAdapter.ts`
- `src/core/scene/elements/misc/missing-plugin.ts`

Behaviour:
- Import parses `.mvt` ZIP and collects `pluginPayloads` from `plugins/` folder.
- Import assesses dependencies (`assessPluginDependencies`):
  - compares against currently loaded plugins in `usePluginStore`.
  - validates version compatibility.
  - optionally validates hash against stored bundle.
- For missing dependencies that are also embedded (`embeddedMissing`):
  - prompts user with `window.confirm(...)` to install now,
  - prompts again whether to persist in browser storage,
  - installs via `loadPlugin(buffer, { persist })`.
- If dependencies remain missing, import adds warning and scene elements fallback to `MissingPluginElement` placeholders at runtime.

Implication:
- Requirement #3 exists in baseline form, but UX and robustness are limited.

---

## Gap Analysis vs Desired Behaviour

### Gap A — Embedding is optional and defaults to off

If user does not tick embed checkbox, the scene can reference plugins without carrying payloads. This weakens portability and makes “prompt to install missing plugins” impossible for those scenes.

### Gap B — Prompt UX is primitive

Current prompt is two blocking browser confirms with generic copy:
- “Install embedded plugins now?”
- “Remember these plugins on this browser?”

No structured UI list of:
- which plugin IDs/versions are missing,
- hash trust state,
- per-plugin choices,
- cancel semantics beyond yes/no.

### Gap C — Dependency check is against loaded plugins, not storage inventory first

`assessPluginDependencies` checks `usePluginStore.getState().plugins`. If a plugin binary exists in storage but is not loaded, it may still appear “missing” until reloaded.

### Gap D — Placeholder fallback works, but install retry flow is implicit

After import with missing plugins, user sees placeholders. Recovery path is possible (install plugin + runtime adapter listens for `mvmnt-plugin-installed`), but there is no explicit post-import “Resolve missing plugins” workflow.

---

## Proposed Behaviour Design (Target)

### Product semantics

1. **Browser storage remains source of convenience** (keep current design).
2. **Scenes embed required plugin bundles by default** when saving `.mvt`.
3. **On load, missing dependencies trigger a structured install prompt** if payloads exist in file.
4. **If missing dependencies have no embedded payload**, show clear unresolved dependency dialog and continue with placeholders.

---

## Implementation Plan

### Phase 1 — Make embedding default for `.mvt`

Recommended minimal change:
- In `SaveSceneModal`, default `embedPlugins` to `true`.
- Keep checkbox so advanced users can opt out.

Stronger option:
- Remove checkbox and always embed for packaged `.mvt` exports.
- (Only if product direction is “always portable scenes”.)

### Phase 2 — Replace `window.confirm` import prompts with app UI

Add a dedicated modal for import dependency resolution (instead of blocking confirms):
- Input data:
  - missing dependency list (`pluginId`, required `version`, hash status, `embedded` flag).
  - installed version (if any).
- Actions:
  - `Install Embedded` (bulk).
  - optional toggle: `Remember in this browser` (persist).
  - `Skip` (continue with placeholders).
- Output:
  - deterministic action object consumed by `importScene` flow.

Potential integration points:
- Either move prompt out of pure import function and into context/UI orchestration layer,
- or pass an `import options` callback into `importScene` to avoid direct `window` usage.

### Phase 3 — Improve dependency resolution order

Before classifying as missing:
1. Check loaded plugin store.
2. If not loaded, check `PluginBinaryStore.get(pluginId)` and attempt `reloadPluginFromStorage(pluginId)`.
3. Re-evaluate dependency status.
4. Only then classify as missing.

Result: fewer false-positive “missing plugin” prompts.

### Phase 4 — Improve user feedback after import

- Include import summary listing:
  - installed from embedded payloads,
  - skipped/unresolved plugins,
  - placeholders created.
- Add a direct CTA to Plugins page or “Resolve now” action.

---

## Data/Validation Notes

Current model already has useful fields in `ScenePluginDependency`:
- `pluginId`
- `version`
- `hash`
- `elementTypesUsed`
- `embedded`

Recommended additions (optional):
- `name` (display only, helps UX when plugin ID is opaque)
- `integrityAlgorithm` (future-proofing if hash algorithm changes)

Security notes:
- Keep hash verification of embedded payload before install.
- Keep version checks against plugin manifest and app version.

---

## Backward Compatibility

- Older scenes without `plugins/` payloads should continue to load with placeholders + clear warnings.
- Legacy inline JSON imports already produce no plugin payloads; keep current behaviour and surface better warnings.

---

## Suggested Test Coverage

1. Export with default settings embeds used plugins into `plugins/*.mvmnt-plugin`.
2. Import with missing loaded plugin + embedded payload prompts and installs successfully.
3. Import with missing loaded plugin + no payload yields placeholders and explicit unresolved warning.
4. Hash mismatch prevents install from embedded payload.
5. Plugin present in storage but not loaded is auto-reloaded before prompting.

---

## Recommended Minimal Path (MVP)

If you want the fastest route with small code churn:

1. Set save modal `embedPlugins` default to true.
2. Keep current confirm prompts temporarily.
3. Add pre-check reload from storage before classifying dependency as missing.
4. Improve warning strings to include actionable next steps.

This will align behaviour with your goals quickly, while a proper modal UX can follow as a second pass.

---

## Conclusion

Your target behaviour is largely aligned with current architecture. The main remaining work is to make embedding effectively default, replace coarse prompt UX with first-class app UI, and tighten dependency resolution so “missing” means truly unavailable (not just unloaded).