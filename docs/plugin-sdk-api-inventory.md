# Plugin SDK 2 API inventory

This inventory is generated conceptually from `packages/plugin-sdk/sdk-manifest.json`, the
machine-readable source used by loader and builder parity tests.

| Import | Runtime exports |
| --- | --- |
| `@mvmnt/plugin-sdk` | `definePluginElement`, diagnostics/results, animation and render helpers |
| `/api` | version, capability names, `PluginContractError`, `ok`, `err` |
| `/animation` | `clamp`, `lerp`, `invLerp`, `remap`, `easings` |
| `/audio` | callback-facet and audio DTO types |
| `/render` | host-injected render primitives |
| `/scene` | definition, lifecycle, capability-context types |
| `/safety` | `checkCapability`, `limitRenderObjects` |
| `/timeline` | timeline DTO and callback-facet types |
| `/timing` | timing callback-facet types |
| `/utils` | MIDI and colour pure helpers |
| `/visual-assets` | scoped asset handle and API types |

Published declaration files are checked to contain no `@core`, `@state`, `@audio`, or Zustand
types. Host-dependent JavaScript is an explicit outside-host stub; MVMNT replaces each runtime
module when evaluating a plugin bundle.
