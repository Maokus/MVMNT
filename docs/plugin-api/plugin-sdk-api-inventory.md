# Plugin SDK 2 API inventory

This inventory is generated conceptually from `packages/plugin-sdk/sdk-manifest.json`, the
machine-readable source used by loader and builder parity tests.

| Import                  | Runtime exports                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@mvmnt-app/plugin-sdk` | definitions, schema builders, diagnostics/results, animation, safety, MIDI, colour, and font helpers          |
| `/api`                  | version, capability names, `PluginContractError`, `ok`, `err`                                                 |
| `/animation`            | `clamp`, `lerp`, `invLerp`, `remap`, `easings`, `FloatCurve`                                                  |
| `/audio`                | audio API, feature, matrix, raw-sample, and calculator types                                                  |
| `/render`               | host-injected render primitives                                                                               |
| `/scene`                | definitions, lifecycle/context types, instance property sampling, and `prop`, `group`, and `tab` DTO builders |
| `/safety`               | `checkCapability`, `limitRenderObjects`                                                                       |
| `/timeline`             | timeline API and MIDI event/track DTO types                                                                   |
| `/timing`               | timing facet types                                                                                            |
| `/utils`                | MIDI, colour, and font helpers                                                                                |
| `/visual-assets`        | scoped asset handles/types and `VisualMediaPlayback`                                                          |

Host services are called through callback context methods, for example
`context.timeline!.selectNotes(args)`. This keeps capability grants and lifecycle ownership local
to the callback. Domain subpaths provide advanced types without adding a second name for every operation.

Published declaration files are checked to contain no `@core`, `@state`, `@audio`, or Zustand
types. Host-dependent JavaScript is an explicit outside-host stub; MVMNT replaces each runtime
module when evaluating a plugin bundle.

Instance callbacks receive `context.properties`. Its `valueAt()` method samples any declared property in timeline
seconds, and its numeric-only `integrate()` and `average()` methods operate over ordered seconds ranges. These
methods resolve effective values without exposing the host's binding or automation representation.
