# Plugin SDK reference

## Package and version

The public package is `@mvmnt-app/plugin-sdk`. MVMNT currently targets the pre-release SDK `2.2.0`
contract and accepts compatible SDK 2 ranges in `plugin.json`.

The machine-readable [SDK manifest](../../packages/plugin-sdk/sdk-manifest.json) is the canonical
list of package subpaths, injected runtime modules, capability identifiers, and JavaScript exports.
TypeScript declarations built from `packages/plugin-sdk/src/` are the detailed type reference.

## Import paths

| Path             | Purpose                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| package root     | Common definition, schema, result, animation, safety, MIDI, colour, and font helpers. |
| `/api`           | SDK version, capabilities, structured results, and contract errors.                   |
| `/animation`     | Interpolation, easing, remapping, and `FloatCurve`.                                   |
| `/audio`         | Audio request, sample, matrix, raw-read, and calculator types.                        |
| `/render`        | Host-injected render-object constructors.                                             |
| `/scene`         | Definitions, lifecycle contexts, schemas, and builders.                               |
| `/safety`        | Capability and render-object safety helpers.                                          |
| `/timeline`      | Timeline and MIDI snapshot types.                                                     |
| `/timing`        | Timing conversion facet types.                                                        |
| `/utils`         | MIDI, colour, and font helpers.                                                       |
| `/visual-assets` | Scoped asset types and `VisualMediaPlayback`.                                         |

`RenderInput<Props, Resources, State>` supplies named `props`, `time`, `context`, `resources`, and
`simulation` fields. Stateless elements receive `simulation: undefined`; opted-in elements receive
a read-only `SimulationSnapshot<State>`.
`createResources(context)` optionally allocates resources, inferred from its return value, and
`disposeResources(resources, context)` synchronously releases plugin-owned allocations. Both use
`ResourceContext`, also used by definition-level `load` and `unload`. It exposes allocation,
diagnostics, cancellation, and synchronous cleanup registration, but no timeline/property/audio reads.
`ElementContext<Props>` supplies those reads to rendering. These types are exported from the root
and `/scene`. Use [instance resources](instance-state.md) for allocations and deterministic caches,
and [simulation](simulation.md) only for host-stepped temporal state.

Host-dependent JavaScript outside MVMNT throws an explicit error. Plugin bundles must externalize
SDK imports so the loader can inject the matching runtime.

## Manifest

`plugin.json` requires `id`, `name`, semantic `version`, SDK `apiVersion`, and at least one element.
Each SDK 2 element requires a lowercase kebab-case `type`, a safe relative `.ts` or `.js` entry, and
unique `required` and `optional` capability lists. Optional metadata includes description, author,
homepage, license, and plugin peer dependencies.

The generator and `packages/plugin-tools/src/contract.mjs` define the authoring validation contract.
The host repeats security-relevant checks in `src/core/scene/plugins/plugin-contract.ts` and validates
all archive paths before evaluation.

## Runtime type registration

Loaded element types are namespaced as `<plugin-id>:<element-type>`. The loader validates the
manifest and SDK range, evaluates each CommonJS entry with injected modules, registers successful
definitions, and persists imported archives in IndexedDB. Development archives remain session-only.

Applications should use the plugin store and loader UI rather than calling registry internals.

## Changelog

See the canonical [SDK changelog](../../packages/plugin-sdk/CHANGELOG.md).
