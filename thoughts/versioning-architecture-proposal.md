# MVMNT Versioning Architecture Proposal

_Written April 2026. Grounded in the current codebase (schemaVersion 5, plugin-loader.ts, export.ts, communityApi.ts)._

---

## Recommended Model (Summary)

Four distinct version axes. Three compatibility states surfaced in UI. Two new DB columns needed immediately. One behavior change in export.ts.

| Axis | Lives where | Current state |
|---|---|---|
| **Scene schema version** | `envelope.schemaVersion` (integer) | v5, migrations for v1–v4 |
| **App capability version** | App constant (add `APP_CAPABILITY_VERSION`) | Not formalized |
| **Plugin API compat range** | Plugin manifest `apiVersion` + `PLUGIN_API_VERSION` | Exists, not in community DB |
| **Plugin release semver** | Plugin manifest `version` | Exists, pinned in scene exports |

The central pain points are:
1. Scene exports pin exact plugin versions → newer installs trigger spurious "missing" warnings.
2. Community items don't expose compat metadata → failures happen at download/import time, not before.
3. `ERR_SCHEMA_VERSION` is user-facing with no actionable message.

---

## Section 1: The Four Versioning Axes

### 1.1 Scene Schema Version (integer, bumped rarely)

Controls the envelope format. Already implemented correctly:
- Bump only when the envelope structure changes (not when scene content changes).
- Migrations run in `src/persistence/migrations/` and are chained forward.
- `validate.ts` rejects unknown versions — correct behavior.

**What to add:** A constant `CURRENT_SCHEMA_VERSION = 5` and a companion `MIN_APP_VERSION_FOR_SCHEMA` lookup table (see §4) so the error message can name a required app version.

### 1.2 App Capability Version (new formalism, integer or semver)

Currently implicit — "the app understands schemaVersion 5" — but nowhere encoded for outward communication. Introduce `APP_CAPABILITY_VERSION` (could just equal `CURRENT_SCHEMA_VERSION` initially) stored in:
- Scene exports: `assets.createdWith` already stores the app semver — good. Also add `assets.minAppVersion` (e.g. `"0.16.0"`) derived from a `SCHEMA_TO_MIN_APP_VERSION` lookup at export time.
- Community DB: `min_app_version` column extracted on upload.

This lets the community UI say "requires MVMNT 0.16+" before download.

**Tradeoff:** Don't make this too granular. The schema version already captures structural compat; app semver is only needed for UX messaging. One integer lookup table beats a complex matrix.

### 1.3 Plugin API Compatibility Range

Already well-designed: plugins declare `apiVersion: "^1.0.0"`, loader checks against `PLUGIN_API_VERSION`. 

**What's missing:** This range lives only inside the zip. It is not stored in the community DB, so incompatible plugins cannot be filtered before download. Fix: extract `apiVersion` on upload, store in `plugin_api_version` column.

When `PLUGIN_API_VERSION` makes a major bump (1.x → 2.x), old plugins with `"^1.0.0"` are automatically flagged as incompatible in the community UI before anyone downloads them.

### 1.4 Plugin Release Semver

The plugin's own `version` field — tracks feature and bug releases. This axis is **orthogonal** to API compat. A plugin can go from v1.2.0 to v1.3.0 with zero API changes.

The downgrade guard (plugin-loader.ts:218–229) correctly prevents reverting. Do not change it.

**The one fix needed:** Scene exports currently write `version: manifest?.version ?? 'unknown'` (export.ts:284) — an exact pin. `assessPluginDependencies` then calls `satisfiesVersion(installed.manifest.version, dep.version)` which fails when `dep.version = "1.2.0"` and installed is `"1.3.0"`. The fix is in §2.

---

## Section 2: Plugin Dependency Encoding in Scene Exports

### The Problem

`export.ts:284` stores the exact installed version as a string (e.g. `"1.2.0"`). semver `satisfies("1.3.0", "1.2.0")` is `false` — so a newer installed plugin triggers a false "missing" warning.

### Recommended Fix

At export time, derive a `^major.minor.0` range from the installed version:

```
"1.2.3" → "^1.2.0"   // any 1.x.x >= 1.2.0 satisfies
"2.0.0" → "^2.0.0"   // any 2.x.x satisfies
```

This means: "I was made with v1.2, any compatible 1.x should work." A user with v1.5 installed opens the scene — no warning. A user with v0.9 installed — warning, because they're below the minimum tested version.

**Preserve the hash** for embedded plugin verification — that's separate from the version check and serves a different purpose (tamper detection on embedded bundles).

**Edge case:** If an element uses a feature that broke in v1.4 due to plugin-side changes, the author should bump their plugin's major or minor. That's the plugin author's responsibility, same as any semver contract.

**Keep the downgrade guard intact.** The guard prevents reverting an _installed_ plugin via an embedded older bundle. It is not affected by how we encode the version range in the scene file — those are different code paths.

### Also: Distinguish "missing" from "version mismatch"

