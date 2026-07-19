# Plugin / Scene Element System

This directory implements host runtime adapters for the public `packages/plugin-sdk` contract. SDK 2 definitions use callback-scoped contexts; SDK 1 classes and global accessors are compatibility-only.

## Key Files

| File                              | Role                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `plugin-sdk.ts`                   | Host runtime barrel used for injected modules and the frozen v1 compatibility map. |
| `sdk/`                            | **Domain submodules.** Each file is independently importable via `@mvmnt/plugin-sdk/<domain>`.                        |
| `sdk/animation.ts`                | `clamp`, `lerp`, `invLerp`, `remap`, `FloatCurve`, `EasingFn`, `easings` (31 named functions).                        |
| `sdk/render.ts`                   | All canvas render primitives (`Rectangle`, `Text`, `Arc`, `BezierPath`, …).                                           |
| `sdk/scene.ts`                    | `SceneElement`, property descriptors, `prop` factory, `insertElementConfig`.                                          |
| `sdk/api.ts`                      | `PLUGIN_CAPABILITIES`, `getPluginHostApi`, `getRequiredPluginApi`, error classes.                                     |
| `sdk/timeline.ts`                 | `timelineApi` proxy, timeline shortcuts, event types.                                                                 |
| `sdk/audio.ts`                    | `audioApi` proxy, audio shortcuts, feature types, `registerFeatureRequirements`.                                      |
| `sdk/timing.ts`                   | `timingApi` proxy, timing shortcuts, quantize helpers, tempo utils.                                                   |
| `sdk/safety.ts`                   | `withRenderSafety`, `limitRenderObjects`, `checkCapability`.                                                          |
| `sdk/utils.ts`                    | MIDI utils, color helpers, font loader, `loadBundledAsset`.                                                           |
| `host-api/plugin-api.ts`          | Defines `PLUGIN_CAPABILITIES`, all host API interfaces, and `createPluginHostApi()` / `installPluginHostApi()`.       |
| `host-api/get-plugin-host-api.ts` | Runtime accessor used by the SDK; resolves the host API from `globalThis.MVMNT.plugins`.                              |
| `plugin-sdk-capabilities.ts`      | Direct capability proxy objects (`timelineApi`, `audioApi`, `timingApi`, `utilitiesApi`).                             |
| `plugin-sdk-shortcuts.ts`         | Shorthand helpers (`selectNotes`, `sampleAudio`, `timeToBeats`, `noteName`, …).                                       |
| `plugin-safety.ts`                | `withRenderSafety`, `limitRenderObjects`, `checkCapability`, and related safety utilities.                            |
| `plugin-loader.ts`                | Runtime plugin loader; emits warnings for legacy `@core/` requires.                                                   |
| `legacy-callback-renderer.ts`     | Host-owned migration facade for class-oriented renderers; never duplicate this behavior in the public SDK package.   |
| `version-check.ts`                | Semver compatibility check between plugin and host API versions.                                                      |

## Capabilities

Six capabilities are defined in `PLUGIN_CAPABILITIES` (in `host-api/plugin-api.ts`):

- `timelineRead` — timeline / note data (conditionally available)
- `audioFeaturesRead` — audio feature sampling (conditionally available)
- `audioRawRead` — sample-accurate raw audio data (conditionally available)
- `timingConversion` — seconds ↔ beats ↔ ticks (always available)
- `midiUtils` — MIDI note utilities (always available)
- `audioCalculatorsRegister` — register custom audio calculators (always available)

See `docs/plugin-capabilities.md` and `docs/plugin-lifecycle.md` for SDK 2. `docs/plugin-api-v1.md` is the compatibility reference.

## SDK 2 access pattern

```typescript
import { definePluginElement } from '@mvmnt/plugin-sdk';

export const element = definePluginElement({
    type: 'example',
    metadata: { name: 'Example' },
    schema: { tabs: [] },
    capabilities: { required: ['timeline.read'], optional: [] },
    render(_props, _state, _time, context) {
        const notes = context.timeline.selectNotes({ startSeconds: 0, endSeconds: 1 });
        return notes.ok ? [] : [];
    },
});
```

Manifest and definition capability declarations must match. Required facets are guaranteed after loader validation; optional facets may be absent.

## Adding a New Capability (checklist)

1. Add key to `PLUGIN_CAPABILITIES` in `host-api/plugin-api.ts`
2. Add the interface and method definitions in `host-api/plugin-api.ts`
3. Implement in `createPluginHostApi()` in `host-api/plugin-api.ts`
4. Create a proxy via `createCapabilityProxy()` in `plugin-sdk-capabilities.ts`
5. Export the proxy and any new types from the relevant `sdk/*.ts` submodule — `plugin-sdk.ts` re-exports everything via `export * from './sdk/...'`.

**Important:** `plugin-sdk.ts` contains a compile-time assertion (`_AssertCapabilityExports`) that will cause a TypeScript error if step 5 is skipped. The drift test suite (`__tests__/api-drift.test.ts`) also validates this at test time.

## Tests

All tests live in `__tests__/`:

- `api-drift.test.ts` – Verifies all capabilities are exported from `plugin-sdk.ts` and access patterns work.
- `get-plugin-host-api.test.ts` – Resolution logic (missing host, version mismatch, missing capabilities).
- `plugin-api.test.ts` – Host API factory and capability behavior.
- `plugin-safety.test.ts` – Safety wrapper and render object limits.
- `version-check.test.ts` – Semver range logic.
- `sdk-boundary-drift.test.ts` – Verifies shared helpers have one implementation and migration behavior stays host-owned.

Run: `npm run test` (Vitest).
