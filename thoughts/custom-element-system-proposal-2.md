# Custom Scene Element System: Revised Proposal

_Revision Date: 10 February 2026_

## Goal

Make custom scene elements easier to create, package, and distribute without modifying the core codebase, while keeping the system safe, testable, and maintainable.

---

## Key Weaknesses in the Original Proposal

1. **Undefined packaging/runtime model**
   - The proposal mixes development-time TypeScript files with runtime `.mvmnt-plugin` bundles, but does not specify how bundles are loaded, versioned, or stored in the app. This is risky for reliability and security.

2. **Missing dependency + version strategy**
   - There is no clear policy for MVMNT version compatibility, peer dependencies, or schema evolution. Plugin breakage is likely.

3. **Limited validation surface**
   - Plugin validation is discussed, but lacks a concrete schema, checks for element type collisions, and safety rules for render objects.

4. **Operational gaps**
   - No plan for where plugins are stored, how they are removed/updated, or how failures are reported to users. Also missing upgrade/migration rules.

5. **Tooling assumptions**
   - `esbuild` and `archiver` are proposed but not integrated into the repository’s tooling or dependency strategy. The proposal is light on how scripts should be tested.

6. **Security scope is vague**
   - “Sandboxing” is listed long-term, but short-term limits are undefined. Plugins can potentially crash the renderer or leak data.

---

## Revised Strategy (Concise)

### Phase 1: Developer Experience (Immediate)

1. **Documentation**
   - Add [docs/creating-custom-elements.md](docs/creating-custom-elements.md) with:
     - Minimal example
     - Schema property reference
     - Common binding patterns
     - Debugging and testing guidance

2. **Templates**
   - Add [src/core/scene/elements/_templates/](src/core/scene/elements/_templates/) with 3-4 templates:
     - `basic-shape.ts`
     - `audio-reactive.ts`
     - `midi-notes.ts`
     - `text-display.ts`

3. **Plugin Scaffold Script**
   - `scripts/create-element.mjs`
   - Generates:
     - `plugins/{pluginName}/plugin.json`
     - `plugins/{pluginName}/{element}.ts`
   - Validates names and updates manifest.

4. **Project Scripts**
   - `npm run create-element`
   - `npm run build-plugin`

**Exit Criteria**: A developer can create and locally test a custom element without touching core registration files.

---

### Phase 2: Packaging + Validation (Short-Term)

1. **Define a Plugin Manifest Schema**
   - JSON schema at [docs/plugin-manifest.schema.json](docs/plugin-manifest.schema.json)
   - Required fields: `id`, `name`, `version`, `mvmntVersion`, `elements[]`
   - Optional: `author`, `description`, `homepage`, `license`, `capabilities`

2. **Package Format**
   - `.mvmnt-plugin` is a ZIP containing:
     - `manifest.json`
     - `elements/*.js`
     - `assets/` (optional)

3. **Build Script**
   - `scripts/build-plugin.mjs`
   - Steps:
     - Read and validate `plugin.json` against schema
     - Bundle element entries with `esbuild`
     - Write manifest + JS bundles to ZIP

4. **Validation Rules**
   - Element `type` must be unique per plugin
   - Disallow duplicates against built-in element types
   - Ensure `getConfigSchema()` returns a name + groups

**Exit Criteria**: A plugin bundle can be built and passes schema validation.

---

### Phase 3: Runtime Loading (Short-Term)

1. **Registry API**
   - `registerCustomElement(type, class, options)`
   - `unregisterElement(type)`
   - `hasElement(type)`

2. **Plugin Loader**
   - `src/core/scene/plugins/plugin-loader.ts`:
     - Accepts `.mvmnt-plugin` files
     - Reads `manifest.json`
     - Loads element bundles dynamically
     - Registers elements with category override

3. **Plugin Storage + State**
   - Plugins stored in app data folder (or browser IndexedDB if web-only)
   - Store `enabled/disabled` state in persistence layer
   - Auto-disable on load failure, report errors to UI

**Exit Criteria**: A user can import a plugin and enable/disable it across sessions.

---

### Phase 4: UI + Safety (Mid-Term)

1. **Settings Plugin Manager**
   - Dedicated tab in Settings modal
   - Import, enable/disable, remove
   - Error display for invalid bundles

2. **Safety Controls (Minimum Viable)**
   - Max render object count per element
   - Timeout limit on element render function
   - Capability flags (`audio-analysis`, `midi-events`)
   - Crash isolation: plugin error should not crash the app

**Exit Criteria**: Plugin UX is stable for end users and failure modes are contained.

---

## Compatibility + Versioning (Additions)

- `manifest.mvmntVersion` is required and checked at load time.
- Semver check to refuse incompatible plugins.
- Provide a `compatibility` section in docs for breaking changes.
- Consider `peerDependencies` in manifest for future expansion.

---

## Example Manifest (Concise)

```json
{
  "id": "com.user.my-awesome-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "mvmntVersion": "^0.9.0",
  "author": "Your Name",
  "description": "Custom visualization elements",
  "elements": [
    {
      "type": "spiralVisualizer",
      "name": "Spiral Visualizer",
      "description": "Spiral pattern that reacts to audio",
      "file": "spiral-visualizer.ts",
      "category": "Custom"
    }
  ],
  "capabilities": ["audio-analysis"]
}
```

---

## Immediate Next Steps

1. Add developer docs and templates.
2. Implement `scripts/create-element.mjs`.
3. Implement `scripts/build-plugin.mjs` and schema validation.
4. Add registry public API and minimal plugin loader.
5. Design settings UI (non-blocking, can follow after loader).

---

## Notes

- Keep plugin management in Settings, not in Developer Overlay.
- Plugins should always fail safely, with visible user feedback.
- Avoid touching core element registration for user plugins.
