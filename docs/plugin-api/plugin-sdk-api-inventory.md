# Plugin SDK 2 API inventory

This inventory is generated conceptually from `packages/plugin-sdk/sdk-manifest.json`, the
machine-readable source used by loader and builder parity tests.

| Import | Runtime exports |
| --- | --- |
| `@mvmnt-app/plugin-sdk` | definitions, schema builders, callback renderer state, diagnostics/results, animation, render, font, and media-playback helpers |
| `/api` | version, capability names, `PluginContractError`, `ok`, `err` |
| `/animation` | `clamp`, `lerp`, `invLerp`, `remap`, `easings`, `FloatCurve` |
| `/audio` | callback-facet and audio DTO types |
| `/render` | host-injected render primitives |
| `/scene` | definitions, lifecycle/context types, property DTO builders, callback-owned renderer state |
| `/safety` | `checkCapability`, `limitRenderObjects` |
| `/timeline` | timeline DTO and callback-facet types |
| `/timing` | timing callback-facet types |
| `/utils` | MIDI, colour, and font helpers |
| `/visual-assets` | scoped asset handles/types and `VisualMediaPlayback` |

Published declaration files are checked to contain no `@core`, `@state`, `@audio`, or Zustand
types. Host-dependent JavaScript is an explicit outside-host stub; MVMNT replaces each runtime
module when evaluating a plugin bundle.
