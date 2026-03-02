# Plugin Embedding Flow Analysis

_Created: 10 February 2026_

## Executive Summary

This document analyzes MVMNT's plugin embedding system—how plugins are packaged within scene files, installed at import time, and how name/ID collisions are handled. It identifies confusing aspects for both users and developers, and proposes clarifications to the mental model.

---

## Mental Model: Three Plugin "Homes"

Plugins in MVMNT can live in three different places, which creates complexity:

1. **Browser Storage (IndexedDB)** — Global plugin registry, persisted across sessions
2. **Scene File (.mvt)** — Embedded plugins bundled inside a scene export
3. **Runtime Memory** — Active plugin instances registered in `sceneElementRegistry`

### Flow Diagram

```
User loads plugin.mvmnt-plugin
         ↓
    loadPlugin()
         ↓
    ┌─────────────────────────────┐
    │ 1. Unzip bundle             │
    │ 2. Parse manifest.json      │
    │ 3. Validate + version check │
    │ 4. Evaluate element code    │
    └─────────────┬───────────────┘
                  ↓
        registerCustomElement()
                  ↓
    ┌─────────────────────────────┐
    │ Registry checks:            │
    │ - Built-in conflict? ❌      │
    │ - Plugin conflict? ❌        │
    │ - Missing getConfigSchema? ❌│
    └─────────────┬───────────────┘
                  ↓
         ✅ Registered in memory
                  ↓
    Optional: persist to IndexedDB
                  ↓
         PluginBinaryStore.put()
```

**Key insight:** A plugin can be registered in memory (runtime) without being persisted to IndexedDB, or vice versa (stored but not loaded). This duality is a source of confusion.

---

## Embedding in Scene Files

### Export Flow

When exporting a scene with `embedPlugins: true`:

1. **Scene elements are scanned** for their `type` field
2. **Plugin ownership is resolved** via `sceneElementRegistry.getPluginId(type)`
3. **Plugin dependencies are collected** with metadata:
   - `pluginId` (e.g., `com.example.particles`)
   - `version` (e.g., `1.2.3`)
   - `hash` (SHA-256 of the plugin bundle)
   - `elementTypesUsed` (e.g., `['particle-emitter']`)
   - `embedded: true` (if bundle is included)
4. **Plugin binaries are bundled** inside the .mvt zip under `plugins/{pluginId}.mvmnt-plugin`
5. **Envelope is written** with a `plugins: []` section in `document.json`

### Import Flow

When importing a scene:

1. **Envelope is parsed** from `document.json`
2. **Plugin dependencies are assessed** (`assessPluginDependencies()`)
   - Check if plugin already installed
   - Verify version match (using semver)
   - Verify hash match (SHA-256)
3. **User is prompted** (if embedded plugins are missing):
   - "This scene includes embedded plugins needed for some elements. Install them now?"
   - If yes: "Remember these plugins on this browser for future projects?"
4. **Embedded plugins are installed** via `loadPlugin()` with `persist` flag
5. **Scene elements are hydrated** — if plugin is missing, element is skipped (no placeholder)

---

## Collision Detection & Handling

### 1. Built-in vs Plugin Conflict

**Registry Rule:** Plugins **cannot** override built-in element types.

```typescript
// In registerCustomElement()
if (this.builtInTypes.has(type)) {
    throw new Error(`Cannot register custom element '${type}': conflicts with built-in element`);
}
```

**Example:**
- Built-in: `timeUnitPianoRoll`
- Plugin attempts to register `timeUnitPianoRoll` → ❌ Throws error

**User Experience:** Plugin load fails with clear error message.

**Developer Experience:** Clear guardrail — built-ins are sacred.

### 2. Plugin vs Plugin Conflict (SAME type, DIFFERENT pluginId)

**Registry Rule:** Second plugin **cannot** register an already-registered type from a different plugin.

```typescript
const existingPluginId = this.pluginTypes.get(type);
if (existingPluginId && existingPluginId !== options.pluginId) {
    throw new Error(
        `Cannot register custom element '${type}': already registered by plugin '${existingPluginId}'`
    );
}
```

**Example:**
- Plugin A (`com.alice.effects`) registers `glow-effect`
- Plugin B (`com.bob.effects`) tries to register `glow-effect` → ❌ Throws error

**User Experience:** Second plugin load fails. First-loaded plugin wins.

