# MVMNT Plugin SDK Improvement Plan

_Status: proposed. This is a design and migration plan; no SDK behaviour has changed._

## Purpose

Make the MVMNT plugin API a deliberate, independently consumable product rather than
a collection of application modules exposed through a convenient alias. Plugin authors
should have one obvious way to access host data, stable public data models, reliable
package/runtime parity, and documentation that can be followed verbatim.

This plan covers the scene-element plugin SDK (`@mvmnt/plugin-sdk`), the runtime host
bridge, manifest/build tooling, and their documentation. It does not propose changing
the rendering engine or the scene-file format.

## Current assessment

The SDK has a useful capability model and strong building blocks, but its public
contract currently has several inconsistent boundaries.

| Area | Evidence in the current implementation | Consequence |
| --- | --- | --- |
| Multiple access styles | `getPluginHostApi`, `getRequiredPluginApi`, proxy objects, and shorthand helpers all access the same data, with different error/fallback behaviour. | Authors must decide between four patterns; failures may throw, return an invalid host, or silently turn into `[]`, `null`, `0`, or `false`. |
| Capability enforcement | `createCapabilityProxy()` calls `getPluginHostApi()` without the capability it proxies, then accesses the selected section. Several shortcuts only test whether `api` exists. | A host can report missing capabilities while calls still reach the underlying section. The stated capability contract is not consistently enforced. |
| Private data leaks | `PluginTimelineApi` returns `TimelineState` and `TimelineState['tracks'][string]`; audio and SDK modules export types/functions from `@state`, `@audio`, and `@core`. | External plugins compile against internal state shape and can depend on unstable fields, defeating versioning and restricting future refactors. |
| Public surface/runtime drift | `sdk/visual-assets.ts` is re-exported from the top-level SDK, but no `@mvmnt/plugin-sdk/visual-assets` runtime module is injected. `loadBundledAsset` is described as an SDK utility but is injected only for the top-level runtime module and is not exported by `sdk/utils.ts`. | Valid-looking documented imports can fail at plugin runtime. |
| Documentation/API drift | The docs list `Image`, top-level `loadBundledAsset`, `api.audioRaw`, and a raw-audio tuple return; current exports use `VisualMedia`, `audioRawApi`, raw methods on `api.audio`, and `Float32Array`. The API overview omits two declared capabilities. | The reference cannot be trusted as the source of truth. |
| Tooling mismatch | The builder validates only the top-level SDK import as public, while it permits legacy aliases as externals; it does not recognise documented SDK subpaths as public imports. The developer script duplicates bundling policy. | Build-time feedback does not reliably match the runtime module resolver. |
| Safety and lifecycle ambiguity | Direct proxies resolve global host state per property access; audio-calculator registration has global singleton lifetime; asset URLs are per-plugin but asset helpers differ by import form. | Plugin lifecycle, teardown, and failure handling are not expressible through the public API. |
| Tests validate shape more than contract | The drift suite primarily asserts that names exist and checks a manually maintained capability-to-proxy map. | It will not catch documentation errors, subpath runtime availability, capability bypasses, or an external-plugin build/load failure. |

First-party elements also often import application-private modules instead of the SDK.
Those elements are not evidence that the external contract is usable; they mask gaps in
the public surface and should be treated as migration clients.

## Target API principles

1. **One official runtime entry point.** Prefer a single `context` supplied to a scene
   element at render/lifecycle time. Domain helpers can be conveniences over that
   context, but they must share its semantics.
2. **Explicit, local capability checks.** A method is callable only when its capability
   is granted; unavailable capabilities return a typed result or throw one documented
   error mode, never an unrelated fallback value.
3. **DTOs, not application state.** Public interfaces are SDK-owned, readonly snapshots
   with documented fields. No public declaration mentions Zustand, `TimelineState`, or
   application path aliases.
4. **Package/runtime/docs parity.** Every documented import is type-resolvable,
   accepted by the build tool, and injectable by the runtime. One machine-readable
   export manifest drives all three where practical.
5. **Intentional compatibility.** The SDK has its own versioned package and API
   changelog. Additions are backwards compatible; removals use a documented deprecation
   period and a major version.
6. **Secure-by-default surface.** Plugins receive narrow views and read-only data;
   expensive reads have explicit limits, cancellation, and typed diagnostics.

## Proposed public shape

Expose an actual versioned SDK package, initially with the same import name:

```ts
import {
    definePluginElement,
    type ElementContext,
    type TimelineApi,
    type AudioApi,
} from '@mvmnt/plugin-sdk';
```

`definePluginElement()` should receive a declarative element definition with metadata,
property schema, capability requirements, and lifecycle/render callbacks. Each callback
receives an `ElementContext` with a fixed snapshot of the render time and an SDK-owned
capability view. This removes the unused `this` parameter currently passed to
`getRequiredPluginApi()` and makes dependencies visible in one location.

