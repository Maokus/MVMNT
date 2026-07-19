# Plugin SDK v1 removal roadmap

_Status: active. Initial audit and migration follow-up performed 19 July 2026._

## Migration follow-up

The template and registered-element pass has now changed the baseline described below:

- All nine files in `src/core/scene/elements/_templates` export SDK 2 definitions and a CI test
  rejects template source that reintroduces `SceneElement`, v1 host accessors, or prop factories.
- All 18 default registry IDs are backed by canonical definitions, and
  `registerDefaultElements()` now registers definitions rather than classes.
- Background, basic shapes, image, progress, text, time, debug, note count, notes playing, and
  CC monitor are callback-native implementations.
- Chord estimate, both piano rolls, spectrum, volume meter, waveform, peaks, and locked
  oscilloscope currently use `defineHostAdaptedBuiltIn()`. These are deliberately visible
  migration debt: the definitions own lifecycle and registry entry, but their render callback
  still delegates to an engine-private class while controllers/cached-feature plumbing are
  extracted. They do **not** satisfy the final v1 removal gate.
- Scoped SDK 2 visual asset handles, callback viewport/playback metadata, raw-schema property
  resolution, base-schema merging, and synchronous first-party initialization were added to
  support these conversions.
- The migration inventory test covers all templates and all 18 registered definitions.

Current registered-element debt is therefore eight host adapters, not 18 class-registered
built-ins. `misc/missing-plugin.ts` also remains an engine fallback outside the default registry.
Repository plugins, examples, dormant audio-debug elements, distributable archives, and the SDK
2 host bridge remain as described in the original audit below.

## Verified migration state

The original audit below is retained as the starting snapshot. The repository has **not**
completed the SDK 2 element migration. The SDK 2 package, loader,
capability contexts, lifecycle scopes, and external fixture exist, but most element clients still
compile against the class-based v1 surface.

The audit counts only non-test TypeScript files that export an element class or call
`definePluginElement()`. Helper classes and test harnesses are excluded.

| Area | V1 class files | SDK 2 definition files | Manifest state |
| --- | ---: | ---: | --- |
| First-party elements and templates | 32 | 1 | Built-ins have no plugin manifest |
| `src/pluginexamples` | 9 | 0 | 3 manifests, 9 elements, all `^1.0.0` |
| `src/plugins` | 9 | 1 | 6 v1 manifests with 9 elements; 1 v2 manifest with 1 element |
| **Total** | **50** | **2** | **18 v1 manifest elements; 1 v2 manifest element** |

Additional findings:

- All 18 elements registered by `SceneElementRegistry.registerDefaultElements()` are class-based.
- Eight of nine template sources are class-based. Only `_templates/minimal.ts` uses SDK 2.
- Twenty-nine element files still call a v1 accessor or shortcut such as `getPluginHostApi()`,
  `getRequiredPluginApi()`, or `sampleAudio()`.
- Module-scope audio feature registration remains in first-party and plugin sources.
- All 16 checked-in `.mvmnt-plugin` archives under `dist/` declare `^1.0.0` or `^1.1.0`.
- The SDK 2 runtime adapter still resolves the internal v1 `PluginHostApi`. Removing the v1
  globals before replacing that bridge would also break v2 plugins.

The two verified SDK 2 clients are:

- `src/core/scene/elements/_templates/minimal.ts`
- `src/plugins/testplugin/my-first-element.ts`

The remaining source manifests on v1 are:

- `src/pluginexamples/fnf/plugin.json`
- `src/pluginexamples/midipack1/plugin.json`
- `src/pluginexamples/patternspack1/plugin.json`
- `src/plugins/audiopack1/plugin.json`
- `src/plugins/boinker/plugin.json`
- `src/plugins/circleoffifths/plugin.json`
- `src/plugins/ebwub/plugin.json`
- `src/plugins/midipack2/plugin.json`
- `src/plugins/pixelperfect/plugin.json`

## Removal principle

