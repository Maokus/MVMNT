# Custom Scene Element System: Research & Proposal

_Research Date: 10 February 2026_

## Executive Summary

This document analyzes the current scene element architecture and proposes a tiered approach to simplify custom element creation. The goal is to enable users to create and import custom visualizations without modifying core codebase files.

---

## Current System Architecture

### Element Lifecycle

1. **Definition**: Elements extend `SceneElement` base class from [`src/core/scene/elements/base.ts`](src/core/scene/elements/base.ts)
2. **Schema**: Static `getConfigSchema()` method returns `EnhancedConfigSchema` describing properties, groups, and UI
3. **Rendering**: Override `_buildRenderObjects(config, targetTime)` to generate `RenderObject[]`
4. **Registration**: Manual registration in [`scene-element-registry.ts`](src/core/scene/registry/scene-element-registry.ts) via `registerElementFromClass()`
5. **UI Integration**: [`ElementDropdown.tsx`](src/workspace/panels/scene-element/ElementDropdown.tsx) automatically populates from registry
6. **State Management**: Element configurations stored as bindings (constant, macro, audio-feature) in `sceneStore`

### Key Components

```
src/core/scene/elements/
├── base.ts                         # Base SceneElement class
├── index.ts                        # Exports all element classes
├── misc/                           # Basic elements (Background, Image, Text, etc.)
├── midi-displays/                  # MIDI visualization elements
└── audio-displays/                 # Audio-reactive elements

src/core/scene/registry/
└── scene-element-registry.ts       # Central registration (SceneElementRegistry class)

src/state/
├── sceneStore.ts                   # Zustand store for scene state
└── scene/
    ├── commandGateway.ts           # Command pattern for mutations
    └── storeElementFactory.ts      # Factory for creating element instances
```

### Property Binding System

Elements use a sophisticated binding system instead of direct property storage:

- **Constant Binding**: Static values
- **Macro Binding**: Dynamic values controlled by macros
- **Audio Feature Binding**: Dynamic values from audio analysis

```typescript
// Example: Getting a property value
const color = this.getProperty<string>('backgroundColor');

// Example: Setting a property (creates/updates binding)
this.setProperty('fontSize', 24);
```

### Schema Definition Pattern

Elements define their configuration UI declaratively:

```typescript
static getConfigSchema(): EnhancedConfigSchema {
    const base = super.getConfigSchema();
    return {
        name: 'Element Name',
        description: 'What this element does',
        category: 'MIDI Displays',  // Groups in dropdown
        groups: [
            {
                id: 'appearance',
                label: 'Appearance',
                variant: 'basic',
                collapsed: false,
                properties: [
                    {
                        key: 'color',
                        type: 'colorAlpha',
                        label: 'Bar Color',
                        default: '#60A5FAFF',
                        runtime: { transform: asTrimmedString, defaultValue: '#60A5FAFF' }
                    }
                ],
                presets: [
                    { id: 'blue', label: 'Blue Theme', values: { color: '#3B82F6' } }
                ]
            }
        ]
    };
}
```

### Available Property Types

- `string`, `number`, `boolean`
- `color`, `colorAlpha`
- `select` (dropdown with options)
- `file`, `file-midi`, `file-image`
- `font`
- `timelineTrackRef` (MIDI/audio track selector)
- `audioAnalysisProfile`

---

## Current Pain Points

### 1. High Barrier to Entry

**Problem**: Creating a custom element requires:
- Deep understanding of TypeScript, class inheritance
- Knowledge of the property binding system
- Understanding of the render object API
- Manual code edits to 3+ files in the core codebase
- Rebuild/restart development server

**Impact**: Only core developers can create elements; users cannot extend the system.

### 2. No External Plugin Support

**Problem**: All elements must be:
- Located in `src/core/scene/elements/`
- Imported in `index.ts`
- Manually registered in `scene-element-registry.ts`
- Committed to the main codebase
- No dedicated `plugins/` directory structure
- No build/packaging scripts for distribution

**Impact**: No way to distribute third-party elements, experiment without forking, or maintain separation between core and community code.

### 3. Registration Fragility