```ts
type Result<T, E extends PluginDiagnostic = PluginDiagnostic> =
    | { ok: true; value: T }
    | { ok: false; error: E };

interface ElementContext {
    readonly time: RenderTime;
    readonly timeline?: TimelineApi;
    readonly audio?: AudioApi;
    readonly assets: AssetApi;
    readonly diagnostics: DiagnosticsApi;
    readonly signal: AbortSignal;
}
```

The exact naming can be settled during Phase 1, but the selected API must eliminate
the current duality between `api.audio` and `audioRawApi`, and should not retain silent
numeric/collection fallback helpers as a primary pattern. If legacy helpers are kept,
they should be explicitly marked deprecated compatibility adapters built on the new
context.

## Delivery plan

### Phase 1 — Specify and lock the public contract

- Audit every existing top-level export and SDK subpath. Classify it as **supported**,
  **deprecated compatibility**, **internal**, or **not yet supported**.
- Define SDK-owned DTOs for MIDI events, CC events, track summaries, timeline metadata,
  feature frames, audio channel metadata, render inputs, and diagnostics. Do not expose
  raw stores, track records, or internal feature descriptors.
- Define per-capability contracts and resource limits: nullability, ordering, invalid
  argument response, unloaded-resource response, maximum range/sample size, allocation
  ownership, and cancellation behaviour.
- Choose one error convention for normal plugin work. Recommended: `Result` for expected
  host/resource conditions and thrown `PluginError`s only for programmer/contract
  violations. Provide error codes rather than asking authors to parse messages.
- Define plugin lifecycle hooks (`onLoad`, `onUnload`, optional `onHostChanged`) and
  ownership rules for registrations, subscriptions, asset URLs, and calculator cleanup.
- Write an SDK compatibility policy: semver rules, supported host/plugin range
  negotiation, minimum host version, deprecation lifetime, and a concise changelog
  format.

**Exit criteria:** an approved API specification and API report listing every v1 export
and its v2 disposition. No implementation starts before public DTOs and failure
semantics are agreed.

### Phase 2 — Build an independently consumable SDK package

- Move public types and helpers into a package boundary (for example
  `packages/plugin-sdk`) with `package.json` `exports`, generated declarations, and
  subpath export entries.
- Make SDK modules import only package-local public code or deliberate browser/platform
  dependencies. Application aliases must not appear in published declaration files.
- Publish a local workspace package first; decide separately whether public npm
  distribution is in scope. External authors should no longer need a checkout of this
  repository or copied TypeScript path mappings to compile.
- Generate a JSON API manifest from the package exports. Use it as the source for the
  host module map, import validation, documentation export inventory, and parity tests.
- Give `visual-assets` a real subpath export and runtime module entry, or remove it from
  the public barrel until it is supported. Do the same audit for every future subpath.
- Make asset loading a named, documented `AssetApi` operation available consistently
  from both top-level and subpath imports; retain existing `SceneElement` methods only
  as compatibility conveniences.

**Exit criteria:** a minimal plugin in a separate fixture workspace can install the SDK,
type-check, bundle, and load without source aliases or internal imports.

### Phase 3 — Implement the host adapter and capability boundary

- Implement the new context/facade as a thin adapter over current stores and services.
  Convert internal values to frozen or copied public DTOs at this boundary.
- Replace broad `getStateSnapshot()` with narrowly scoped read operations. If a full
  snapshot is genuinely needed, make it a versioned `TimelineSnapshot` DTO rather than
  returning `TimelineState`.
- Split audio feature and raw-audio APIs into distinct public facets or one clearly named
  `AudioApi`; do not expose raw methods through a differently named proxy than through
  the host object.
- Enforce requested/granted capabilities before every domain operation. A denied call
  must not reach the internal service. Capability grants should derive from a manifest
  declaration plus host availability, rather than the currently unused element argument.
- Validate arguments at the boundary (finite times, ordered ranges, valid channel,
  limits) and return stable diagnostics. Cap expensive reads with documented limits and
  cancellation through `AbortSignal`.
- Replace per-property global proxy resolution with a per-callback context snapshot.
  This makes a frame internally consistent and avoids global lookups in hot render loops.
- Bind all plugin registrations (audio calculators, listeners, object URLs) to a plugin
  lifetime scope and dispose them automatically on unload/reload.

**Exit criteria:** unit tests demonstrate denied-capability isolation, DTO stability,
input validation, cleanup on unload, and consistent behaviour in missing-host,
incompatible-version, and resource-unavailable conditions.

### Phase 4 — Unify manifest, builder, and runtime loading

- Add an explicit `capabilities` field to the plugin manifest; validate its values against
  the generated SDK manifest. Keep host availability separate from requested permission.
- Replace duplicated import allow/block lists in `build-plugin.mjs` and `dev-plugin.mjs`
  with shared SDK metadata. Accept every supported SDK subpath and reject every internal
  alias consistently.