V1 removal is safe only when SDK 2 no longer depends on v1 internally and every shipped client
has an SDK 2 replacement. Version warnings alone are not a removal gate. Behavioural parity must
be demonstrated for rendering, property bindings, timeline/audio sampling, assets, lifecycle
cleanup, scene persistence, and export rendering.

## Workstream 1: close SDK 2 contract gaps

Complete these foundations before mechanically converting element files:

1. Replace the `schema: unknown` contract with package-owned property schema DTOs and builders.
   Cover visibility conditions, presets, track references, fonts, and runtime transforms without
   importing application types.
2. Add a readonly per-callback scene/render DTO containing canvas dimensions and other public
   render inputs currently passed through `_buildRenderObjects(config, targetTime)`.
3. Add lifecycle-scoped feature requirement registration. It must replace module-scope
   `registerFeatureRequirements*()` and unsubscribe automatically.
4. Complete scoped visual-asset and font operations needed by image, atlas, GIF, and text
   elements. Do not expose the visual asset registry store.
5. Replace the SDK 2 adapter's call to `getPluginHostApi()` with a private `PluginHostServices`
   dependency supplied directly by the loader. V2 must not traverse `globalThis.MVMNT.plugins`
   or use v1 DTOs internally.
6. Add definition registration directly to the scene element registry. Built-ins should not
   need a synthetic class merely to enter the registry.

Exit gate:

- A package-only fixture can implement one property-heavy, one timeline, one raw-audio, one
  feature-audio, and one bundled-asset element without v1 imports or application aliases.
- Published declarations and runtime export parity tests remain clean.

## Workstream 2: migrate reference clients first

Reference clients define the supported authoring workflow and should move before complex built-ins.

1. ~~Convert the remaining eight files in `src/core/scene/elements/_templates`.~~ Completed.
2. Convert both `patternspack1` elements, then its manifest, as the capability-free example.
3. Convert the two `fnf` and five `midipack1` elements using `timeline.read`.
4. Change all three example manifests to `^2.0.0` with exact required/optional declarations.
5. Compile documentation examples from these same source files.

Exit gate:

- `src/pluginexamples` contains no `SceneElement`, v1 accessor, proxy, shortcut, or
  module-scope registration usage.
- Every example builds with the packed SDK, the production builder, and the dev builder.

## Workstream 3: migrate repository plugins

Migrate one plugin at a time and preserve its rendered output with deterministic snapshot or
geometry tests.

Recommended order:

1. Capability-free renderers: `pixelperfect/ditherator`.
2. Timeline readers: `circleoffifths`, `midipack2`, and
   `pixelperfect/amurulike-pianoroll`.
3. Raw-audio readers: `ebwub`.
4. Feature-audio users and registrations: `boinker` and `audiopack1`.

For each plugin:

- Move registration and resource creation into `load` or `create`.
- Move teardown into `dispose` or `unload` and verify abort handling.
- Replace class/store records with callback props and SDK DTOs.
- Update every manifest element to `^2.0.0` and exact capability lists in the same change.
- Build, package, load, disable, reload, upgrade, and unload the resulting archive.

`src/plugins` is a nested worktree with existing user-owned changes. Audit its status before each
migration and avoid combining unrelated plugin edits.

Exit gate:

- The only v1 plugin source retained in the repository is an immutable compatibility fixture.
- Every repository plugin passes the packed-SDK fixture workflow.

## Workstream 4: migrate first-party registered elements

Migrate by dependency group so common adapters are implemented once.

1. ~~Miscellaneous elements: background, basic shapes, debug, progress, text, time, and image.~~
   Callback-native and definition-registered.
2. Timeline/MIDI elements: CC monitor, note count, and notes playing are callback-native. Chord
   estimate and both piano rolls remain explicit host adapters.
3. Audio elements: spectrum, volume meter, waveform, peaks, and locked oscilloscope are
   definition-registered host adapters; move their feature/raw-audio reads into callback context.