**Problem**: Registration requires:
```typescript
// In scene-element-registry.ts
import * as elements from '@core/scene/elements';

private registerDefaultElements() {
    this.registerElementFromClass('myElement', elements.MyElement);
    // ... 20+ other registrations
}
```

**Impact**: 
- Easy to forget registration step
- No validation or error checking
- Circular dependency risks
- Merge conflicts in multi-developer scenarios

### 4. Limited Discoverability

**Problem**:
- No central documentation for creating elements
- Examples scattered across codebase
- Schema type definitions complex and underdocumented
- No starter templates or scaffolding tools

**Impact**: Steep learning curve even for experienced developers.

### 5. No Validation or Safety

**Problem**:
- Malformed schemas fail silently or at runtime
- No type checking for property transforms
- Missing `getConfigSchema()` only logs console error
- Invalid render objects can crash the renderer

**Impact**: Difficult to debug custom elements; poor error messages.

---

## Proposed Solutions (Tiered Approach)

### Tier 1: Documentation & Developer Experience (Immediate)

**Goal**: Make it easier for developers to create elements in the current system.

#### 1.1 Comprehensive Guide

Create [`docs/creating-custom-elements.md`](docs/creating-custom-elements.md) with:
- Step-by-step tutorial for creating a simple element
- Complete working examples (static & audio-reactive)
- Property type reference table
- Common patterns and best practices
- Troubleshooting guide

#### 1.2 Starter Templates

Create reference implementations in `src/core/scene/elements/_templates/`:
```
_templates/
├── basic-shape.ts          # Minimal static element
├── audio-reactive.ts       # Audio feature consumer
├── midi-notes.ts          # MIDI event consumer
└── text-display.ts        # Text rendering example
```

Each template includes:
- Inline comments explaining every section
- Multiple property type examples
- Common rendering patterns
- Audio/MIDI integration examples

#### 1.3 Plugin Development Scripts

Create plugin development workflow in `scripts/`:

**Create Element Script** (`scripts/create-element.mjs`):
```bash
npm run create-element
# Prompts for:
# - Plugin name (e.g., "my-awesome-plugin")
# - Scene element name (e.g., "spiral-visualizer")

# Creates/updates:
# - plugins/my-awesome-plugin/                    (folder created if needed)
# - plugins/my-awesome-plugin/spiral-visualizer.ts
# - plugins/my-awesome-plugin/plugin.json         (manifest updated)
```

**Build Plugin Script** (`scripts/build-plugin.mjs`):
```bash
npm run build-plugin my-awesome-plugin

# Searches plugins/ directory
# Compiles all elements in plugins/my-awesome-plugin/
# Outputs: dist/my-awesome-plugin.mvmnt-plugin
# Ready for distribution and import by users
```

**Project Structure**:
```
plugins/
├── my-awesome-plugin/
│   ├── plugin.json              # Plugin manifest
│   ├── spiral-visualizer.ts     # Element 1
│   ├── particle-system.ts       # Element 2
│   └── shared-utils.ts          # Shared code
└── another-plugin/
    ├── plugin.json
    └── custom-element.ts
```

**Effort**: 2-3 days  
**Benefit**: Significantly reduces friction for plugin developers, establishes clear separation between core and plugins

---

### Tier 2: Plugin API & Dynamic Registration (Short-term)

**Goal**: Enable runtime registration without core code changes.

#### 2.0 UI Architecture: Settings vs Developer Overlay

**Clear Separation of Concerns**:

- **Settings Modal (User-Facing)**:
  - Plugin Manager (import, enable/disable, remove plugins)
  - General application settings
  - Audio/MIDI configuration
  - Workspace preferences
  - All features end-users interact with regularly

- **Developer Overlay (Debug/Development Only)**:
  - Performance metrics
  - Audio cache diagnostics
  - Feature subscription debugging
  - Memory profiling
  - Technical information not needed by typical users
  - _NOT for plugin management_ (user-facing feature)

This separation ensures plugins are treated as first-class features, not debugging tools.

#### 2.1 Public Registry API

Extend `SceneElementRegistry` with public methods:

```typescript
// In scene-element-registry.ts
export class SceneElementRegistry {
    // ... existing code ...
    
    /**
     * Register an element dynamically (for plugins/extensions)
     * @throws {Error} if type already registered
     */
    public registerCustomElement(
        type: string, 
        ElementClass: RegisterableSceneElement,
        options?: {
            allowOverwrite?: boolean;
            category?: string;
        }
    ): void {
        if (this.factories.has(type) && !options?.allowOverwrite) {
            throw new Error(`Element type '${type}' already registered`);
        }
        
        // Validate schema exists
        const schema = ElementClass.getConfigSchema();
        if (!schema || !schema.name) {
            throw new Error(`Invalid schema for element type '${type}'`);
        }
        
        this.registerElementFromClass(type, ElementClass);
        console.info(`[SceneElementRegistry] Registered custom element: ${type}`);
    }
    
    /**
     * Unregister an element (for hot-reloading)
     */
    public unregisterElement(type: string): boolean {
        const existed = this.factories.has(type);
        this.factories.delete(type);
        this.schemas.delete(type);
        return existed;
    }
    
    /**
     * Check if an element type is registered
     */
    public hasElement(type: string): boolean {
        return this.factories.has(type);
    }
}
```

#### 2.2 Plugin Loader System

Create `src/core/scene/plugins/plugin-loader.ts`:

```typescript
export interface SceneElementPlugin {
    id: string;
    name: string;
    version: string;
    author?: string;
    description?: string;
    elements: Array<{
        type: string;
        class: typeof SceneElement;
    }>;
}

export class PluginLoader {
    private loadedPlugins = new Map<string, SceneElementPlugin>();
    
    async loadPlugin(url: string): Promise<void> {
        // Dynamic import of plugin module
        const module = await import(/* webpackIgnore: true */ url);
        const plugin = module.default as SceneElementPlugin;
        
        // Validate plugin structure
        this.validatePlugin(plugin);
        
        // Register all elements
        for (const { type, class: ElementClass } of plugin.elements) {
            sceneElementRegistry.registerCustomElement(type, ElementClass, {
                category: plugin.name
            });
        }
        
        this.loadedPlugins.set(plugin.id, plugin);
        console.info(`[PluginLoader] Loaded plugin: ${plugin.name} (${plugin.elements.length} elements)`);
    }
    
    unloadPlugin(pluginId: string): void {
        const plugin = this.loadedPlugins.get(pluginId);
        if (!plugin) return;
        
        for (const { type } of plugin.elements) {
            sceneElementRegistry.unregisterElement(type);
        }
        
        this.loadedPlugins.delete(pluginId);
    }
    
    private validatePlugin(plugin: SceneElementPlugin): void {
        // Validation logic
    }
}
```

#### 2.3 Plugin Manifest Format

Define standard plugin structure:

```typescript
// my-custom-plugin.ts
import { SceneElement } from '@mvmnt/core';

class MyAwesomeElement extends SceneElement {
    // Implementation
}

export default {
    id: 'com.example.awesome-elements',
    name: 'Awesome Elements',
    version: '1.0.0',
    author: 'John Doe',
    description: 'Collection of awesome visualization elements',
    elements: [
        { type: 'awesomeSpiral', class: MyAwesomeElement }
    ]
} satisfies SceneElementPlugin;
```

#### 2.4 Plugin Manager UI (Settings Modal)

Add "Blender-like" plugin manager in settings modal:

```typescript
// src/components/settings/PluginManagerPanel.tsx
export function PluginManagerPanel() {
    const { plugins, enablePlugin, disablePlugin, removePlugin } = usePluginManager();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const handleImportPlugin = async (file: File) => {
        if (!file.name.endsWith('.mvmnt-plugin')) {
            toast.error('Invalid file type. Expected .mvmnt-plugin');
            return;
        }
        
        try {
            await pluginLoader.importPluginPackage(file);
            toast.success(`Plugin "${file.name}" imported successfully`);
        } catch (err) {
            toast.error(`Failed to import plugin: ${err.message}`);
        }
    };
    
    return (
        <div className="plugin-manager">
            <div className="plugin-header">
                <h3>Plugins</h3>
                <button onClick={() => fileInputRef.current?.click()}>
                    Import Plugin (.mvmnt-plugin)
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mvmnt-plugin"
                    onChange={(e) => e.target.files?.[0] && handleImportPlugin(e.target.files[0])}
                    style={{ display: 'none' }}
                />
            </div>
            
            <div className="plugin-list">
                {plugins.map((plugin) => (
                    <div key={plugin.id} className="plugin-item">
                        <div className="plugin-info">
                            <h4>{plugin.name}</h4>
                            <p className="text-sm text-neutral-400">
                                v{plugin.version} by {plugin.author}
                            </p>
                            <p className="text-xs text-neutral-500">
                                {plugin.elements.length} element(s)
                            </p>
                        </div>
                        
                        <div className="plugin-controls">
                            <Switch
                                checked={plugin.enabled}
                                onChange={() => plugin.enabled 
                                    ? disablePlugin(plugin.id) 
                                    : enablePlugin(plugin.id)
                                }
                            />
                            <button 
                                onClick={() => removePlugin(plugin.id)}
                                className="text-red-500"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                ))}
                
                {plugins.length === 0 && (
                    <p className="text-neutral-500 text-center py-8">
                        No plugins installed. Import a .mvmnt-plugin file to get started.
                    </p>
                )}
            </div>
        </div>
    );
}
```

**Key Features**: in `src/core/scene/elements/_templates/`
- [ ] Create `plugins/` directory structure
- [ ] Implement `scripts/create-element.mjs` (plugin + element creation)
- [ ] Implement `scripts/build-plugin.mjs` (compile to .mvmnt-plugin)
- [ ] Add inline documentation to base classes
- [ ] Add npm scripts: `npm run create-element`, `npm run build-plugin`

### Phase 2: Plugin System Core (Week 3-4)
- [ ] Extend registry with public API (`registerCustomElement`, `unregisterElement`)
- [ ] Implement `.mvmnt-plugin` package format (ZIP with manifest)
- [ ] Implement plugin loader with file import
- [ ] Define plugin manifest schema (`plugin.json`)
- [ ] Add validation and error handling
- [ ] Persistent plugin state (enabled/disabled tracking)
- [ ] Write plugin development guide

### Phase 3: Plugin Manager UI (Week 4-5)
- [ ] Create `PluginManagerPanel.tsx` component
- [ ] Add "Plugins" tab to Settings modal
- [ ] Implement file import UI (drag-and-drop + file picker)
- [ ] Implement enable/disable switches per plugin
- [ ] Implement remove plugin functionality
- [ ] Add plugin list with metadata display
- [ ] Toast notifications for plugin operations

### Phase 4: Testing & Polish (Week 5-6)
- [ ] Create 2-3 example plugins using scripts
- [ ] End-to-end testing (create → build → import → enable)
- [ ] Error handling improvements
- [ ] Documentation review
- [ ] Community feedback
- [ ] Performance testing with multiple plugins
**Benefit**: User-friendly plugin management, clear separation from developer tools

---

### Tier 3: Full Plugin Ecosystem (Long-term)

**Goal**: Create a thriving ecosystem of community-created elements.

#### 3.1 Package Format & Distribution

- Define `.mvmnt-plugin` package format (ZIP with manifest)
- File-based plugin installation (drag-and-drop)
- Plugin marketplace/registry service
- Version management and updates
- Dependency resolution between plugins

#### 3.2 Enhanced Developer Tools

- Visual schema builder (no-code element properties)
- Live preview during development
- Hot-reloading of plugin code
- Interactive debugging tools
- Performance profiling for custom elements

#### 3.3 Plugin Sandboxing & Security

- Capability-based security model
- Resource usage limits (CPU, memory)
- Safe execution environment (Web Workers?)
- Code signing and verification
- User permission system

#### 3.4 Publishing & Marketplace

- Official plugin repository
- CI/CD for plugin validation
- Documentation generation from code
- Usage analytics and ratings
- Monetization support for creators

**Effort**: Several weeks to months  
**Benefit**: Full extensibility, community growth, ecosystem development

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Create comprehensive developer guide
- [ ] Build starter templates
- [ ] Implement CLI scaffolding tool
- [ ] Add inline documentation to base classes
- [ ] Create video tutorial (optional)

### Phase 2: Plugin API (Week 3-4)
- [ ] Extend registry with public API
- [ ] Implement plugin loader
- [ ] Define plugin manifest format
- [ ] Add validation and error handling
- [ ] Build plugin manager UI
- [ ] Write plugin development guide