**Developer Experience:** Must choose unique type names. Namespace conventions help (e.g., `alice-glow-effect`, `bob-glow-effect`).

### 3. Plugin vs Plugin Conflict (SAME pluginId, DIFFERENT version)

**Current Behavior:** Plugin with matching `pluginId` is blocked from loading if already present.

```typescript
const existingPlugin = usePluginStore.getState().plugins[manifest.id];
if (existingPlugin) {
    return {
        success: false,
        error: `Plugin '${manifest.id}' is already loaded`,
    };
}
```

**Example:**
- Plugin `com.alice.effects@1.0.0` is loaded
- User tries to load `com.alice.effects@2.0.0` → ❌ Blocked

**User Experience:** Must unload old version before loading new version. No hot-swap.

**Developer Experience:** Version upgrades require explicit unload/reload cycle.

### 4. Scene Element ID Collision (UNRELATED to plugins)

**Separate Namespace:** Scene element IDs (e.g., `pianoRoll_abc123`) are independent of plugin IDs or element types.

- Duplication is handled in `sceneStore.duplicateElement()` with uniqueness checks
- Element ID collisions are prevented by auto-renaming (e.g., `_copy`, `_copy_2`, etc.)
- No cross-contamination between plugin identity and element instance identity

---

## Confusing Aspects

### For Users

#### 1. **"Where do plugins live?"**

**Confusion:** Users don't have a clear mental model of IndexedDB vs embedded vs runtime.

**Scenario:**
- User loads `particle-fx.mvmnt-plugin` → gets prompt "Remember this plugin?"
- User clicks "Yes" → plugin is in IndexedDB
- User exports scene with `embedPlugins: false` → plugin is NOT in .mvt file
- User shares .mvt with a friend → friend's scene has missing elements (no plugin)
- User imports friend's scene → their local IndexedDB plugin is used (version may differ)

**Proposed Clarification:**
- Add visual indicator in UI showing "Plugin Source": `Browser Storage` vs `Embedded in Scene` vs `Not Saved`
- Export dialog should show: "✅ Embedded (portable)" vs "⚠️ Not embedded (requires separate install)"

#### 2. **"Why did my plugin disappear?"**

**Confusion:** Plugins can be unloaded without warning, breaking existing scenes.

**Scenario:**
- User has scene with plugin elements
- User unloads plugin (or plugin fails to load on startup)
- Elements silently fail to render (no visual placeholder)
- User doesn't realize plugin is missing

**Proposed Clarification:**
- Show placeholder elements for missing plugins ("⚠️ Plugin missing: com.alice.effects")
- Preserve element configuration so it can be restored when plugin is reinstalled
- Add "Missing Plugins" warning banner in scene editor

#### 3. **"Which version is this?"**

**Confusion:** Multiple versions of a plugin can exist (IndexedDB vs embedded) but only one can be active.

**Scenario:**
- User has `particles@1.0` in IndexedDB
- User imports scene with embedded `particles@2.0`
- User chooses "Install" → error: "Plugin already loaded"
- User must manually unload old version first

**Proposed Clarification:**
- Prompt should offer: "Replace existing version (1.0) with embedded version (2.0)?"
- Show version comparison in UI
- Allow side-by-side "safe mode" where embedded plugin loads with a temporary namespace

### For Developers

#### 1. **"How do I avoid type name collisions?"**

**Confusion:** No enforced namespace conventions.

**Scenario:**
- Developer creates plugin with type `slider`
- Another developer creates plugin with type `slider`
- Users who load both plugins will have one fail

**Proposed Clarification:**
- Document namespace convention: `{author}-{type}` (e.g., `alice-slider`, `bob-slider`)
- Manifest validator could warn on generic names
- Registry could suggest namespaced alternatives on collision

#### 2. **"What happens if my plugin code imports from @core/...?"**

**Confusion:** Plugin code must be bundled, but the bundler needs to know which imports are external.

**Current Behavior:**
- `mockRequire()` maps `@core/*` to `MVMNT.core.*` on `globalThis`
- If import is not available → plugin load fails with "Module not found"

**Scenario:**
- Developer writes: `import { SceneElement } from '@core/scene/elements/base';`
- Build tool bundles this into plugin
- At runtime, `mockRequire()` resolves to `globalThis.MVMNT.core.scene.elements.base`
- If MVMNT didn't expose this → plugin crashes

