# Plugin Public API — State of Play (March 2026)

## What Was Done

### Goal
Create a stable, versioned public contract for plugin development so that externally-packaged plugins work identically to plugins developed inside the monorepo. The core problem being solved: plugin authors were importing from `@core/`, `@audio/`, and `@state/` paths that only exist in the dev build, causing silent failures when plugins were bundled and loaded at runtime.

### Phase Completion

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Inventory existing plugin access patterns | Done |
| 1 | Public SDK surface + host adapter + global bootstrap | Done |
| 2 | Migrate templates and sample plugins to `@mvmnt/plugin-sdk` | Partially done |
| 3 | Migrate default scene elements as reference implementations | Partially done |
| 4 | Documentation (`docs/plugin-api-v1.md`) | Done |
| 5 | Lint/CI enforcement to prevent regression | Not started |

### What Was Built

**`src/core/scene/plugins/plugin-sdk.ts`** — The public SDK surface. A single file that re-exports a curated, intentionally narrow set of types and functions. External plugins import from `@mvmnt/plugin-sdk`; this alias resolves to this file at compile time (via `tsconfig.json` paths) and at runtime (via `PLUGIN_RUNTIME_MODULES` in the plugin loader).

Exports cover:
- Base element class (`SceneElement`) and property helpers (`asNumber`, `asBoolean`, etc.)
- All render object types (`Rectangle`, `Text`, `Line`, `Image`, etc.)
- Plugin host API types, constants, and access functions (`getPluginHostApi`, `PluginHostApiStatus`, `PLUGIN_CAPABILITIES`)
- Error classes (`PluginApiError`, `MissingHostError`, `UnsupportedCapabilityError`, etc.)
- Shorthand helpers (`selectNotes`, `sampleAudio`, `timeToBeats`, `noteName`, etc.)
- Direct capability imports (`timelineApi`, `audioApi`, `timingApi`, `utilitiesApi`)
- Audio feature metadata registration (`registerFeatureRequirements`)

**`docs/plugin-api-v1.md`** — The canonical contract. Documents `globalThis.MVMNT.plugins`, API version `1.0.0`, all four capabilities, all access patterns (status-based, exception-based, direct capability imports, shorthand helpers), capability discovery, error hooks, and the compatibility policy.

**Legacy compat warnings** — The plugin loader emits a `console.warn` at runtime when a loaded bundle calls `require('@core/…')`, `require('@audio/…')`, or `require('@utils/…')`, pointing developers toward `@mvmnt/plugin-sdk`.

**Four templates** (`_templates/basic-shape.ts`, `text-display.ts`, `audio-reactive.ts`, `midi-notes.ts`) — All fully migrated to `@mvmnt/plugin-sdk`.

---

## Migration Status: Default Elements

The default scene elements serve a dual purpose: they are functional app elements and they are meant to be "Phase 3 reference implementations" showing plugin authors how to use the public API. Most are only partially migrated.

### Audio Display Elements

All four switch to the plugin API for data access and now import `getPluginHostApi` and `PLUGIN_CAPABILITIES` from `@mvmnt/plugin-sdk`. They retain legacy fallback paths for when the host API is unavailable.

| Element | Plugin API import source | Legacy fallback |
|---------|--------------------------|-----------------|
| `audio-spectrum.ts` | `@mvmnt/plugin-sdk` ✓ | `getFeatureData` from `@audio/features/sceneApi` |
| `audio-volume-meter.ts` | `@mvmnt/plugin-sdk` ✓ | `getFeatureData` from `@audio/features/sceneApi` |
| `audio-locked-oscilloscope.ts` | `@mvmnt/plugin-sdk` ✓ | `sampleFeatureFrame` from `@audio/audioFeatureUtils` |
| `audio-waveform.ts` | `@core/scene/plugins/host-api/…` (internal) | Deep: `@state/selectors/audioFeatureSelectors` + `getSharedTimingManager` + `useTimelineStore.getState()` |

The legacy fallbacks make sense for internal elements (they will always run in-process) but undermine the reference implementation goal.

### MIDI Display Elements

| Element | Status | Notes |
|---------|--------|-------|
| `notes-played-tracker.ts` | Migrated ✓ | Uses `@mvmnt/plugin-sdk` |
| `moving-notes-piano-roll.ts` | Migrated ✓ | Uses `@mvmnt/plugin-sdk` |
| `time-unit-piano-roll.ts` | Partial | Uses internal `@core/scene/plugins/host-api/…`, also retains a `MidiManager` instance |
| `chord-estimate-display.ts` | Migrated ✓ | Uses `getPluginHostApi` from `@mvmnt/plugin-sdk`; graceful-empty on missing API |
| `notes-playing-display.ts` | Migrated ✓ | Uses `getPluginHostApi` from `@mvmnt/plugin-sdk`; graceful-empty on missing API |

---

## Migration Status: Sample Plugins

Two sample plugin directories exist under `src/plugins/`.

