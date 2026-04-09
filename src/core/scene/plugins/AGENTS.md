# Plugin / Scene Element System

This directory implements the plugin host API and the public `@mvmnt/plugin-sdk` surface that scene elements and external plugins consume.

## Key Files

| File | Role |
|------|------|
| `plugin-sdk.ts` | **Single public SDK surface.** All exports available to plugin authors via `@mvmnt/plugin-sdk`. |
| `host-api/plugin-api.ts` | Defines `PLUGIN_CAPABILITIES`, all host API interfaces, and `createPluginHostApi()` / `installPluginHostApi()`. |
| `host-api/get-plugin-host-api.ts` | Runtime accessor used by the SDK; resolves the host API from `globalThis.MVMNT.plugins`. |
| `plugin-sdk-capabilities.ts` | Direct capability proxy objects (`timelineApi`, `audioApi`, `timingApi`, `utilitiesApi`). |
| `plugin-sdk-shortcuts.ts` | Shorthand helpers (`selectNotes`, `sampleAudio`, `timeToBeats`, `noteName`, …). |
| `plugin-safety.ts` | `withRenderSafety`, `limitRenderObjects`, `checkCapability`, and related safety utilities. |
| `plugin-loader.ts` | Runtime plugin loader; emits warnings for legacy `@core/` requires. |
| `version-check.ts` | Semver compatibility check between plugin and host API versions. |

## Capabilities

Four capabilities are defined in `PLUGIN_CAPABILITIES` (in `host-api/plugin-api.ts`):

- `timelineRead` — timeline / note data (conditionally available)
- `audioFeaturesRead` — audio feature sampling (conditionally available)
- `timingConversion` — seconds ↔ beats ↔ ticks (always available)
- `midiUtils` — MIDI note utilities (always available)

See `docs/plugin-api-v1.md` for the full API surface, access patterns, and error handling reference.

## Standard Access Pattern (scene elements)

```typescript
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';

const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
if (api && status === 'ok') {
    const notes = api.timeline.selectNotesInWindow({ trackIds: [...], startSec, endSec });
}
```

## Adding a New Capability (checklist)

1. Add key to `PLUGIN_CAPABILITIES` in `host-api/plugin-api.ts`
2. Add the interface and method definitions in `host-api/plugin-api.ts`
3. Implement in `createPluginHostApi()` in `host-api/plugin-api.ts`
4. Create a proxy via `createCapabilityProxy()` in `plugin-sdk-capabilities.ts`
5. Export the proxy and any new types from `plugin-sdk.ts`

**Important:** `plugin-sdk.ts` contains a compile-time assertion (`_AssertCapabilityExports`) that will cause a TypeScript error if step 5 is skipped. The drift test suite (`__tests__/api-drift.test.ts`) also validates this at test time.

## Tests

All tests live in `__tests__/`:

- `api-drift.test.ts` – Verifies all capabilities are exported from `plugin-sdk.ts` and access patterns work.
- `get-plugin-host-api.test.ts` – Resolution logic (missing host, version mismatch, missing capabilities).
- `plugin-api.test.ts` – Host API factory and capability behavior.
- `plugin-safety.test.ts` – Safety wrapper and render object limits.
- `version-check.test.ts` – Semver range logic.

Run: `npm run test` (Vitest).