`assessPluginDependencies` currently conflates:
- Plugin not installed at all → `missing[]`
- Plugin installed but version out of range → also `missing[]`

These should produce different warnings. A truly missing plugin means elements will be placeholders. A version-range miss with a newer install is likely harmless and should be a lower-severity advisory, not a blocking warning.

---

## Section 3: Community Upload Metadata

### Minimum needed now

Add three columns to `community_items`:

| Column | Type | Source | Purpose |
|---|---|---|---|
| `plugin_api_version` | `text` | Extracted from manifest `apiVersion` on upload | Pre-download compat check for plugins |
| `template_schema_version` | `integer` | Extracted from `envelope.schemaVersion` on upload | Pre-download compat check for templates |
| `min_app_version` | `text` | Extracted from `assets.minAppVersion` on upload | Human-readable "requires v0.16+" badge |

These are all extractable at upload time from the zip/manifest — no server-side processing needed beyond what `parsePluginManifest()` already does.

`created_at` already exists. Rename the semantics internally: this is the "uploaded at" timestamp, not "created in" timestamp. The `assets.createdWith` field in the envelope carries the actual creation-time app version.

### What to extract at upload time

**For plugins:** `parsePluginManifest()` (already called in CommunityUploadModal) returns `id`, `version`, `apiVersion`. Store `apiVersion` → `plugin_api_version`.

**For templates:** Unzip the `.mvt`, parse `envelope.json`, read `schemaVersion` → `template_schema_version`, read `assets.minAppVersion` (after adding that field) → `min_app_version`, read `assets.createdWith` for display.

This logic belongs in `communityApi.ts` `uploadItem()`, not in the modal component.

### What you don't need yet

- Storing full plugin dependency lists per template in the DB. The envelope already contains this; it's only needed if you want server-side dependency resolution, which is premature.
- Multiple version rows per plugin (see §6).

---

## Section 4: Compatibility Surfacing in the UI

### Compatibility States (ordered by severity)

| State | Definition | UX |
|---|---|---|
| **Fully compatible** | All checks pass | No badge shown |
| **Compatible with minor differences** | Version-range advisory (newer plugin installed) | Subtle "version advisory" note, not a warning |
| **Loadable with degradation** | One or more plugins missing/incompatible; affected elements show as placeholders | Yellow warning badge; specific elements listed |
| **Incompatible** | Schema version too new, or API version incompatible | Red "incompatible" badge; reason + action |

### Community card/detail modal

Show a compatibility badge **before download** based on DB columns:

- `template_schema_version > CURRENT_SCHEMA_VERSION` → red "Requires newer MVMNT" badge
- `plugin_api_version` range doesn't satisfy running `PLUGIN_API_VERSION` → red "Plugin incompatible with this app version"
- `min_app_version` > running app version → red "Requires MVMNT vX.Y+"
- All checks pass → no badge (clean)

Avoid showing compatibility badges for items that pass — don't add noise for the common case.

### Import/load errors

Replace raw error codes with human-readable messages. Map `ERR_SCHEMA_VERSION` at the point of user display, not in validate.ts internals (keep the code for programmatic handling):

| Code | User-facing message |
|---|---|
| `ERR_SCHEMA_VERSION` | "This file was created with a newer version of MVMNT. Please update the app to open it." |
| Plugin `apiVersion` mismatch | "The plugin '{name}' requires a different version of the app API. Update the app or contact the plugin author." |
| Plugin missing | "The plugin '{name}' is not installed. Some elements are shown as placeholders. Install it from the Community page." |
| Plugin version advisory | "Plugin '{name}' v{required} was used to create this file; you have v{installed} installed. It may work correctly." |
| Downgrade blocked | Not shown to user — the scene loads with the current plugin; log internally. |

The distinction between "incompatible" and "loadable with degradation" is important: in the degradation case, the scene _does_ load and the user sees placeholder elements. Don't show a hard error for that.

---

## Section 5: Degradation Handling

### Principle

Load what you can. Show what failed. Don't block on recoverable issues.

### The four states in practice

**Fully compatible:** Everything loads. No user notification.

**Compatible with minor differences:** Scene loads fully. If a plugin version range doesn't match but the install is newer, show a dismissible advisory in the import result (lower visual weight than a warning). This is the case that will become common once `^` ranges are used.

**Loadable with degradation:** One or more plugins are truly missing or API-incompatible. The scene loads; affected elements render as placeholder tiles. The import result shows a yellow warning listing the affected plugins and where to get them. Users can still work with the rest of the scene.

Placeholder tiles should show the plugin name and a "not installed" indicator — not a blank space and not a crash. This is what the current code does; keep it.

**Incompatible:** Schema version is unrecognized (too new). Hard failure. The file is not loaded. Show a clear error with a suggested action (update the app, or ask the file creator to export with an older schema if possible).

### What to avoid