### Phase 3: Testing & Polish (Week 5)
- [ ] Create example plugins
- [ ] Integration testing
- [ ] Error handling improvements
- [ ] Documentation review
- [ ] Community feedback

### Phase 4: Ecosystem (Future)
- [ ] Package format specification
- [ ] Marketplace infrastructure
- [ ] Security & sandboxing
- [ ] Advanced tooling

---

## Risk Analysis

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Breaking changes to existing elements | Medium | High | Comprehensive test suite, backward compatibility layer |
| Plugin security vulnerabilities | High | Critical | Sandboxing, code review, capability model |
| Performance degradation | Low | Medium | Resource limits, profiling tools |
| Version conflicts | Medium | Medium | Semantic versioning, peer dependencies |

### Adoption Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Developers don't use plugin system | Medium | Medium | Excellent documentation, killer example plugins |
| Maintenance burden increases | Medium | High | Automated testing, clear contribution guidelines |
| Fragmentation of element ecosystem | Low | Medium | Curated official collection, quality standards |

---

## Success Metrics

### Tier 1 (Documentation)
- Time to create first custom element: < 30 minutes
- Developer satisfaction survey: > 4/5
- Reduction in element creation support requests

### Tier 2 (Plugin API)
- Time to load external plugin: < 5 seconds
- NumSet up plugin infrastructure**:
   - Create `plugins/` directory
   - Implement `scripts/create-element.mjs`
   - Implement `scripts/build-plugin.mjs`
   - Add npm scripts to package.json
3. **Build first example plugin** - Use scripts to validate workflow end-to-end
4. **Prototype plugin loader** - Test .mvmnt-plugin import and registration
5. **Design settings UI** - Mockup plugin manager panel before implementation
6. **Community preview** - Share roadmap and example plugin with early testers

## Development Scripts Implementation

### package.json additions:
```json
{
  "scripts": {
    "create-element": "node scripts/create-element.mjs",
    "build-plugin": "node scripts/build-plugin.mjs"
  }
}
```

### scripts/create-element.mjs (High-level outline):
```javascript
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';

// 1. Prompt for plugin name and element name
// 2. Check if plugins/{pluginName}/ exists, create if not
// 3. Generate element TypeScript file from template
// 4. Create/update plugin.json manifest
// 5. Output success message with next steps
```

### scripts/build-plugin.mjs (High-level outline):
```javascript
import { build } from 'esbuild';
import archiver from 'archiver';
import fs from 'fs/promises';

// 1. Validate plugin name argument
// 2. Find plugins/{pluginName}/ directory
// 3. Read and validate plugin.json
// 4. Bundle each element file with esbuild
// 5. Create ZIP archive with manifest and bundled files
// 6. Output to dist/{pluginName}.mvmnt-plugin
```

---

## Appendix A: Plugin Development Workflow

### Complete Development-to-User Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER WORKFLOW                           │
└─────────────────────────────────────────────────────────────────────┘

1. Create Element
   $ npm run create-element
   ? Plugin name: my-awesome-plugin
   ? Scene element name: spiral-visualizer
   
   → Creates: plugins/my-awesome-plugin/spiral-visualizer.ts
   → Updates: plugins/my-awesome-plugin/plugin.json

2. Develop Element
   - Edit spiral-visualizer.ts
   - Implement getConfigSchema()
   - Implement _buildRenderObjects()
   - Test locally (if core integration exists)

3. Add More Elements (Optional)
   $ npm run create-element
   ? Plugin name: my-awesome-plugin  [existing]
   ? Scene element name: particle-system
   
   → Adds: plugins/my-awesome-plugin/particle-system.ts
   → Updates plugin.json with new element

4. Build Plugin Package
   $ npm run build-plugin my-awesome-plugin
   
   → Bundles all elements
   → Creates: dist/my-awesome-plugin.mvmnt-plugin (ZIP)
   → Ready for distribution!

5. Distribute
   - Share .mvmnt-plugin file
   - Upload to GitHub releases
   - Post on community forum
   - Submit to plugin marketplace (future)

┌─────────────────────────────────────────────────────────────────────┐
│                          USER WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────┘