4. Dormant audio-debug elements and the missing-plugin fallback. Either migrate them or formally
   classify and test them as engine-private—not silently leave them on the public v1 SDK.

Each conversion needs parity coverage for:

- default schema values and property bindings;
- render-object geometry and layout participation;
- timeline/audio results at representative times;
- asset and feature cleanup after instance disposal;
- scene save/load and offline export output.

Exit gate:

- `registerDefaultElements()` registers definitions rather than classes.
- No first-party element imports the public v1 SDK. Engine-private adapters live under an
  explicitly internal path and do not appear in package declarations or plugin runtime maps.

## Workstream 5: deal with archives and installed plugins

1. Rebuild current distributable archives from migrated SDK 2 sources.
2. Move at most a minimal representative set of prebuilt v1 bundles to a dedicated compatibility
   fixture directory. Do not leave v1 artifacts looking like current distributables in `dist/`.
3. Add a local installed-plugin inventory showing which plugin IDs still request v1. No plugin
   code or usage telemetry should leave the device.
4. Add an export/backup action and an actionable warning before the removal release.
5. Reject newly built v1 source in the production/dev builders while continuing to load already
   installed v1 bundles during the announced compatibility window.

Exit gate:

- No current distributable archive targets v1.
- The v1 loader test uses only frozen fixtures and proves the warning/backup path.

## Workstream 6: freeze, deprecate, and remove v1

### Freeze gate

- Put all v1 runtime modules in one compatibility directory with an explicit export inventory.
- Prevent additions through an API snapshot test.
- Emit one deduplicated development diagnostic per plugin with direct migration documentation.

### Removal gate

All of the following must be true:

- Repository searches find zero production uses of `getPluginHostApi`, `getRequiredPluginApi`,
  direct capability proxies, silent shortcuts, module-scope feature registration, and public
  `SceneElement` imports.
- Source manifests and current archives contain no `^1.x` API ranges.
- SDK 2 host services have no dependency on the v1 global API or v1 DTOs.
- Registry, builder, dev server, import UI, stored reload, community compatibility checks, and
  documentation all advertise only SDK 2.
- The full tests, build, compile, packed external fixture, hot reload, upgrade, disable, unload,
  persistence, and offline export matrices pass.
- The compatibility policy has announced the removal as a breaking host change.

### Code removal

After the removal gate:

1. Delete the v1 runtime module map and legacy internal-alias resolver.
2. Delete global accessors, proxies, shortcuts, fallback result wrappers, and v1-only error types.
3. Move any still-needed `SceneElement` engine implementation to an application-internal module;
   it must no longer be exported by `@mvmnt/plugin-sdk`.
4. Remove the `1.1.0` host API version constant and v1 range negotiation.
5. Remove v1-only builder warnings, tests, and documentation, retaining one historical migration
   note and the SDK changelog.
6. Regenerate the SDK manifest, API inventory, package exports, and release notes.

## Continuous audit

Turn the current one-off audit into a CI check with an explicit temporary allowlist. The allowlist
must shrink in each migration change and may never grow without API review.

```sh
rg -l "export class .* extends SceneElement" \
  src/core/scene/elements src/pluginexamples src/plugins \
  -g '*.ts' -g '!**/__tests__/**'

rg -l "definePluginElement" \
  src/core/scene/elements src/pluginexamples src/plugins \
  -g '*.ts' -g '!**/__tests__/**'

rg -n '"apiVersion": "\\^1\\.' src/pluginexamples src/plugins -g plugin.json

rg -l "getRequiredPluginApi|getPluginHostApi|timelineApi|audioApi|audioRawApi|timingApi|sampleAudio" \
  src/core/scene/elements src/pluginexamples src/plugins \
  -g '*.ts' -g '!**/__tests__/**'
```

Update the counts in this document when a workstream closes. Do not mark the migration complete
until the removal-gate searches are empty outside the dedicated compatibility fixtures.