**Proposed Clarification:**
- Document exposed global APIs clearly
- Provide TypeScript declarations for `MVMNT.*` globals
- Plugin development kit should include externals configuration for bundler

#### 3. **"Can I depend on another plugin?"**

**Current Answer:** No. Plugins are isolated.

**Scenario:**
- Developer wants to create `alice-advanced-particles` that extends `alice-particles`
- No mechanism for plugin-to-plugin dependencies

**Proposed Clarification:**
- Document limitation explicitly
- Consider adding `peerDependencies` support in manifest (already partially present)

---

## Name/ID Clash Decision Matrix

| Scenario | Current Behavior | User Impact | Developer Guidance |
|----------|------------------|-------------|-------------------|
| Plugin type vs Built-in type | ❌ Blocked, error thrown | Plugin fails to load | Never use built-in names |
| Plugin A type vs Plugin B type | ❌ Blocked, error thrown | Second plugin fails | Use namespaced type names |
| Plugin A@v1 vs Plugin A@v2 | ❌ Blocked, error thrown | Must unload first | Explicit upgrade workflow |
| Scene element ID collision | ✅ Auto-renamed | Transparent | N/A |
| Plugin ID in IndexedDB vs embedded | ⚠️ Separate namespaces, first wins | Can cause version confusion | Check installed version before importing |

---

## Recommendations

### Short-Term (Quick Wins)

1. **Add visual plugin status indicators** in UI
   - Browser storage icon
   - Embedded badge on scene files
   - Version mismatch warnings

2. **Show placeholder for missing plugin elements**
   - Display: "⚠️ Missing plugin: {pluginId}"
   - Preserve element config for later restoration
   - Add "Install Plugin" button that opens plugin loader

3. **Improve collision error messages**
   - Suggest namespaced alternatives
   - Show which plugin owns the conflicting type
   - Link to plugin management UI

### Medium-Term (Design Changes)

4. **Plugin version upgrade flow**
   - Prompt: "Replace v1.0 with v2.0?"
   - Show breaking changes if available
   - Allow rollback to previous version

5. **Namespace conventions in manifest**
   - Validate type names follow pattern: `{author}-{name}`
   - Warn on generic names (`slider`, `button`, etc.)

6. **Dependency graph visualization**
   - Show which scene elements depend on which plugins
   - Highlight version mismatches
   - Preview impact of unloading a plugin

### Long-Term (Architecture)

7. **Plugin sandbox/versioning**
   - Allow multiple versions of same plugin to coexist
   - Scenes reference specific version
   - Registry maintains version map

8. **Plugin-to-plugin dependencies**
   - Support `peerDependencies` in manifest
   - Validate dependency graph on load
   - Error if circular dependencies detected

9. **Cloud plugin registry**
   - Auto-fetch missing plugins from catalog
   - Version resolution and compatibility checking
   - Signed/verified plugins for security

---

## Glossary

- **Plugin ID**: Unique identifier for a plugin (e.g., `com.example.particles`)
- **Element Type**: Type string for a scene element (e.g., `particle-emitter`)
- **Scene Element ID**: Runtime instance ID (e.g., `pianoRoll_abc123`)
- **Built-in Element**: Core element shipped with MVMNT (cannot be overridden)
- **Custom Element**: Element provided by a plugin
- **Embedded Plugin**: Plugin binary bundled inside a .mvt scene file
- **Persisted Plugin**: Plugin stored in browser's IndexedDB
- **Runtime Plugin**: Plugin currently loaded in memory and registered

---

## Related Documents

- [Plugin System Saving Plan](./plugin-system-saving-plan-1.md) — Implementation roadmap
- [Plugin System Research](./plugin-system-saving-research.md) — Original analysis
- [Runtime Plugin Loading API](../docs/runtime-plugin-loading.md) — Developer documentation

---

## Open Questions

1. **Should plugins be able to "claim" built-in types for extension?**
   - e.g., Plugin adds properties to existing `timeUnitPianoRoll`
   - Current answer: No, but worth considering

2. **Should embedded plugins auto-persist to IndexedDB?**
   - Current: User is prompted
   - Alternative: Always persist, with option to clear later

3. **How to handle plugin "soft deprecation"?**
   - e.g., Plugin author releases v2 with breaking changes
   - Old scenes need v1, new scenes use v2
   - No current mechanism for this

4. **Should plugin unload require confirmation if elements are present?**
   - Current: No warning
   - Proposed: "This will break 3 elements in your scene. Continue?"