- Remove legacy internal aliases from the normal bundler externals and loader resolution.
  During the compatibility window, detect them with actionable migration diagnostics;
  do not let them appear to work by probing `globalThis.MVMNT` internals.
- Use one shared plugin-package validation library for schema validation in the CLI,
  import UI, and tests. Validate archive paths, entry resolution, duplicate types,
  allowed externals, and manifest/capability compatibility before execution.
- Keep CJS execution only as a compatibility path. Specify an ESM-oriented plugin output
  format with source maps and structured loader diagnostics, then migrate the loader in
  a separate security-reviewed change.

**Exit criteria:** production build, dev build, and runtime loader accept and reject the
same fixture matrix; error messages name the plugin, element, import/capability, and
remediation.

### Phase 5 — Migrate clients and document the supported workflow

- Add a codemod or mechanical migration guide from `getPluginHostApi`,
  `getRequiredPluginApi`, direct proxies, and shortcut helpers to the selected context
  API. Preserve v1 adapters for one announced compatibility window.
- Migrate plugin examples first; they become executable reference implementations.
- Migrate first-party elements that currently import `@core`, `@audio`, or `@state`
  directly when performing work intended to be available to external plugins. Retain
  private imports only where functionality is intentionally not part of the SDK.
- Replace the current long-form reference with a task-oriented quickstart, an authoritative
  API reference generated from public types, a capability/permissions guide, a lifecycle
  guide, and a migration guide. Correct all current name and return-type mismatches.
- Add a `create-plugin` starter that uses the real package, the recommended API shape,
  typed manifest capabilities, tests, and a build command.

**Exit criteria:** a new author can create, type-check, package, hot-reload, and debug a
plugin using only documented commands and imports. All shipped examples follow that path.

### Phase 6 — Deprecate v1 paths and maintain the contract

- Ship deprecation warnings with exact replacements for legacy helpers and unsupported
  imports. Track their use in local/dev diagnostics without collecting plugin code.
- Remove compatibility paths only in the next major SDK API version, after the published
  migration window and an examples migration.
- Require an API-review checklist for SDK changes: DTO-only types, capability decision,
  version impact, runtime/export parity, documentation update, fixture coverage, and
  performance/allocation review.
- Generate release notes from the SDK API manifest diff and fail CI when a public change
  lacks a semver classification.

**Exit criteria:** public exports, runtime modules, manifest capability names, examples,
and docs are continuously checked as one contract.

## Verification matrix

Add these checks before calling the SDK boundary stable:

- **Type fixture:** an external TypeScript plugin imports every supported root/subpath
  export and cannot import internal aliases.
- **Bundle/load fixture:** package the fixture with both production and dev builders, then
  load it through the same runtime resolver used by the app.
- **Parity test:** compare package `exports`, generated SDK manifest, builder allow-list,
  runtime module map, and documentation inventory.
- **Capability tests:** every API operation is tested with granted, undeclared, unavailable,
  and missing-host states; verify denied operations never call the internal dependency.
- **Contract tests:** validate public DTO values, readonly/copy behaviour, error codes,
  range limits, and audio sample ownership.
- **Lifecycle tests:** reload/unload a plugin that registers a calculator, creates assets,
  and starts asynchronous work; verify disposal/cancellation and no duplicate registration.
- **Documentation tests:** compile code blocks from the quickstart/API guide or maintain
  them as fixture source files linked from the documentation.
- **Regression suite:** run `npm run test`, `npm run build`, and `npm run compile` for
  each implementation phase.

## Sequencing and compatibility notes

Phases 1 and 2 are prerequisites for API design and distribution respectively; Phases 3
and 4 may proceed in parallel once the contract is accepted. Phase 5 should begin only
when the external-fixture tests pass. Avoid an in-place “cleanup” that renames exports
without first establishing DTOs and runtime parity—the current pain is chiefly a contract
problem, not a naming problem.

The recommended initial compatibility strategy is additive: ship the new package/context
alongside v1 adapters, migrate all repository-owned examples and plugins, then set a
removal version/date only once real plugin consumers can be inventoried. This prevents
the SDK from becoming more polished internally while breaking installed bundles.

## Decisions still needed

- Is `@mvmnt/plugin-sdk` intended to be publicly published to npm, or only a workspace
  package distributed with an official starter/template?
- Which capabilities are true user-visible permissions, and which are host-resource
  availability flags? The manifest and UI should distinguish them.
- Should plugins remain arbitrary JavaScript evaluated with `new Function`, or is a
  sandbox/worker/iframe isolation model a future product requirement? This plan improves
  the API boundary but does not make arbitrary code execution safe.
- What is the supported host/browser compatibility range for plugin bundles, source maps,
  and ESM output?
- Are external UI panels/React dependencies part of the supported plugin product? If not,
  remove React from the public plugin build surface and documentation; if yes, version and
  sandbox it explicitly.
