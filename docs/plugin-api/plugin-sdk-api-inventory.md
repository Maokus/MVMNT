# Plugin SDK 2 API inventory

This inventory is generated conceptually from `packages/plugin-sdk/sdk-manifest.json`, the
machine-readable source used by loader and builder parity tests.

| Import | Runtime exports |
| --- | --- |
| `@mvmnt-app/plugin-sdk` | definitions, schema builders, callback renderer state, diagnostics/results, animation, render, font, and media-playback helpers |
| `/api` | version, capability names, `PluginContractError`, `ok`, `err` |
| `/animation` | `clamp`, `lerp`, `invLerp`, `remap`, `easings`, `FloatCurve` |
| `/audio` | audio DTO types and standalone adapters for every `AudioApi`/calculator operation |
| `/render` | host-injected render primitives |
| `/scene` | definitions, lifecycle/context types, property DTO builders, callback-owned renderer state |
| `/safety` | `checkCapability`, `limitRenderObjects` |
| `/timeline` | timeline DTO types and standalone adapters for every `TimelineApi` operation |
| `/timing` | timing facet types and standalone adapters for every conversion operation |
| `/utils` | MIDI, colour, and font helpers |
| `/visual-assets` | scoped asset handles/types, adapters for every asset operation, and `VisualMediaPlayback` |

The standalone adapters take the corresponding callback facet as their first argument. For
example, `selectTimelineNotes(context.timeline!, args)` has the same typed `Result` behaviour as
`context.timeline!.selectNotes(args)`. This keeps capability grants local to the callback while
making every SDK operation available as a named import from both its subpath and the root barrel.

Published declaration files are checked to contain no `@core`, `@state`, `@audio`, or Zustand
types. Host-dependent JavaScript is an explicit outside-host stub; MVMNT replaces each runtime
module when evaluating a plugin bundle.
