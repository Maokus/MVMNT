# Plugin Version Conflicts: Current State and Improvement Areas

_Date: 2026-04-08_

---

## 1. What "Version" Means in MVMNT

There are three distinct version numbers in play. Conflating them is a recurring source of confusion:

| Version | Where defined | What it tracks |
|---|---|---|
| **App version** | `package.json` | MVMNT application release. Not used in plugin loading. |
| **Plugin version** | `plugin.json` → `version` | The plugin author's own release number. Currently unused by the host at load time — stored in the manifest record but never compared against anything. |
| **Plugin API version** | `api-version.ts` → `PLUGIN_API_VERSION = '1.0.0'` | The public SDK surface that plugins program against. This is the only version that triggers a compatibility gate at install time. |

---

## 2. How Conflict Detection Works Today

### 2a. At install time (`plugin-loader.ts`)

1. The bundle is unzipped and `manifest.json` is parsed.
2. The host's `PLUGIN_API_VERSION` is checked against the plugin's declared `apiVersion` range (e.g. `^1.0.0`) using the hand-rolled `satisfiesVersion()` function. If incompatible, load is aborted with `UnsupportedVersionError`.
3. The plugin's `id` is looked up in the Zustand store. If a plugin with that `id` already exists and `allowExistingPlugin` is `false`, load is aborted with `"Plugin 'X' is already loaded"`.
4. Each element type the plugin declares is checked against the registry (see 2b).

### 2b. At element-type registration (`scene-element-registry.ts`)

Two hard-error rules apply:

- **Built-in collision**: `type` is in `builtInTypes` → throws. Non-negotiable.
- **Cross-plugin collision**: `type` is in `pluginTypes` and owned by a different `pluginId` → throws.

Registering the same type from the same plugin ID a second time is silently allowed (used by enable/reload flow).

### 2c. At render time (`get-plugin-host-api.ts`)

When `getPluginHostApi()` is called inside an element, the SDK embedded in the plugin checks the host's reported `apiVersion` against the range it was compiled with. This is a second, bilateral version guard — both host and plugin assert compatibility.

### 2d. At build time (`build-plugin.mjs`)

The build script pre-validates element types against a hardcoded built-in list and catches intra-plugin duplicate types before bundling. This duplicates the registry rules at compile time.

---

## 3. Current Gaps and Problems

### 3.1 Plugin version is collected but never used

