# Versioning: Analysis & Recommendations

## Context

The user asked two architectural questions about how MVMNT handles versioning mismatches:
1. What happens when a template uses an older plugin version than the one installed?
2. What happens to existing files when the export format changes? How should the community tab, backend, and DB manage all this?

This is a research/advisory task, not an implementation plan. The findings below reflect the current codebase state and recommendations.

---

## Q1: Template with older plugin version than installed — does it prompt to downgrade?

**Short answer: No, and it shouldn't.**

### What currently happens (`src/persistence/import.ts:129–185`)

`assessPluginDependencies()` checks:
```
satisfiesVersion(installed.manifest.version, dep.version)
```
This asks: "does the installed version satisfy the range stored in the scene file?"

If the installed plugin is _newer_ and the scene stored an exact version like `"1.2.0"`, this returns `false` — causing a version mismatch warning and adding the dep to `missing[]`.

If the scene stored a range like `"^1.0.0"`, a newer `1.x` install would still satisfy it — no mismatch. This is the correct way to encode dependencies.

If the dep is embedded in the scene AND marked as `missing`, the user gets a `window.confirm` prompt asking to install embedded plugins. But then `loadPlugin()` runs with the **downgrade guard** (`plugin-loader.ts:217–230`):
```
if (!satisfiesVersion(manifest.version, `>=${existingPlugin.manifest.version}`)) → reject
```
So the install silently fails (adds to warnings), and the scene loads with those elements as placeholders.

### Verdict

There is no "would you like to downgrade?" UX — deliberately. The downgrade guard exists to prevent accidentally reverting a plugin. The correct fix is for plugin authors to **use semver ranges** (e.g. `^1.0.0`) in their scene exports rather than pinning exact versions, so newer installs still satisfy the requirement.

**Recommendation:** No change needed to the downgrade behavior. The better fix is to ensure scenes always export plugin version as a `^` range (e.g. `^1.2.0`) rather than an exact pin. This means a newer installed v1.x always satisfies the scene's requirement.

---

## Q2: File format changes, API version changes, and community versioning

### Current state

| Concern | Current implementation |
|---|---|
| Scene schema version | `schemaVersion: 5` in envelope; migrations in `src/persistence/migrations/`; validate.ts accepts v2/v4/v5 |
| Plugin API version | `PLUGIN_API_VERSION` constant; checked on `loadPlugin()` against manifest `apiVersion` field |
| Community DB `version` col | Stores plugin's own semver — only for plugins, not templates |
| Community DB: min MVMNT version needed | **Not stored anywhere** |
| Community DB: schema version for templates | **Not stored anywhere** |
| Community DB: plugin `apiVersion` range | Lives only inside the zip — not extracted to DB |

### What happens when you change the export file format

**Backward (loading old files in new app):** Works today via migration chain. Old v2/v4 files auto-migrate to v5 on load. Just keep writing migrations.

**Forward (loading new files in old app):** `validate.ts` rejects unknown schema versions. This is correct — but the error message ("ERR_SCHEMA_VERSION") isn't very user-friendly. Users need a clear "this file requires MVMNT v0.16+, please update" message, not a generic validation error.

**Community templates:** There's no way to know if a template was created with schema v5 or v6. Users on older versions will download a template and get a confusing load failure.

### What happens when you change the plugin API version

Plugins declare `apiVersion: "^1.0.0"` in their manifest. On `loadPlugin()`, if `PLUGIN_API_VERSION` doesn't satisfy the range, load fails silently (well, returns an error, but the community download UI doesn't know this before download). 

The `api_version` range is only inside the zip. There's no way to filter community plugins by compatibility before downloading.

---

## Recommended database changes

### Add to `community_items`:

```sql
-- For plugins: the apiVersion range from the manifest (e.g. "^1.0.0")
-- Extracted on upload, enables pre-download compat filtering
ALTER TABLE community_items ADD COLUMN plugin_api_version text;

-- For templates: the schemaVersion of the .mvt file (integer: 5, 6, ...)
-- Extracted on upload, enables pre-download compat filtering
ALTER TABLE community_items ADD COLUMN template_schema_version integer;

-- Optional but useful: the MVMNT app version used to create this item ("0.15.0")
-- Stored from the assets.createdWith field for templates, or manifest for plugins
ALTER TABLE community_items ADD COLUMN created_with_app_version text;
```

### Plugin version history (longer term)

The current model is one row per plugin UID (globally unique). Updating a plugin replaces the file. This works if you follow semver and never have breaking changes, but if you release v2.0.0 (new `apiVersion` range), old templates that embedded v1 are stranded.

**Option A (simple):** Keep one row per plugin, but make the community UI show a "last updated" version and warn if the plugin's `apiVersion` range doesn't match the user's running version. This is probably enough for now.

**Option B (versioned rows):** A separate `plugin_versions` table with rows per release, keeping the canonical `community_items` row pointing to the latest. More complex, needed only if you want users to be able to pin to specific plugin versions.

Recommendation: start with Option A.

---

## Recommended strategy per versioning axis

### Scene file format (schemaVersion bumps)

1. Always write a migration in `src/persistence/migrations/` when bumping schemaVersion.
2. On upload to community, extract `schemaVersion` from `envelope.json` inside the `.mvt`, store in `template_schema_version`.
3. In `CommunityDetailModal`, show "requires MVMNT v0.16+" (derived from schema version) if the template requires a newer schema than the user's app supports. Don't let them download something that will fail.
4. Improve the `ERR_SCHEMA_VERSION` error message in `validate.ts` to say "this file was created with a newer version of MVMNT — please update the app."

### Plugin API version (PLUGIN_API_VERSION bumps)

1. On plugin upload in `CommunityUploadModal`, already calls `parsePluginManifest()` to get `id`/`version`. Also extract and store `apiVersion` → `plugin_api_version` column.
2. In `CommunityPage`/`CommunityDetailModal`, compare stored `plugin_api_version` against the running app's `PLUGIN_API_VERSION` (already a constant) and show a compatibility badge.
3. When `PLUGIN_API_VERSION` has a breaking bump (e.g. `1.x → 2.x`), old plugins are automatically filtered as incompatible before download — no silent load failures.

### Plugin semver vs. installed version

1. No downgrade prompt — keep the current downgrade guard.
2. Change scene export to always store plugin version as a `^major.minor.0` range instead of the exact version pin. This means any compatible newer version satisfies the dep.
3. In the import warnings UI (wherever `importScene` warnings are shown), distinguish between "plugin missing" and "plugin version mismatch — your installed version may be compatible" so users aren't confused.

---

## Files that would need changes (if implementing)

- `supabase/migrations/` — new migration adding columns above
- `src/community/communityApi.ts` — extract `template_schema_version` / `plugin_api_version` on upload; add compat-check utilities
- `src/community/CommunityUploadModal.tsx` — pass new fields to `uploadItem()`
- `src/community/CommunityDetailModal.tsx` — show compatibility badges
- `src/community/CommunityPage.tsx` — optionally filter by compat
- `src/persistence/export.ts` — change plugin dep version pin to `^` range
- `src/persistence/validate.ts` — improve ERR_SCHEMA_VERSION message
- `src/core/scene/plugins/plugin-loader.ts` — no changes needed

---

## Verification

Since this is advisory, there's nothing to run. If implementing:
- Upload a plugin with a known `apiVersion` → check DB row has `plugin_api_version` populated
- Upload a template → check DB row has `template_schema_version` set to `5` (or current)
- Community detail modal for incompatible plugin → shows compatibility warning
- `importScene` with embedded older plugin → warning in result, no downgrade, elements are placeholders


