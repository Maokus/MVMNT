# Custom Scene Element System: Implementation Plan 1

_Revision Date: 10 February 2026_

## Overview

This plan expands the revised proposal into a phased implementation with explicit acceptance criteria. It also aligns Phase 1 (developer experience) with Phase 3 (runtime loading) so that scaffolding and templates produce elements that can be loaded, registered, and managed without touching core registration files.

Key integration decisions (Phase 1 + Phase 3):

- **Common manifest contract:** Phase 1 scaffolding generates a `plugin.json` that mirrors the runtime `manifest.json` schema so the loader can be exercised early in development.
- **Unified type registry:** Templates and generated elements use the same `registerCustomElement()` path the runtime loader uses, reducing drift between local dev and packaged plugins.
- **File layout parity:** Scaffolded directory structure matches the bundle layout (`elements/*.js`, `assets/`), making local testing and packaging consistent.
- **Local dev loader:** A dev-only loader path reads `plugins/*/plugin.json` directly to test Phase 3 registration without a `.mvmnt-plugin` bundle.

---

## Phase 0: Prep and Baselines

**Goal:** Establish shared schema and utilities that later phases depend on.

### Deliverables

1. Add [docs/plugin-manifest.schema.json](docs/plugin-manifest.schema.json).
2. Add [docs/creating-custom-elements.md](docs/creating-custom-elements.md) stub with planned sections.
3. Add a small utility module for version checks (semver range support).

### Acceptance Criteria

- The schema is valid JSON Schema and includes required fields (`id`, `name`, `version`, `mvmntVersion`, `elements[]`).
- A simple schema validation test passes using a sample manifest.
- The docs stub is discoverable in [docs/](docs/).

---

## Phase 1: Developer Experience + Local Dev Loading

**Goal:** Let developers create and run custom elements locally without touching core registration files, while using the same API that runtime loading will use.

### Deliverables

1. **Documentation**
   - Expand [docs/creating-custom-elements.md](docs/creating-custom-elements.md) with:
     - Minimal example plugin
     - Schema property reference
     - Common bindings
     - Debug + testing guidance

2. **Templates**
   - Add templates under [src/core/scene/elements/_templates/](src/core/scene/elements/_templates/):
     - `basic-shape.ts`
     - `audio-reactive.ts`
     - `midi-notes.ts`
     - `text-display.ts`

3. **Scaffold Script**
   - Add `scripts/create-element.mjs` that generates:
     - `plugins/{pluginName}/plugin.json`
     - `plugins/{pluginName}/{element}.ts`
   - Validates name uniqueness and updates a dev-only plugin list.

4. **Dev Loader (Phase 3-aligned)**
   - Add a dev-only loader that reads `plugins/*/plugin.json`, imports element modules, and registers them using `registerCustomElement()`.
   - Loader respects `enabled` state from persistence (if present) and logs failures.

5. **Project Scripts**
   - `npm run create-element`

### Acceptance Criteria

- A developer can run `npm run create-element` and get a valid `plugin.json` with at least one element stub.
- The dev loader registers the new element without modifying core registration files.
- Templates compile and render in the app with no TypeScript errors.
- Local dev elements appear in the element picker under the expected category.

---

## Phase 2: Packaging + Validation

**Goal:** Build distributable `.mvmnt-plugin` bundles with validation rules that match runtime expectations.

### Deliverables

1. **Manifest Schema**
   - Finalize [docs/plugin-manifest.schema.json](docs/plugin-manifest.schema.json) and keep it in sync with loader expectations.

2. **Build Script**
   - Add `scripts/build-plugin.mjs`:
     - Validates `plugin.json` against schema
     - Bundles each element entry with esbuild
     - Writes `manifest.json` and bundled JS into a ZIP `.mvmnt-plugin`

3. **Validation Rules**
   - Reject duplicate element types in a plugin
   - Reject element type collisions with built-in elements
   - Validate required fields from `getConfigSchema()`

4. **Project Scripts**
   - `npm run build-plugin`

### Acceptance Criteria

- Running `npm run build-plugin` produces a `.mvmnt-plugin` bundle.
- Invalid manifests fail with clear error messages.
- Bundled plugin passes a validation check before packaging.

---

## Phase 3: Runtime Loading + Registry API

**Goal:** Load, register, and manage plugins at runtime with minimal UI; use the same registry API as Phase 1 dev loader.

### Deliverables

1. **Registry API**
   - `registerCustomElement(type, class, options)`
   - `unregisterElement(type)`
   - `hasElement(type)`
   - Handles both built-in and plugin elements safely.

2. **Plugin Loader**
   - Add [src/core/scene/plugins/plugin-loader.ts](src/core/scene/plugins/plugin-loader.ts):
     - Accepts `.mvmnt-plugin` bundles
     - Reads `manifest.json`
     - Loads element bundles dynamically
     - Registers elements with category overrides
     - Enforces `mvmntVersion` compatibility

3. **Storage + State**
   - Store plugins in app data folder or IndexedDB for web builds.
   - Persist `enabled/disabled` per plugin.
   - Auto-disable on load failure and surface errors in logs.

4. **Phase 1 Alignment**
   - Reuse the same registry API and validation rules from Phase 1 dev loader.

### Acceptance Criteria

- Importing a `.mvmnt-plugin` enables its elements without app restart.
- Version-incompatible plugins are rejected with clear errors.
- Elements can be toggled on/off and persist across sessions.
- A failing plugin does not crash the renderer.

---

## Phase 4: UI + Safety Controls

**Goal:** Provide a stable user-facing plugin manager and minimal safety constraints.

### Deliverables

1. **Settings Plugin Manager**
   - New Settings tab for plugins
   - Import, enable/disable, remove
   - Error display for invalid bundles

2. **Safety Controls**
   - Max render object count per element
   - Timeout limit on render loop for plugin elements
   - Capability flags (`audio-analysis`, `midi-events`)

### Acceptance Criteria

- Users can manage plugins in Settings without developer tools.
- Safety limits prevent runaway render loops or excessive objects.
- Errors are visible and actionable in the UI.

---

## Phase 5: Hardening + Compatibility

**Goal:** Strengthen compatibility guarantees, migration paths, and operational safety.

### Deliverables

1. **Compatibility Policy**
   - Define breaking change policy
   - Document `mvmntVersion` requirements
   - Add optional `peerDependencies` in manifest

2. **Migration + Upgrades**
   - Add upgrade path rules in docs
   - Implement safe plugin update flow

3. **Extended Validation**
   - Optional static analysis for unsafe API usage
   - Enforced capability checks in runtime

### Acceptance Criteria

- Plugin upgrades preserve user state when possible.
- Breaking changes have clear documentation and tooling guidance.
- Capability checks enforce explicit permissions.

---

## Notes on Implementation Order

- Phase 1 should land after Phase 0. It introduces the dev loader and registry API usage patterns that Phase 3 relies on.
- Phase 2 can proceed in parallel with Phase 3 if the schema and registry API are stable.
- Phase 4 should follow after basic runtime loading is proven to be stable.