1. Download Plugin
   - User downloads my-awesome-plugin.mvmnt-plugin

2. Import Plugin
   - Opens MVMNT
   - Settings → Plugins tab
   - Click "Import Plugin (.mvmnt-plugin)"
   - Select downloaded file
   
   → Plugin appears in list (disabled by default)

3. Enable Plugin
   - Toggle switch for "My Awesome Plugin"
   - Elements register with scene system
   
   → "Spiral Visualizer" and "Particle System" now available

4. Use Elements
   - Click "+ Add Element" in workspace
   - See new category: "My Awesome Plugin"
   - Add "Spiral Visualizer" to scene
   - Configure properties like any built-in element
   
   → Full integration with property panels, macros, etc.

5. Manage Plugins
   - Disable plugin: Elements removed from dropdown
   - Re-enable: Elements available again
   - Remove: Uninstalls plugin completely
```

---

### 1. Creating a New Plugin

```bash
# Run the create element script
npm run create-element

# Prompts:
? Plugin name: my-awesome-plugin
? Scene element name: spiral-visualizer

# Output:
✓ Created plugins/my-awesome-plugin/
✓ Created plugins/my-awesome-plugin/plugin.json
✓ Created plugins/my-awesome-plugin/spiral-visualizer.ts
✓ Updated plugin manifest with new element
```

### 2. Plugin Folder Structure

```
plugins/
└── my-awesome-plugin/
    ├── plugin.json                 # Plugin manifest
    ├── spiral-visualizer.ts        # Element 1 (created by script)
    ├── particle-system.ts          # Element 2 (added later)
    ├── shared-utils.ts             # Shared utilities (optional)
    └── README.md                   # Documentation (optional)
```

### 3. Plugin Manifest (`plugin.json`)

Auto-generated and updated by `create-element` script:

```json
{
  "id": "com.user.my-awesome-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "mvmntVersion": "^0.9.0",
  "author": "Your Name",
  "description": "Custom visualization elements",
  "homepage": "",
  "license": "MIT",
  "elements": [
    {
      "type": "spiralVisualizer",
      "name": "Spiral Visualizer",
      "description": "Spiral pattern that reacts to audio",
      "file": "spiral-visualizer.ts",
      "category": "Custom"
    },
    {
      "type": "particleSystem",
      "name": "Particle System",
      "description": "Particle system with physics",
      "file": "particle-system.ts",
      "category": "Custom"
    }
  ],
  "capabilities": [
    "audio-analysis",
    "midi-events"
  ]
}
```

### 4. Building the Plugin Package

```bash
# Build plugin into distributable format
npm run build-plugin my-awesome-plugin

# Output:
✓ Found plugin: plugins/my-awesome-plugin/
✓ Validated plugin.json
✓ Bundled 2 element(s)
✓ Created dist/my-awesome-plugin.mvmnt-plugin
✓ Package size: 24.5 KB

# Share the .mvmnt-plugin file with users!
```

### 5. Import Workflow (User Perspective)

1. User downloads `my-awesome-plugin.mvmnt-plugin`
2. Opens MVMNT → Settings → Plugins tab
3. Clicks "Import Plugin (.mvmnt-plugin)" button
4. Selects the downloaded file
5. Plugin appears in list with enable/disable switch
6. Enables plugin → Elements appear in "Add Element" dropdown
7. Can now add "Spiral Visualizer" and "Particle System" to scenes

### 6. Package Format (.mvmnt-plugin)

A `.mvmnt-plugin` file is a ZIP archive containing:

```
my-awesome-plugin.mvmnt-plugin  (ZIP archive)
├── manifest.json               # Plugin metadata
├── elements/
│   ├── spiral-visualizer.js    # Bundled element 1
│   └── particle-system.js      # Bundled element 2
└── assets/                     # Optional
    ├── icon.png               # Plugin icon
    └── preview.jpg            # Screenshot
```

**Manifest includes:**
- Plugin metadata (name, version, author)
- Element definitions (types, names, categories)
- Required MVMNT version
- Capabilities/permissions needed },
    {
      "type": "awesomeParticles",
      "name": "Awesome Particles", 
      "description": "Particle system with physics"
    }
  ],
  "dependencies": {},
  "capabilities": [
    "audio-analysis",
    "midi-events"
  ]
}
```

