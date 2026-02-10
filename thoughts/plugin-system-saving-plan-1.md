# Plugin System Saving Plan (A + B + C)

_Last Updated: 10 February 2026_

## Goals

- Allow users to export scenes with plugin dependencies.
- Offer optional plugin bundling inside .mvt files at export time.
- Prompt users to install embedded plugins on import.
- Provide a visible, reversible fallback for missing plugin elements.

## Plan Overview

This plan integrates:

- Option A: Embed plugin bundles in .mvt
- Option B: Save plugin dependency manifest
- Option C: In-scene fallback placeholders

## 1) Export Envelope Changes (Option B)

Add a `plugins` section to `document.json` with entries like:

- `pluginId`
- `version`
- `hash`
- `elementTypesUsed`
- `embedded` (boolean)

Dependency collection:

- During export, scan scene elements for plugin-backed element types.
- Use the element registry to resolve each type to its plugin metadata.
- De-duplicate by `pluginId` and capture all `elementTypesUsed`.

## 2) Export UI: Optional Bundling (Option A)

Add an export dialog toggle:

- Label: "Embed required plugins in this file"
- Default: off

Export behavior:

- If enabled, include required `.mvmnt-plugin` binaries in the .mvt zip under `plugins/`.
- Mark `embedded: true` for those plugins in the manifest.
- If disabled, write only the manifest entries with `embedded: false`.

## 3) Import Flow: Install Prompt (Option A + B)

On import:

1. Read the `plugins` manifest.
2. Compare against installed/registered plugins for:
   - Presence
   - Version compatibility
   - Hash match (if known)
3. If embedded plugins are present, prompt:

- "This scene includes embedded plugins. Install them now?"
- Options: Install / Skip

If user chooses Install:

- Register embedded plugins immediately.
- Optionally persist to IndexedDB (with explicit consent).

If user chooses Skip:

- Continue loading with missing plugin handling (see placeholders).

If no embedded plugins but dependencies are missing:

- Show a warning with the missing plugin list and manual install path.

## 4) Missing Plugin Fallback (Option C)

When an element type is missing at runtime:

- Instantiate a placeholder element instead of skipping.
- Preserve original element config and bindings.
- Show a warning badge: "Missing plugin" with the original type name.
- Keep layout/transform intact to preserve scene composition.

Rehydration:

- When the plugin is installed later, re-run instantiation and swap the placeholder for the real element.

## 5) Safety + Integrity

- Verify embedded plugin hashes before installing.
- If hash mismatch, block install and warn the user.
- Persist installed embedded plugins to IndexedDB only with explicit consent.

## 6) Implementation Touchpoints

- Export pipeline: `exportScene()` and `DocumentGateway.build()`
- Import pipeline: `importScene()` and `DocumentGateway.apply()`
- Plugin persistence: `plugin-binary-store.ts`
- Runtime adapter: fallback placeholders + rehydrate on plugin install
- UI: export options + import install prompt

## 7) UX Copy (Initial Draft)

Export toggle:
- "Embed required plugins in this file"

Import prompt:
- Title: "Install embedded plugins?"
- Body: "This scene includes embedded plugins needed for some elements. Install them now?"
- Buttons: "Install" / "Skip"

Missing plugin warning:
- "Some elements are missing required plugins and are shown as placeholders."

## 8) Rollout

- Phase 1: Manifest + placeholders + missing plugin warnings.
- Phase 2: Embedded plugin packaging + import install prompt.
- Phase 3: Hash verification + optional persistence consent flow.
