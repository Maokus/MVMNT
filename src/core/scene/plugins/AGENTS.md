# Plugin / Scene Element System

This directory implements host runtime adapters for the public `packages/plugin-sdk` contract. SDK 2 definitions use callback-scoped contexts; global SDK accessors are not supported.

## Key Files

| File                     | Role                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `sdk/render.ts`          | Host render-object implementation injected for the public SDK render module.                      |
| `host-api/plugin-api.ts` | Defines `PLUGIN_CAPABILITIES`, private host service interfaces, and `createPluginHostServices()`. |
| `plugin-safety.ts`       | `withRenderSafety`, `limitRenderObjects`, `checkCapability`, and related safety utilities.        |
| `plugin-loader.ts`       | Runtime plugin loader; emits warnings for legacy `@core/` requires.                               |
| `version-check.ts`       | Semver compatibility check between plugin and host API versions.                                  |

## Capabilities

Six capabilities are defined in `PLUGIN_CAPABILITIES` (in `host-api/plugin-api.ts`):

- `timelineRead` — timeline / note data (conditionally available)
- `audioFeaturesRead` — audio feature sampling (conditionally available)
- `audioRawRead` — sample-accurate raw audio data (conditionally available)
- `timingConversion` — seconds ↔ beats ↔ ticks (always available)
- `midiUtils` — MIDI note utilities (always available)
- `audioCalculatorsRegister` — register custom audio calculators (always available)

See `docs/plugin-capabilities.md` and `docs/plugin-lifecycle.md` for SDK 2.

## SDK 2 access pattern

```typescript
import { definePluginElement } from '@mvmnt-app/plugin-sdk';

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
3. Implement it in `createPluginHostServices()` in `host-api/plugin-api.ts`.
4. Add the package-owned callback facet type and named adapter in `packages/plugin-sdk/src/`.
5. Add the export to `packages/plugin-sdk/sdk-manifest.json`; the contract parity test checks the package and injected runtime together.

## Tests

All tests live in `__tests__/`:

- `plugin-contract-v2.test.ts` – Verifies package, manifest, and injected runtime export parity.
- `plugin-api.test.ts` – Private host-service factory and capability behavior.
- `plugin-safety.test.ts` – Safety wrapper and render object limits.
- `version-check.test.ts` – Semver range logic.
- `sdk-boundary-drift.test.ts` – Verifies shared helpers have one implementation.

Run: `npm run test` (Vitest).