---

## Appendix B: Property Schema Reference

### Complete Property Type Definitions

```typescript
// All available property types with examples

// Text input
{
    key: 'title',
    type: 'string',
    label: 'Title',
    default: 'Hello World',
    runtime: { transform: asTrimmedString, defaultValue: '' }
}

// Numeric slider/input
{
    key: 'speed',
    type: 'number',
    label: 'Speed',
    default: 1.0,
    min: 0,
    max: 10,
    step: 0.1,
    runtime: { transform: asNumber, defaultValue: 1.0 }
}

// Checkbox
{
    key: 'enabled',
    type: 'boolean',
    label: 'Enabled',
    default: true,
    runtime: { transform: asBoolean, defaultValue: true }
}

// Color picker (RGB)
{
    key: 'color',
    type: 'color',
    label: 'Color',
    default: '#FF0000',
    runtime: { transform: asTrimmedString, defaultValue: '#FF0000' }
}

// Color picker with alpha (RGBA)
{
    key: 'backgroundColor',
    type: 'colorAlpha',
    label: 'Background',
    default: '#00000080',
    runtime: { transform: asTrimmedString, defaultValue: '#00000080' }
}

// Dropdown select
{
    key: 'mode',
    type: 'select',
    label: 'Display Mode',
    default: 'bars',
    options: [
        { value: 'bars', label: 'Bars' },
        { value: 'dots', label: 'Dots' },
        { value: 'line', label: 'Line' }
    ],
    runtime: { transform: asTrimmedString, defaultValue: 'bars' }
}

// Font selector (integrates with font manager)
{
    key: 'fontFamily',
    type: 'font',
    label: 'Font',
    default: 'Inter',
    runtime: { transform: asTrimmedString, defaultValue: 'Inter' }
}

// File upload (generic)
{
    key: 'dataFile',
    type: 'file',
    label: 'Data File',
    accept: '.json,.csv',
    runtime: { transform: asTrimmedString, defaultValue: null }
}

// MIDI file upload
{
    key: 'midiFile',
    type: 'file-midi',
    label: 'MIDI File',
    runtime: { transform: asTrimmedString, defaultValue: null }
}

// Image file upload
{
    key: 'backgroundImage',
    type: 'file-image',
    label: 'Background Image',
    runtime: { transform: asTrimmedString, defaultValue: null }
}

// Timeline track reference (MIDI or audio)
{
    key: 'midiTrackId',
    type: 'timelineTrackRef',
    label: 'MIDI Track',
    default: null,
    allowedTrackTypes: ['midi'],
    runtime: { transform: asTrimmedString, defaultValue: null }
}

// Audio track with audio feature selection
{
    key: 'audioTrackId',
    type: 'timelineTrackRef',
    label: 'Audio Track',
    default: null,
    allowedTrackTypes: ['audio'],
    runtime: { transform: asTrimmedString, defaultValue: null }
}

// Audio analysis profile (advanced)
{
    key: 'analysisProfile',
    type: 'audioAnalysisProfile',
    label: 'Analysis Profile',
    trackPropertyKey: 'audioTrackId',  // Links to audio track property
    runtime: { transform: asTrimmedString, defaultValue: null }
}
```

### Property Transform Functions

```typescript
// Built-in transforms (from base.ts)
import { 
    asNumber,         // Converts to number, undefined if invalid
    asBoolean,        // Converts to boolean (true/false/'true'/'false'/0/1)
    asString,         // Converts to string
    asTrimmedString   // Converts to trimmed string, undefined if empty
} from '@core/scene/elements/base';

// Custom transform example
const asPercentage: PropertyTransform<number> = (value, element) => {
    const num = asNumber(value, element);
    if (num === undefined) return undefined;
    return Math.max(0, Math.min(100, num)) / 100;  // Clamp to 0-1
};
```

---

## Appendix C: Minimal Working Element

