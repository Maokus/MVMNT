# Custom Scene Element System: Implementation Plan 1

_Revision Date: 10 February 2026_
_Phase 2 Completed: 10 February 2026_
_Phase 3 Completed: 10 February 2026_
_Phase 4 Completed: 10 February 2026_

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

## Phase 2: Packaging + Validation ✅ COMPLETED

**Goal:** Build distributable `.mvmnt-plugin` bundles with validation rules that match runtime expectations.

### Deliverables

1. **Manifest Schema** ✅
   - Finalized [docs/plugin-manifest.schema.json](docs/plugin-manifest.schema.json)
   - Relaxed category validation to support plugin-specific categories while recommending standard ones
   - Schema is in sync with loader expectations

2. **Build Script** ✅
   - Added [scripts/build-plugin.mjs](scripts/build-plugin.mjs):
     - Validates `plugin.json` against schema requirements
     - Bundles each element entry with esbuild
     - Writes `manifest.json` and bundled JS into a ZIP `.mvmnt-plugin`
     - Configures path aliases for @core, @audio, @utils, etc.
     - Minifies output for production

3. **Validation Rules** ✅
   - Rejects duplicate element types within a plugin
   - Rejects element type collisions with built-in elements
   - Validates required fields (id, name, version, mvmntVersion, elements)
   - Validates element entry files exist
   - Validates element classes have required methods (getConfigSchema, _buildRenderObjects)
     - Supports `override` keyword for methods
   - Provides clear error messages for all validation failures

4. **Project Scripts** ✅
   - Added `npm run build-plugin [plugin-dir]`
   - Lists available plugins when run without arguments
   - Produces `.mvmnt-plugin` bundles in `dist/` directory

### Acceptance Criteria

- ✅ Running `npm run build-plugin` produces a `.mvmnt-plugin` bundle
- ✅ Invalid manifests fail with clear error messages
- ✅ Bundled plugin passes a validation check before packaging
- ✅ Built-in element type collisions are detected and rejected
- ✅ Duplicate element types within a plugin are detected and rejected
- ✅ Successfully tested with existing myplugin (5 elements, 243 KB bundle)

### Implementation Notes

- Category validation was relaxed to support plugin-specific categories (like plugin IDs) to maintain compatibility with Phase 1
- Element class validation detects both `static getConfigSchema()` and `static override getConfigSchema()`
- Element render implementation checks for both `render()` and `_buildRenderObjects()` methods
- Uses fflate for ZIP compression with level 9 (maximum compression)
- External dependencies (@core, react, react-dom, etc.) are not bundled to avoid duplication
- Path aliases are properly resolved during bundling

---

## Phase 3: Runtime Loading + Registry API ✅ COMPLETED

**Goal:** Load, register, and manage plugins at runtime with minimal UI; use the same registry API as Phase 1 dev loader.

### Deliverables

1. **Registry API** ✅
   - Added `registerCustomElement(type, class, options)` for plugin elements
   - Added `unregisterElement(type)` to remove custom elements
   - Added `hasElement(type)` to check element existence
   - Added `isBuiltIn(type)` to distinguish built-in vs custom elements
   - Added `getPluginId(type)` to get the plugin that registered an element
   - Added `unregisterPlugin(pluginId)` to unload all elements from a plugin
   - Handles both built-in and plugin elements safely with proper validation

2. **Plugin Loader** ✅
   - Added [src/core/scene/plugins/plugin-loader.ts](src/core/scene/plugins/plugin-loader.ts):
     - `loadPlugin(bundleData)` - Accepts `.mvmnt-plugin` bundles
     - `unloadPlugin(pluginId)` - Unloads and cleans up a plugin
     - `reloadPluginFromStorage(pluginId)` - Reloads a plugin from IndexedDB
     - `loadAllPluginsFromStorage()` - Loads all plugins on app startup
     - Reads and validates `manifest.json`
     - Loads element bundles dynamically using Function constructor
     - Registers elements with category overrides
     - Enforces `mvmntVersion` compatibility via semver range checking

3. **Storage + State** ✅
   - Added [src/persistence/plugin-binary-store.ts](src/persistence/plugin-binary-store.ts):
     - IndexedDB-based storage for plugin bundles
     - Memory cache fallback for better performance
     - Similar pattern to existing FontBinaryStore
   - Added [src/state/pluginStore.ts](src/state/pluginStore.ts):
     - Zustand store for plugin state management
     - Tracks `enabled/disabled` per plugin
     - Stores error messages for failed loads
     - Tracks loading state during async operations
   - Plugins auto-disable on load failure and surface errors in logs