**`myplugin/`** (5 files) — Uses legacy `@core/scene/elements/base`, `@core/render/render-objects`, `@core/types`, and `@core/scene/plugins` imports throughout. Will trigger runtime warnings when loaded as a packaged plugin. Appears to pre-date the SDK migration.

**`myplugin2/`** (2 files) — Fully migrated to `@mvmnt/plugin-sdk`. This is the post-migration reference sample.

---

## Current Issues

### ~~2. Default elements import plugin API internals, not `@mvmnt/plugin-sdk`~~ — Resolved
All partially-migrated elements (`audio-spectrum`, `audio-volume-meter`, `audio-locked-oscilloscope`, `notes-played-tracker`, `moving-notes-piano-roll`) now import `getPluginHostApi` and `PLUGIN_CAPABILITIES` from `@mvmnt/plugin-sdk`. `audio-waveform.ts` is unchanged (lower-priority item).

### 3. `audio-waveform.ts` has the most entangled legacy fallback
Its fallback path reaches directly into `@state/selectors/audioFeatureSelectors`, `getSharedTimingManager`, and `useTimelineStore.getState()`. This is the most internal-state-coupled element and the most work to fully migrate.

**Severity:** Medium complexity. Not urgent unless the element needs to become a true external plugin example.

### ~~4. `chord-estimate-display.ts` and `notes-playing-display.ts` are untouched~~ — Resolved
Both now use `getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead])` and `api.timeline.selectNotesInWindow(…)`. Direct `useTimelineStore`/`@selectors/` imports removed. Graceful-empty degradation when the host API is unavailable.

### 5. `time-unit-piano-roll.ts` retains a `MidiManager` instance
In addition to using internal `@core/…` plugin API paths, this element holds a direct `MidiManager` reference — a deeper coupling that goes beyond just the host API access layer.

**Severity:** Medium. Requires understanding `MidiManager`'s lifecycle before the fallback can be removed.

### ~~6. `FeatureDataResult` type not exported from `@mvmnt/plugin-sdk`~~ — Resolved
Added `export type { FeatureDataResult } from '@audio/features/sceneApi'` to `plugin-sdk.ts`.

### 7. Phase 5 (lint/CI enforcement) not implemented
Nothing in the build pipeline currently prevents:
- A developer re-introducing `@state/` or `@selectors/` imports in plugin-facing code
- A new default element being written with `useTimelineStore` and no plugin API path
- `myplugin/` being updated with more internal imports

The legacy compat warnings only fire at runtime for packaged plugins, not for in-repo code at compile time.

**Severity:** High long-term. Without enforcement, regressions will accumulate silently.

---

## Is the Migration Complete?

**No.** The SDK surface, documentation, and developer-facing tooling (templates, loader warnings) are complete. But the reference implementations (default elements) are all partial at best, and the original sample plugin is unmodified. The migration can be summarised as:

- Infrastructure: complete
- External-facing contract: complete
- Template/sample reference implementations: partially complete (`myplugin2` done, `myplugin` not)
- Default element reference implementations: partially migrated, with two elements fully untouched

---

## Possible Future Issues

**API drift without enforcement.** As new capabilities are added to the host API, there is no automated check that they are also surfaced in `plugin-sdk.ts`. A developer could add a new capability method internally and it would silently not be available to external plugins.

**Version mismatch errors in the wild.** The API versioning (`PLUGIN_API_VERSION = '1.0.0'`) and version check in `getPluginHostApi` will reject plugins that were built against a future version of the SDK. This is intentional and correct behavior, but there is currently no mechanism to indicate which versions a plugin was designed to work with (other than hardcoding version strings). As the API evolves, this will need care.

**`@mvmnt/plugin-sdk` is not a real npm package.** It is resolved entirely through `tsconfig.json` path aliases and the `PLUGIN_RUNTIME_MODULES` runtime map. This is fine while MVMNT is a monorepo with all plugins developed in-tree, but if plugin authors ever want to develop fully outside the repo (without cloning it), they would need either a published npm package or a way to bootstrap the alias externally. This limitation is not currently documented.

**Legacy compat warnings are silent to users.** The warnings fire on `console.warn` in the plugin loader. In a production build they may be suppressed or go unnoticed. There is no user-facing notification when a plugin is using deprecated internal paths.

**`myplugin/` will keep being used as a starting point.** If it is not migrated or removed, developers will discover it and copy its `@core/…` import pattern, creating new plugins that trigger warnings immediately.

---

## Next Steps

**Medium priority:** *(all done)*

**Lower priority:**
6. Investigate and remove the `MidiManager` instance in `time-unit-piano-roll.ts`.
7. Fully migrate `audio-waveform.ts` — this is the most complex legacy fallback and should be done carefully.
8. Consider documenting the "no real npm package" limitation in `docs/plugin-api-v1.md` under the compatibility or distribution section.
9. Introduce an automated check (or at minimum a documented process) to ensure new host API capabilities are also added to `plugin-sdk.ts`.