```typescript
// src/core/scene/elements/custom/hello-world.ts

import { SceneElement, asString } from '../base';
import { Text, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types';

export class HelloWorldElement extends SceneElement {
    constructor(id: string = 'helloWorld', config: { [key: string]: any } = {}) {
        super('helloWorld', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Hello World',
            description: 'Simple text display element',
            category: 'Custom',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'message',
                            type: 'string',
                            label: 'Message',
                            default: 'Hello, World!',
                            runtime: { transform: asString, defaultValue: 'Hello, World!' }
                        }
                    ]
                }
            ]
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const { canvas } = config;
        const message = this.getProperty<string>('message') ?? 'Hello, World!';
        
        const text = new Text(
            message,
            canvas.width / 2,
            canvas.height / 2,
            'Arial',
            48,
            '#FFFFFF',
            'center'
        );

        return [text];
    }
}
```

**Registration (in scene-element-registry.ts):**
```typescript
import { HelloWorldElement } from '@core/scene/elements/custom/hello-world';

private registerDefaultElements() {
    // ... existing registrations ...
    this.registerElementFromClass('helloWorld', HelloWorldElement);
}
```

**Export (in elements/index.ts):**
```typescript
export { HelloWorldElement } from './custom/hello-world';
```

---

## Appendix D: Audio-Reactive Element Example

```typescript
// src/core/scene/elements/custom/audio-pulse.ts

import { SceneElement, asNumber, asTrimmedString } from '../base';
import { Arc, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types';
import { getFeatureData } from '@audio/features/sceneApi';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';

// Declare audio feature requirements
registerFeatureRequirements('audioPulse', [{ feature: 'rms' }]);

export class AudioPulseElement extends SceneElement {
    constructor(id: string = 'audioPulse', config: { [key: string]: any } = {}) {
        super('audioPulse', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Audio Pulse',
            description: 'Circle that pulses with audio volume (RMS)',
            category: 'Custom',
            groups: [
                ...base.groups,
                {
                    id: 'audioSource',
                    label: 'Audio Source',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'audioTrackId',
                            type: 'timelineTrackRef',
                            label: 'Audio Track',
                            default: null,
                            allowedTrackTypes: ['audio'],
                            runtime: { transform: asTrimmedString, defaultValue: null }
                        }
                    ]
                },
                {
                    id: 'appearance',
                    label: 'Appearance',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'baseRadius',
                            type: 'number',
                            label: 'Base Radius',
                            default: 100,
                            min: 10,
                            max: 500,
                            step: 10,
                            runtime: { transform: asNumber, defaultValue: 100 }
                        },
                        {
                            key: 'pulseMagnitude',
                            type: 'number',
                            label: 'Pulse Strength',
                            default: 2.0,
                            min: 0,
                            max: 5,
                            step: 0.1,
                            runtime: { transform: asNumber, defaultValue: 2.0 }
                        },
                        {
                            key: 'color',
                            type: 'colorAlpha',
                            label: 'Color',
                            default: '#FF6B6BFF',
                            runtime: { transform: asTrimmedString, defaultValue: '#FF6B6BFF' }
                        }
                    ]
                }
            ]
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        // Get audio track
        const trackId = this.getProperty<string>('audioTrackId');
        if (!trackId) return [];  // No audio source selected

        // Sample RMS feature at current time
        const rmsData = getFeatureData(this, trackId, 'rms', targetTime, {
            smoothing: 0  // No smoothing for responsive pulse
        });

        if (!rmsData || !rmsData.values || rmsData.values.length === 0) {
            return [];  // No audio data available
        }

        // Get property values
        const baseRadius = this.getProperty<number>('baseRadius') ?? 100;
        const pulseMagnitude = this.getProperty<number>('pulseMagnitude') ?? 2.0;
        const color = this.getProperty<string>('color') ?? '#FF6B6BFF';

        // Calculate pulse radius based on RMS
        const rms = rmsData.values[0];  // Mono or first channel
        const pulseRadius = baseRadius * (1 + rms * pulseMagnitude);

        // Create circle centered on canvas
        const { canvas } = config;
        const circle = new Arc(
            canvas.width / 2,
            canvas.height / 2,
            pulseRadius,
            0,
            Math.PI * 2,
            true,  // filled
            color
        );

        return [circle];
    }
}
```

This element:
- Reads RMS audio data from selected track
- Scales a circle based on audio loudness
- Updates in real-time during playback
- Uses the property binding system for all configuration
- Follows all architectural patterns

---

*End of Proposal*
