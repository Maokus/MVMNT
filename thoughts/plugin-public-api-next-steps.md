## Plugin Public API — Current State Analysis

### What's In Place

**4 capabilities**, all wired end-to-end:

| Key | String | Available |
|---|---|---|
| `timelineRead` | `timeline.read` | Conditional (store + selectors) |
| `audioFeaturesRead` | `audio.features.read` | Conditional (`getFeatureData`) |
| `timingConversion` | `timing.conversion` | Always |
| `midiUtils` | `midi.utils` | Always |

**3+1 access patterns** all functional:
- Status-based (`{ api, status } = getPluginHostApi(...)`)
- Exception-based (`throwOnError: true`)
- Direct proxies (`timelineApi.selectNotesInWindow(...)`)
- Shorthand helpers (`selectNotes(...)`)

**Compile-time drift assertion** — just added; TypeScript will fail if a capability is added to `PLUGIN_CAPABILITIES` without being exported from the SDK.

**`myplugin/` is already gone** — only `myplugin2/` remains, fully migrated. The state doc's note about it being unmigrated is stale.

---

### Current Issues (Prioritised)

#### High — Missing SDK Type Exports

Three types used in SDK functions are not exported from `@mvmnt/plugin-sdk`:

1. **`TimelineNoteEvent`** — the return type of `selectNotes()` / `selectNotesInWindow()`. Plugin authors can't refer to notes by type.
2. **`FeatureInput`** — the parameter type for `sampleAudio()`, `sampleAudioRange()`. Currently an implicit `any` at the callsite.
3. **`AudioFeatureRangeSample`** — internal type from `@state/selectors/audioFeatureSelectors`, used inside `audio-waveform.ts`. Not surfaceable to plugin authors writing comparable elements.

The first two affect anyone using the shortcuts or status-based pattern and wanting typed code. Fix: add `export type { TimelineNoteEvent }` and `export type { FeatureInput }` to `plugin-sdk.ts`.

#### Medium — Audio Elements Still Have Dual-Path Code

`audio-spectrum.ts` and `audio-volume-meter.ts` both have a ternary that tries the plugin API and falls back to `getFeatureData()`. This is fine for internal elements (always in-process), but it means these are not clean reference implementations. A plugin author copying either file drags in dead `@audio/` fallback code that will silently not work in a packaged context.

`audio-waveform.ts` has a surviving `import type { AudioFeatureRangeSample } from '@state/selectors/audioFeatureSelectors'` — the runtime fallback is gone, but this internal type is still referenced in helper function signatures.

#### Medium — Safety Helpers Not In SDK

`plugin-safety.ts` exports `withRenderSafety`, `limitRenderObjects`, `checkCapability`, `DEFAULT_SAFETY_CONFIG` through the internal barrel (`src/core/scene/plugins/index.ts`) but not through `plugin-sdk.ts`. Plugin authors writing render-heavy elements can't use these guards; they'd have to re-implement them or go unprotected.

#### Medium — `time-display.ts` Unmigrated

`src/core/scene/elements/misc/time-display.ts` uses `useTimelineStore` directly. It's outside the audio/MIDI migration scope but is part of the default element set, so it's an inconsistency in the "all default elements migrated" claim.

#### Low — No CI Enforcement at All

No `.github/workflows/` or CI config exists. Phase 5 remains not started. The compile-time type assertion prevents capability drift, but nothing prevents:
- A new in-repo plugin importing `@core/` or `@audio/` directly
- A new default element using `useTimelineStore` without a plugin API path

The runtime compat warnings in `plugin-loader.ts` only fire for packaged plugins, not in-repo code during development.

#### Low — `FeatureDataResult` Exported But `FeatureInput` Isn't

These two types travel together in `sampleAudio()` calls — one is exported, one isn't. Asymmetric and confusing.

#### Low — Stale Comments in `plugin-loader.ts`

Lines 27–34 are commented-out legacy `@core/` module bindings, left as history. Below them, the fallback for legacy `@core/` requires attempts a fragile `globalThis.MVMNT.core...` lookup that will silently fail at runtime unless those globals are separately populated.

---

### Summary of Next Steps

| Priority | Action | Files |
|---|---|---|
| High | Export `TimelineNoteEvent` and `FeatureInput` from `plugin-sdk.ts` | `plugin-sdk.ts`, `plugin-sdk-shortcuts.ts` |
| Medium | Export safety helpers (`withRenderSafety` etc.) from `plugin-sdk.ts` | `plugin-sdk.ts`, `plugin-safety.ts` |
| Medium | Decide: clean up `audio-spectrum.ts` / `audio-volume-meter.ts` dual-path (or explicitly document it's intentional) | both files |
| Medium | Migrate or explicitly exclude `time-display.ts` | `time-display.ts` |
| Low | Document the "no real npm package" limitation in `docs/plugin-api-v1.md` | `plugin-api-v1.md` |
| Low | Introduce an import-restriction lint rule for `src/plugins/` (no `@core/`, `@audio/`, `@state/`) | new eslint rule or config |
| Low | Remove or annotate the dead commented-out module bindings in `plugin-loader.ts` | `plugin-loader.ts` |

The most immediately impactful change is exporting `TimelineNoteEvent` and `FeatureInput` — they're already in the codebase, they're already used by the SDK functions, and their absence means plugin authors get `any` return/parameter types on the most common operations.