4. **Phase 1 Alignment** ✅
   - Uses the same `registerCustomElement()` API as Phase 1 dev loader
   - Shares validation rules between dev and runtime loading
   - App initialization calls `loadAllPluginsFromStorage()` to restore plugins

5. **Version Compatibility** ✅
   - Added [src/core/scene/plugins/version-check.ts](src/core/scene/plugins/version-check.ts):
     - Supports caret ranges (^1.0.0)
     - Supports tilde ranges (~1.0.0)
     - Supports comparison operators (>=, >, <=, <)
     - Supports compound ranges (>=1.0.0 <2.0.0)
     - Supports OR conditions (||)
     - Full test coverage for version compatibility

### Acceptance Criteria

- ✅ Importing a `.mvmnt-plugin` enables its elements without app restart
- ✅ Version-incompatible plugins are rejected with clear errors
- ✅ Elements can be toggled on/off and persist across sessions
- ✅ A failing plugin does not crash the renderer
- ✅ All existing tests continue to pass (388 tests passing)
- ✅ New tests validate plugin API functionality (30 new tests)

### Implementation Notes

- Plugin bundles are stored in IndexedDB with the plugin ID as the key
- Bundled element code is loaded via Function constructor to create module environment
- External dependencies (React, @core/, etc.) are resolved via global scope
- Registry tracks built-in elements separately to prevent accidental unregistration
- Plugin elements can override category while preserving other schema properties
- Error handling ensures partial plugin loads succeed if at least one element loads
- Full TypeScript validation passes with zero errors

---

## Phase 4: UI + Safety Controls ✅ COMPLETED

**Goal:** Provide a stable user-facing plugin manager and minimal safety constraints.

### Deliverables

1. **Settings Plugin Manager** ✅
   - Added [src/pages/PluginsPage.tsx](src/pages/PluginsPage.tsx)
   - Import .mvmnt-plugin bundles via file picker
   - Enable/disable plugins dynamically
   - Remove plugins with confirmation
   - Error display for invalid bundles and failed loads
   - Shows plugin metadata (name, version, author, description, homepage)
   - Lists all element types provided by each plugin
   - Integrated into app routing at `/plugins`
   - Added link from home page

2. **Safety Controls** ✅
   - Added [src/core/scene/plugins/plugin-safety.ts](src/core/scene/plugins/plugin-safety.ts):
     - `withRenderSafety()` - Wraps render calls with timeout and error handling
     - `limitRenderObjects()` - Enforces max render object count per element
     - `checkCapability()` - Validates element capabilities
     - `DEFAULT_SAFETY_CONFIG` - Configurable safety limits
   - Max render object count: 10,000 per element
   - Timeout limit: 100ms per render call
   - Capability flags tracked in registry (`audio-analysis`, `midi-events`, `network`, `storage`)
   - Plugin elements auto-disable on errors
   - Safety controls applied automatically to all plugin elements in [src/core/scene/elements/base.ts](src/core/scene/elements/base.ts)
   - Lazy registry loading to avoid circular dependencies

3. **Testing** ✅
   - Added [src/core/scene/plugins/__tests__/plugin-safety.test.ts](src/core/scene/plugins/__tests__/plugin-safety.test.ts)
   - 23 new tests for safety controls
   - All 441 tests passing (111 test files)
   - Build and lint passing

### Acceptance Criteria

- ✅ Users can manage plugins in Settings without developer tools
- ✅ Safety limits prevent runaway render loops or excessive objects
- ✅ Errors are visible and actionable in the UI
- ✅ Plugin elements can be toggled on/off without app restart
- ✅ Import errors are clearly displayed to users
- ✅ All tests pass including new safety control tests

### Implementation Notes

- Plugins page uses Zustand store for reactive state management
- File picker validates `.mvmnt-plugin` extension before import
- Safety controls use `performance.now()` for accurate timing
- Console warnings/errors for debugging slow renders and violations
- Lazy `require()` in base.ts prevents circular dependency with registry
- Safety controls only applied to plugin elements (built-ins unchanged)
- TypeScript strict mode compliance

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