`manifest.version` (the plugin author's own semver) is stored in `LoadedPlugin` and shown in the UI, but the host never compares it during any stage of loading. This means:

- Reinstalling an older version of a plugin silently replaces the newer one in IndexedDB with no warning.
- There is no way to detect or prevent a downgrade.

### 3.2 Duplicate ID = hard block, with no upgrade path

When `allowExistingPlugin` is `false`, installing a new bundle with the same `id` as an existing plugin returns a failure result with the message `"Plugin 'X' is already loaded"`. The caller must first call `unloadPlugin` to clear the old entry before reinstalling.

This is correct for a simple case but creates friction for the common intent — updating an existing plugin to a newer version — which has to be done in two steps from the outside. There is no semantics for "install or upgrade". The version of the incoming bundle is never surfaced during this failure, so the UI cannot tell the user "you have 1.0.0 and are trying to install 1.2.0".

### 3.3 Startup reload skips the version check

When the app restarts and reloads persisted plugins from IndexedDB, `skipVersionCheck: true` is passed. The justification in the code is that the version was checked at install time. This reasoning breaks down when:

- The host's `PLUGIN_API_VERSION` was bumped between sessions (e.g. after a MVMNT update).
- A plugin binary that was valid for `1.0.0` is now loaded against `2.0.0`, which may be breaking.

The only guard at that point is the bilateral render-time check in `get-plugin-host-api.ts`, which produces `status: 'unsupported-version'` silently per element call — no aggregate error surfaced at load.

### 3.4 Cross-plugin element-type collisions are fatal with no resolution

If two plugins both declare a type like `"bar-chart"`, installing the second one throws immediately and none of its elements load — even ones that don't conflict. There is no mechanism to:

- Partially load a plugin (skip conflicting types only).
- Prefer one plugin's type over another with an explicit priority.
- Inform the user which installed plugin owns the conflicting type.

### 3.5 `peerDependencies` field exists but is ignored

The `PluginManifest` type includes `peerDependencies?: Record<string, string>`, but `plugin-loader.ts` does not read it. A plugin that depends on another plugin being present (e.g. a theme pack that extends a charting pack) has no mechanism to declare or enforce that dependency.

### 3.6 Dev loader bypasses all version and conflict logic

`dev-plugin-loader.ts` calls `registerElementFromClass` (the built-in path), not `registerCustomElement`. This means:

- No `pluginId` is tracked, so dev plugin types cannot be unregistered by plugin.
- Cross-plugin type collisions in dev mode produce the same hard throw as production, but now the element lands in `builtInTypes`'s sibling set instead of `pluginTypes`, so the error message is misleading.
- No version check runs at all, so a dev plugin defining the wrong `apiVersion` will pass in dev and fail in production.

### 3.7 Built-in type list is duplicated across two files

`scene-element-registry.ts` and `build-plugin.mjs` both hardcode the list of built-in types. They can drift. There is no compile-time or test-time assertion that they match.

---

## 4. Improvement Areas

The items below are roughly ordered easiest-to-hardest and most-impactful-first.

### 4.1 Treat install-time plugin version as a downgrade guard

**What:** Before overwriting a plugin in IndexedDB, compare the incoming `manifest.version` against the stored one. If the incoming version is strictly lower, return a distinct failure result (`PluginDowngradeError`) with a message naming both versions.

**How:** In `loadPlugin`, after the duplicate-id check, fetch the existing manifest from the Zustand store and compare versions with `satisfiesVersion`. Only allow the overwrite if `allowExistingPlugin` is true **and** the incoming version is ≥ the stored version (or a new explicit `allowDowngrade` option is set).

**Impact:** Prevents accidental silent downgrades with zero UI changes needed (the existing error surface is sufficient).

---

### 4.2 Introduce a first-class "install or upgrade" operation

**What:** Add an `upgradePlugin(bundleData)` function (or an `options.upgradeExisting` flag in `loadPlugin`) that explicitly means "unload the old version and load the new one atomically, but only if the incoming version is strictly higher".

**How:**
1. Parse the incoming manifest.
2. If the id exists and the incoming version > stored version, call `unloadPlugin` then `loadPlugin` in sequence.
3. If incoming version ≤ stored version, reject with a downgrade error.
4. Expose this from the plugin management UI as an "Update" button that appears when the installed version differs from the bundle being dropped in.

**Impact:** Removes the current two-step dance and gives the UI enough information to present a meaningful upgrade confirmation dialog ("Update extraspack1 from 1.0.0 to 1.2.0?").

---

### 4.3 Re-enable the version check at startup reload

**What:** Remove `skipVersionCheck: true` from the startup reload path. Instead, gracefully handle the failure: if a stored plugin no longer satisfies `PLUGIN_API_VERSION`, mark it as `enabled: false` with an `error` of `"api-version-incompatible"` rather than silently skipping or hard-failing.

**How:** The `loadPlugin` return type already has a `success: false` with a reason string. Wire that result into the Zustand store entry so the plugin management UI can show "This plugin requires API 1.x but the current version is 2.0. Please update the plugin."

**Impact:** Prevents use-after-major-host-update breakage from being silently ignored. Particularly important as `PLUGIN_API_VERSION` approaches `2.0.0`.

---

### 4.4 Partial load on cross-plugin element-type collision

**What:** Instead of aborting the entire plugin install on any element-type collision, collect errors per-element and continue loading non-conflicting types. Augment the load result with `loadedElements` and `skippedElements` arrays.

**How:** Wrap each `registerCustomElement` call in the per-element loop with a try-catch. Accumulate failures. Only mark the whole plugin as failed if zero elements loaded.

**Impact:** Allows a plugin that conflicts on one of ten types to still provide its other nine. The user gets a meaningful warning rather than a total rejection.

---

### 4.5 Surface owning plugin in collision errors

**What:** When a cross-plugin collision occurs, the error message should name the plugin that currently owns the type, not just the type string.

**How:** The registry already stores `pluginTypes: Map<string, string>` (type → pluginId). Look up `pluginTypes.get(type)` and include it in the thrown error: `"type 'bar-chart' is owned by plugin 'charting-pack-1'"`. The `pluginId` can be resolved to a display name via `usePluginStore.getState().plugins[existingId]?.manifest.name`.

**Impact:** Makes collision errors actionable ("disable plugin X to load plugin Y") instead of opaque.

---

### 4.6 Implement basic `peerDependencies` resolution

**What:** When loading a plugin, check that each entry in `peerDependencies` resolves to an already-loaded plugin satisfying the declared version range.

**How:**
```typescript
for (const [depId, depRange] of Object.entries(manifest.peerDependencies ?? {})) {
  const dep = usePluginStore.getState().plugins[depId];
  if (!dep || !satisfiesVersion(dep.manifest.version, depRange)) {
    return { success: false, reason: `missing peer: ${depId}@${depRange}` };
  }
}
```

**Impact:** Enables plugin ecosystems where pack B extends pack A. Low implementation cost since `satisfiesVersion` already exists and the manifest field is already typed.

---

### 4.7 Fix the dev loader to use `registerCustomElement`

**What:** Route dev plugin types through `registerCustomElement` (with a synthetic `pluginId` derived from the directory name) instead of `registerElementFromClass`.

**How:** In `dev-plugin-loader.ts`, synthesise a manifest-like object per discovered directory and call the standard registration path. Add a version check against the `apiVersion` declared in the `plugin.json`.

**Impact:** Dev plugins get the same collision semantics as production. Version mismatches are caught in dev instead of only in production. Unregistration by plugin ID becomes possible (useful for HMR cleanup).

---

### 4.8 Single source of truth for built-in types

**What:** Export the built-in types list from `scene-element-registry.ts` and import it in `build-plugin.mjs`, eliminating the parallel hardcoded copy.

**How:**
- Move the list to a standalone const (e.g. `BUILT_IN_ELEMENT_TYPES: readonly string[]`) in a file that can be imported by both the registry and the build script.
- Add a test in `api-drift.test.ts` or a sibling that asserts the list used in `build-plugin.mjs` (via a shared import or snapshot) matches the registry's `builtInTypes` set at startup.

**Impact:** Prevents silent drift where a newly added built-in element type blocks plugin authors without feedback from the dev build.

---

## 5. Summary Priority Matrix

| # | Item | Effort | Breakage risk | User-facing impact |
|---|---|---|---|---|
| 4.1 | Downgrade guard | Low | None | Prevents data loss |
| 4.5 | Better collision error messages | Low | None | UX clarity |
| 4.8 | Single built-in type source | Low | None | Developer DX |
| 4.3 | Version check at startup reload | Medium | Low | Correctness after host update |
| 4.4 | Partial element load on collision | Medium | Low | Resilience |
| 4.7 | Fix dev loader registration path | Medium | Low (dev only) | Developer DX, parity |
| 4.2 | First-class upgrade operation | Medium | Low | UX for plugin updates |
| 4.6 | `peerDependencies` resolution | Medium | None (additive) | Plugin ecosystem |
