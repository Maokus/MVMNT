# Plugin / Scene Element System

This directory implements host runtime adapters for the public `packages/plugin-sdk` contract. SDK 2 definitions use callback-scoped contexts; global SDK accessors are not supported.

## Pre-release SDK rule

SDK 2 is not released yet. Prefer one clean current contract over shims for earlier SDK 2 designs. When changing it,
update the SDK package, host adapter, manifest, documentation, and contract-parity tests together. Existing scene
migrations remain supported independently of SDK evolution.

## Key Files

| File                               | Role                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `sdk/render.ts`                    | Host render-object implementation injected for the public SDK render module.                      |
| `host-api/plugin-api.ts`           | Defines `PLUGIN_CAPABILITIES`, private host service interfaces, and `createPluginHostServices()`. |
| `plugin-safety.ts`                 | `withRenderSafety`, `limitRenderObjects`, `checkCapability`, and related safety utilities.        |
| `plugin-loader.ts`                 | Bundle loader that turns SDK definitions into normalized runtime registrations.                   |
| `../runtime/definition-runtime.ts` | Shared SDK definition lifecycle and instance adapter used by built-ins and plugins.               |
| `version-check.ts`                 | Semver compatibility check between plugin and host API versions.                                  |

## Capabilities

Six capabilities are defined in `PLUGIN_CAPABILITIES` (in `host-api/plugin-api.ts`):

- `timelineRead` — timeline / note data (conditionally available)
- `audioFeaturesRead` — audio feature sampling (conditionally available)
- `audioRawRead` — sample-accurate raw audio data (conditionally available)
- `timingConversion` — seconds ↔ beats ↔ ticks (always available)
- `midiUtils` — MIDI note utilities (always available)
- `audioCalculatorsRegister` — register custom audio calculators (always available)

See `docs/plugin-api/authoring.md` and `docs/plugin-api/reference.md` for SDK 2.

## SDK 2 access pattern

```typescript
import { definePluginElement } from '@mvmnt-app/plugin-sdk';

export const element = definePluginElement({
    type: 'example',
    metadata: { name: 'Example' },
    schema: { tabs: [] },
    render({ context }) {
        const notes = context.timeline.selectNotes({ startSeconds: 0, endSeconds: 1 });
        return notes.ok ? [] : [];
    },
});
```

Declare capabilities once in `plugin.json`. The loader supplies those host-authoritative grants to the definition scope. Required facets are guaranteed after loader validation; optional facets may be absent.

## Adding a New Capability (checklist)

1. Add key to `PLUGIN_CAPABILITIES` in `host-api/plugin-api.ts`
2. Add the interface and method definitions in `host-api/plugin-api.ts`
3. Implement it in `createPluginHostServices()` in `host-api/plugin-api.ts`.
4. Add the package-owned callback facet type in `packages/plugin-sdk/src/`.
5. Add the export to `packages/plugin-sdk/sdk-manifest.json`; the contract parity test checks the package and injected runtime together.

## Tests

All tests live in `__tests__/`:

- `plugin-contract-v2.test.ts` – Verifies package, manifest, and injected runtime export parity.
- `plugin-api.test.ts` – Private host-service factory and capability behavior.
- `plugin-safety.test.ts` – Safety wrapper and render object limits.
- `version-check.test.ts` – Semver range logic.
- `sdk-boundary-drift.test.ts` – Verifies shared helpers have one implementation.

Run: `npm run test` (Vitest).