- Do not silently fail plugin loads without informing the user.
- Do not surface technical semver strings in user-facing error text.
- Do not prompt users to downgrade any plugin. The downgrade guard exists precisely to prevent this.
- Do not treat a version-range advisory as a hard error.

---

## Section 6: Community/Backend Data Model

### Current model: one row per plugin UID

This is correct for now. It works because:
- Plugin UIDs are globally unique.
- Uploading a new version replaces the file.
- The version column tracks the current semver.

**The gap:** If a plugin releases v2.0.0 with a breaking `apiVersion` bump, templates that embedded v1 are stranded silently. The new `plugin_api_version` column partially addresses this — at least the community UI will show the current plugin as incompatible with old app versions.

### When to add a `plugin_versions` table

Not yet. Add it when either of these is true:
1. Plugin authors want users to pin to specific versions of their plugin (rare, opt-in).
2. The community accumulates templates that reference specific plugin versions and you want to serve those old versions on-demand.

Until then, the single-row model with a good `plugin_api_version` column is sufficient. Users who need a specific old version can embed it in their scene file.

### Practical DB migration

```sql
ALTER TABLE community_items
  ADD COLUMN plugin_api_version text,       -- e.g. "^1.0.0" — for plugins
  ADD COLUMN template_schema_version integer, -- e.g. 5 — for templates
  ADD COLUMN min_app_version text;           -- e.g. "0.16.0" — for both
```

Backfill: set `template_schema_version = 5` and `plugin_api_version = NULL` for existing rows. The UI treats NULL as "unknown" and shows no compat badge (safe default).

Don't add NOT NULL constraints on these columns yet — old rows legitimately have no data.

---

## Section 7: Error Language

### Principles

- Name the problem and the action in the same sentence.
- Avoid exposing version numbers unless they're meaningful to the user.
- Distinguish "update the app" from "install a plugin" from "contact the author."
- Use past tense for "was created with" (it was, not "is").

### Examples

**Hard incompatibility (schema too new):**
> "This file was created with a newer version of MVMNT and can't be opened here. Update MVMNT to the latest version and try again."

**Missing plugin:**
> "This scene uses the plugin '{title}' which isn't installed. Affected elements are shown as placeholders. You can install it from the Community page."

**Plugin API incompatible:**
> "The plugin '{title}' requires a version of MVMNT that this build doesn't support. Update the app or check if a newer version of the plugin is available."

**Version advisory (newer plugin installed):**
> "This scene was made with {plugin} v{required}. You have v{installed} installed — it should work, but some details may differ."

**Downgrade blocked (internal, not user-facing):**
Log: `[PluginLoader] Blocked downgrade attempt for '{id}': embedded v{old} < installed v{new}`.

---

## Section 8: Comparison to Blender's Philosophy

Blender's .blend format is a useful reference, but MVMNT should adapt rather than copy.

---

## Prioritized Implementation Roadmap

### Immediate (low effort, high impact)

1. **Fix exact version pin in `export.ts:284`** — change to `^major.minor.0` range. One-line change, eliminates spurious version mismatch warnings immediately.

2. **Improve `ERR_SCHEMA_VERSION` message** — in the UI layer that displays import errors (not in validate.ts itself), map this code to "This file was created with a newer version of MVMNT — please update." Add a `SCHEMA_TO_MIN_APP_VERSION` lookup for the specific version string.

3. **Distinguish "missing" vs "version advisory" in `assessPluginDependencies`** — currently both land in `missing[]`. Split into `missing[]` (truly absent) and `versionAdvisory[]` (installed but range mismatch). Display as different severity in the import result.

### Near-term (moderate effort, needed before community grows)

4. **Add `plugin_api_version`, `template_schema_version`, `min_app_version` to community DB** — single migration, backfill NULLs.

5. **Extract and store compat metadata on upload** — in `communityApi.ts` `uploadItem()`, extract these fields from the zip before inserting. No UX changes needed in the modal.

6. **Show compatibility badges in `CommunityDetailModal`** — compare stored DB columns against runtime `PLUGIN_API_VERSION` and `CURRENT_SCHEMA_VERSION`. Four states: fully compatible (no badge), advisory, degraded (yellow), incompatible (red).

7. **Add `assets.minAppVersion` to scene export envelope** — derived from `SCHEMA_TO_MIN_APP_VERSION[CURRENT_SCHEMA_VERSION]` at export time. Enables #6.

### Later / only-if-needed

8. **Plugin version history table** — only when plugin authors request version-pinning or you need to serve historical plugin versions. Not needed until the community has a long-lived plugin ecosystem.

9. **Community-side dependency resolution** — showing "this template requires plugins X, Y, Z, all available on community." Only meaningful once there are enough templates and plugins to make cross-referencing valuable.

10. **CI enforcement** — lint rule or CI check that prevents `@core/` imports in `src/plugins/`. Low priority since all default elements are now migrated; useful as the plugin ecosystem grows.

---

_End of proposal. No code written — this is purely architectural guidance. Implementation details are grounded in actual file paths and behavior observed in the codebase._
