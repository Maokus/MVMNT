# Creating Custom Elements

_Last Updated: 7 May 2026_

This guide explains how to create custom scene elements for MVMNT using the plugin system.

## Table of Contents

- [Overview](#overview)
- [Public Plugin API (Required)](#public-plugin-api-required)
- [Plugin Manifest Reference](#plugin-manifest-reference)
- [Element API](#element-api)
- [Reading MIDI and Audio Data](#reading-midi-and-audio-data)
- [Layout Calculation](#layout-calculation)
- [Common Bindings](#common-bindings)
- [Categories and Organization](#categories-and-organization)
- [Testing and Debugging](#testing-and-debugging)
- [Packaging and Distribution](#packaging-and-distribution)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Custom elements extend MVMNT's visualization capabilities by providing new types of visual elements that can be added to scenes. Elements can react to audio, MIDI, or other data sources.

Key concepts:

- **Scene Elements**: Visual objects that render on the canvas (shapes, text, effects, etc.)
- **Plugin System**: Bundles custom elements for distribution and runtime loading
- **Property Bindings**: Dynamic property system supporting constants, macros, and data-driven values
- **Render Objects**: Low-level primitives (Rectangle, Arc, Text, etc.) that define visual output

## Public Plugin API (Required)

Plugin-facing element code must use the stable host API from `@mvmnt/plugin-sdk`.

Do not import host internals (`@state/*`, `@selectors/*`, `@audio/features/sceneApi`) from plugin/template code.

Use `getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead,...])` as documented in [Plugin API v1](plugin-api-v1.md).

## Getting Started

See [Plugin Quickstart](./plugin-quickstart.md).

## Plugin Manifest Reference

Custom elements are distributed as plugins with a `manifest.json` file. The manifest describes the plugin and its elements.

See [plugin-manifest.schema.json](plugin-manifest.schema.json) for the complete schema definition.

### Required Fields

- `id`: Unique plugin identifier (reverse domain notation recommended)
- `name`: Human-readable plugin name
- `version`: Semantic version (e.g., `1.0.0`)
- `apiVersion`: Compatible Plugin API version range (e.g., `^1.0.0`)
- `elements`: Array of element definitions

### Optional Fields

- `description`: Human-readable plugin description
- `author`: Plugin author name or organization
- `homepage`: Plugin homepage or repository URL
- `license`: Plugin license identifier
- `peerDependencies`: Other plugins required by this plugin

### Element Definition Fields

Each element in the `elements` array requires:

- `type`: Unique element type identifier (kebab-case, e.g., `my-element`)
- `entry`: Path to element TypeScript/JavaScript file

## Element API

Custom elements extend the `SceneElement` base class and implement specific methods to define behavior.

### Base Class

```typescript
import { SceneElement } from '@mvmnt/plugin-sdk';

export class MyElement extends SceneElement {
    constructor(id: string = 'myElement', config: Record<string, unknown> = {}) {
        super('my-element-type', id, config);
    }
}
```

**Constructor Parameters:**

- `type`: Unique element type identifier (must match manifest)
- `id`: Instance identifier (auto-generated if not provided)
- `config`: Initial property configuration

### Configuration Schema

The `getConfigSchema()` static method defines the element's configurable properties and UI layout:

```typescript
static override getConfigSchema(): EnhancedConfigSchema {
    const base = super.getConfigSchema();

    return {
        ...base,
        name: 'My Element',           // Display name
        description: 'Element desc',  // Description
        category: 'Custom',           // UI category
        tabs: [
            {
                id: 'transform',
                label: 'Transform',
                groups: base.tabs[0].groups,
            },
            {
                id: 'properties',     // Unique tab ID
                label: 'Properties',  // Tab label
                groups: [
                    {
                        id: 'mySettings',  // Unique group ID
                        label: 'My Settings',
                        collapsed: false,  // Initially collapsed?
                        properties: [
                            // Property definitions...
                        ],
                        presets: [         // Optional presets
                            {
                                id: 'preset1',
                                label: 'Preset 1',
                                values: { prop1: 'value1' }
                            }
                        ]
                    },
                ],
            },
        ],
    };
}
```

**Property Factory Helpers (Recommended):**

`@mvmnt/plugin-sdk` exports `prop`, `tab`, `section`, `propGroup`, and `insertElementConfig`. These reduce boilerplate by pre-filling the `runtime` transform, keeping the base Transform tab, and grouping your element settings into property-panel tabs:

```typescript
import { prop, insertElementConfig, tab, section } from '@mvmnt/plugin-sdk';

static override getConfigSchema(): EnhancedConfigSchema {
    return insertElementConfig(super.getConfigSchema(), {
        name: 'My Element',
        description: 'Element description',
        category: 'Custom',
    }, [
        tab.content([
            section.content([
                prop.string('label', 'Label', 'Hello'),
                prop.boolean('showLabel', 'Show Label', true),
                prop.midiTrack('midiTrackId', 'MIDI Track'),
                prop.audioTrack('audioTrackId', 'Audio Track'),
                prop.file('imageFile', 'Image', { accept: 'image/*' }),
            ]),
        ]),
        tab.appearance([
            section.appearance([
                prop.number('size', 'Size', 100, { min: 10, max: 500, step: 1 }),
                prop.colorAlpha('color', 'Color', '#3B82F6FF'),
                prop.select('mode', 'Mode', 'circle', ['circle', 'square']),
                prop.font('fontFamily', 'Font', 'Inter'),
            ]),
        ]),
    ]);
}
```

`insertElementConfig(base, overrides, pluginTabs)` prepends the base Transform tab automatically. For simple elements, use `tab.properties([...groups])`; for larger elements, split groups into `tab.content`, `tab.appearance`, `tab.grid`, `tab.animation`, `tab.advanced`, or `tab.custom(id, label, groups)`.

Available `prop.*` factories:

| Factory                                            | Type               | Notes                                            |
| -------------------------------------------------- | ------------------ | ------------------------------------------------ |
| `prop.number(key, label, default, opts?)`          | `number`           | `opts`: `min`, `max`, `step`                     |
| `prop.range(key, label, default, opts?)`           | `range`            | Same as number but renders as a slider           |
| `prop.boolean(key, label, default, opts?)`         | `boolean`          | Checkbox                                         |
| `prop.string(key, label, default, opts?)`          | `string`           | Plain text input                                 |
| `prop.colorAlpha(key, label, default, opts?)`      | `colorAlpha`       | 8-digit hex with alpha                           |
| `prop.color(key, label, default, opts?)`           | `color`            | Opaque hex color                                 |
| `prop.select(key, label, default, choices, opts?)` | `select`           | `choices`: strings or `{ value, label }` objects |
| `prop.font(key, label, default, opts?)`            | `font`             | Google Fonts picker                              |
| `prop.midiTrack(key, label, opts?)`                | `timelineTrackRef` | MIDI track selector                              |
| `prop.audioTrack(key, label, opts?)`               | `timelineTrackRef` | Audio track selector                             |
| `prop.file(key, label, opts?)`                     | `file`             | File picker; `opts.accept` for MIME filter       |

All factories accept an optional last `opts` argument with `description` and `visibleWhen` fields.

**Manual Property Definition Structure** (verbose form, still supported):

```typescript
{
    key: 'myProperty',              // Property key
    type: 'number',                 // UI control type
    label: 'My Property',           // Display label
    default: 100,                   // Default value
    min: 0,                         // Min (for number)
    max: 1000,                      // Max (for number)
    step: 1,                        // Step (for number)
    description: 'Tooltip text',    // Optional description
    runtime: {                      // Runtime transform
        transform: asNumber,        // Transform function
        defaultValue: 100           // Runtime default
    },
}
```

**Common Property Types:**

- `number`: Numeric input with min/max/step
- `range`: Range slider
- `boolean`: Checkbox
- `string`: Text input
- `colorAlpha`: Color picker with alpha channel (8-digit hex `#RRGGBBAA`)
- `color`: Opaque color picker
- `select`: Dropdown with options
- `timelineTrackRef`: Reference to a timeline track (use `prop.midiTrack` / `prop.audioTrack` for typed variants)
- `file`: File picker — add `accept` to filter by MIME type (e.g. `accept: 'image/*'`)
- `font`: Font selector (returns a font selection object; use `parseFontSelection` and `ensureFontLoaded` from the SDK)

**Conditional Visibility (`visibleWhen`):**

A property can be conditionally hidden based on the value of another property using `visibleWhen`:

```typescript
{
    key: 'overlayText',
    type: 'string',
    label: 'Overlay Text',
    default: 'Hello',
    runtime: { transform: asTrimmedString, defaultValue: 'Hello' },
    // Only show when 'showOverlay' is truthy
    visibleWhen: [{ key: 'showOverlay', truthy: true }],
},
{
    key: 'borderWidth',
    type: 'number',
    label: 'Border Width',
    default: 2,
    runtime: { transform: asNumber, defaultValue: 2 },
    // Only show when 'mode' is NOT 'minimal'
    visibleWhen: [{ key: 'mode', notEquals: 'minimal' }],
},
```

Each entry in `visibleWhen` is an AND condition. Use `equals` / `notEquals` for value comparisons, `truthy: true` to show when the referenced property is true/non-empty, or `falsy: true` to show when it is false/empty. Conditions may reference properties in another tab; the property panel evaluates visibility against the full element value set.

### Render Methods

The `_buildRenderObjects()` method generates visual output:

```typescript
protected override _buildRenderObjects(
    _config: unknown,
    targetTime: number
): RenderObject[] {
    const props = this.getSchemaProps();

    // Return empty if not visible
    if (!props.visible) return [];

    // Build and return render objects
    return [
        new Rectangle(0, 0, props.width, props.height, props.color)
    ];
}
```

**Available Render Objects:**

- `Rectangle(x, y, width, height, color)` — solid filled rectangle
- `Text(x, y, text, font, color, align, baseline)` — text string
- `Line(x1, y1, x2, y2, color, lineWidth)` — straight line segment
- `Image(x, y, width, height, imageData)` — bitmap image
- `Arc(x, y, radius, startAngle?, endAngle?, anticlockwise?, options?)` — arc or filled circle; options accept `fillColor`, `strokeColor`, `strokeWidth`
- `Poly(points, fillColor?, strokeColor?, strokeWidth?)` — closed or open polygon
- `BezierPath(x, y, commands, options?)` — bezier path with fill/stroke options
- `AnimatedGif(x, y, width, height, provider, playbackSpeed, opacity?, options?)` — animated GIF; `provider` comes from a `GIFFrameDataProvider`
- `GlowLayer(options?)` — composite layer that applies a glow effect to its children; add children via the layer's child list
- `CompositeLayer(layerBlendMode?)` — composite layer that renders children with a custom canvas blend mode

### Lifecycle Hooks

```typescript
// Called when property value changes
protected override onPropertyChanged(
    key: string,
    oldValue: unknown,
    newValue: unknown
): void {
    super.onPropertyChanged(key, oldValue, newValue);

    if (key === 'myProperty') {
        // React to property change
    }
}

// Override to customize feature subscriptions
protected override _subscribeToRequiredFeatures(): void {
    // Manage audio/MIDI feature subscriptions
}
```

## Reading MIDI and Audio Data

Elements can read various data from the system to visualize. Read the [Plugin API](./plugin-api-v1.md) for a full list of what can be accessed and how to access it.

### Audio Analysis

Use `getRequiredPluginApi` (recommended) for a clean discriminated-union guard:

```typescript
import { getRequiredPluginApi, PLUGIN_CAPABILITIES, registerFeatureRequirements, Arc } from '@mvmnt/plugin-sdk';

// Pre-warm the audio cache — call at module scope or in the constructor.
registerFeatureRequirements('myAudioElement', [{ feature: 'spectrogram' }]);

const REQUIRED_CAPS = [PLUGIN_CAPABILITIES.audioFeaturesRead] as const;

export class MyAudioElement extends SceneElement {
    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const host = getRequiredPluginApi(this, [...REQUIRED_CAPS]);
        if (!host.ok) return host.renderFallback();

        const sample = host.api.audio.sampleFeatureAtTime({
            element: this,
            trackId: props.audioTrackId,
            feature: 'spectrogram',
            time: targetTime,
        });
        const magnitude = sample?.values?.[0] ?? 0;

        const size = 50 + magnitude * 200;
        return [new Arc(0, 0, size, 0, Math.PI * 2, false, { fillColor: props.color })];
    }
}
```

**Available built-in audio features:**

| Feature key     | Description                                           |
| --------------- | ----------------------------------------------------- |
| `spectrogram`   | Frequency-domain magnitude spectrum (FFT bins)        |
| `waveform`      | Time-domain waveform samples                          |
| `peaks`         | Per-frame peak amplitude                              |
| `pitchGuide`    | Detected pitch, confidence, and RMS per frame         |
| `pitchWaveform` | Pitch-aligned waveform for oscilloscope-style display |

Custom calculators can add new feature keys. See the [Custom Calculator Quickstart](./audio-features/custom-calculator-quickstart.md) to define and register your own.

### Reading Raw Audio (PCM)

For sample-accurate time windows (e.g. oscilloscopes), use the `audioRawRead` capability instead of feature sampling:

```typescript
import { getRequiredPluginApi, PLUGIN_CAPABILITIES, Line } from '@mvmnt/plugin-sdk';

export class OscilloscopeElement extends SceneElement {
    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioRawRead]);
        if (!host.ok) return host.renderFallback();

        const windowSec = 0.02; // 20 ms window
        const samples = host.api.audioRaw.getRawSamples({
            trackId: props.audioTrackId,
            startSec: targetTime - windowSec / 2,
            endSec: targetTime + windowSec / 2,
            channel: 'mono',
        });
        if (!samples) return [];

        const w = 400,
            h = 100;
        const objects: RenderObject[] = [];
        for (let i = 1; i < samples.length; i++) {
            const x1 = ((i - 1) / samples.length) * w;
            const x2 = (i / samples.length) * w;
            const y1 = h / 2 - samples[i - 1]! * (h / 2);
            const y2 = h / 2 - samples[i]! * (h / 2);
            objects.push(new Line(x1, y1, x2, y2, props.color, 1));
        }
        return objects;
    }
}
```

`getRawSamples` returns `null` if the window exceeds `MAX_RAW_SAMPLES` (8192 samples). For longer windows, use `sampleFeatureRange` with feature `'waveform'` instead.

### MIDI Event Bindings

```typescript
import { getRequiredPluginApi, PLUGIN_CAPABILITIES, Rectangle } from '@mvmnt/plugin-sdk';

protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const props = this.getSchemaProps();
    if (!props.midiTrackId) return [];

    const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
    if (!host.ok) return host.renderFallback();

    const EPS = 1e-3;
    const activeNotes = host.api.timeline.selectNotesInWindow({
        trackIds: [props.midiTrackId],
        startSec: targetTime - EPS,
        endSec: targetTime + EPS,
    });

    return activeNotes.map((note, i) => {
        const y = (128 - note.note) * 5;
        return new Rectangle(i * 20, y, 18, 4, props.noteColor);
    });
}
```

### Time-based Bindings

```typescript
protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const props = this.getSchemaProps();

    // Use targetTime for animations (in seconds)
    const rotation = (targetTime * 45) % 360; // 45 deg/sec
    const phase = Math.sin(targetTime * Math.PI); // Oscillate

    const size = 50 + phase * 25;

    return [new Arc(0, 0, size, 0, Math.PI * 2, false, { fillColor: props.color })];
}
```

### Layout Calculation

The renderer uses each element's **layout bounds** to automatically size and position elements — for example, to fit an element to its parent container or to align a group.

By default, every render object contributes to layout bounds. For elements with many render objects (notes, bars, particles), this causes the bounds to cover the full visual extent each frame, which may not be what you want.

**Preferred pattern: a single transparent layout rectangle.**

Declare one invisible `Rectangle` at a fixed, predictable size as the element's layout anchor. Set `includeInLayoutBounds: false` (or `layoutBoundsMode: 'none'`) on all other render objects so they don't contribute:

```typescript
import { Rectangle, VisualMedia } from '@mvmnt/plugin-sdk/render';

protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const props = this.getSchemaProps();
    const W = 400, H = 200;

    // ── Layout anchor ──────────────────────────────────────────────────────────
    // A single transparent rectangle defines the element's layout bounds.
    // All other render objects opt out of bounds calculation.
    const layoutRect = new Rectangle(0, 0, W, H, '#00000000');

    // ── Visual content ────────────────────────────────────────────────────────
    const bars: Rectangle[] = [];
    for (let i = 0; i < 32; i++) {
        const h = Math.random() * H;
        const bar = new Rectangle(i * (W / 32), H - h, W / 32 - 2, h, props.color);
        bar.includeInLayoutBounds = false; // opt out
        bars.push(bar);
    }

    return [layoutRect, ...bars];
}
```

This keeps layout stable and predictable regardless of how many render objects you generate per frame. For `VisualMedia`, use `layoutBoundsMode: 'none'` in the constructor options instead of `includeInLayoutBounds = false`.

### Custom Bindings

Elements can read any property with type transforms:

```typescript
import { asNumber, asBoolean, asTrimmedString } from '@mvmnt/plugin-sdk';

// In getConfigSchema():
{
    key: 'myEnum',
    type: 'select',
    label: 'Mode',
    default: 'circle',
    options: [
        { label: 'Circle', value: 'circle' },
        { label: 'Square', value: 'square' },
    ],
    runtime: {
        transform: (value) => {
            const normalized = asTrimmedString(value)?.toLowerCase();
            return normalized === 'square' ? 'square' : 'circle';
        },
        defaultValue: 'circle'
    },
}
```

**Built-in Transforms:**

- `asNumber`: Convert to finite number
- `asBoolean`: Convert to boolean
- `asString`: Convert to string
- `asTrimmedString`: Convert to trimmed non-empty string

## Categories and Organization

Elements are organized into categories (like `midi`, `misc`, etc) in the UI. For plugin elements, the category is overwritten at plugin load time to the plugin name.

## Testing and Debugging

### Local Development

Custom elements in the `src/plugins/` directory are automatically loaded during development:

1. **Create element** with `npm run create-element`
2. **Start dev server**: `npm run dev`
3. **Open app** and add your element to a scene
4. **Edit code** - changes hot-reload automatically

### Debugging Tips

Console logging works but because we're building render objects every frame, it might get messy quick. I'd recommend just using your builtin browser debugger!

**Console Logging:**

```typescript
protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const props = this.getSchemaProps();

    // Log property values
    console.log('[MyElement]', { targetTime, props });

    return [...];
}
```

**Conditional Rendering:**

```typescript
// Show debug info when a debug property is enabled
if (props.showDebug) {
    objects.push(new Text(0, -20, `Time: ${targetTime.toFixed(2)}s`, '12px monospace', '#00ff00', 'left', 'top'));
}
```

**Property Validation:**

```typescript
protected override onPropertyChanged(key: string, oldValue: unknown, newValue: unknown): void {
    super.onPropertyChanged(key, oldValue, newValue);

    if (key === 'myProperty') {
        console.log(`[MyElement] ${key} changed:`, { oldValue, newValue });
    }
}
```

### Common Issues

**Element not appearing:**

- Check `visible` property is true
- Verify `_buildRenderObjects()` returns non-empty array
- Ensure position is within canvas bounds

**Properties not updating:**

- Check runtime transform returns valid value
- Verify default values in schema match runtime defaults
- Clear browser cache if schema changes aren't reflected

**Audio not working:**

- Check `audioTrackId` is set and the track exists in the timeline
- Verify `getPluginHostApi` returns `status === 'ok'` with `audioFeaturesRead` capability
- Call `registerFeatureRequirements(this, [...])` in your element constructor for features you intend to sample (this pre-warms the audio cache)

**MIDI not working:**

- Check `midiTrackId` is set
- Verify track exists in timeline
- Confirm `getPluginHostApi` returns `status === 'ok'` with `timelineRead` capability

**Performance issues:**

- Limit render object count (use `maxObjects` check)
- Avoid expensive calculations in render loop
- Use caching for complex computations

## Packaging and Distribution

### Building a Plugin

Use the build script to create a distributable `.mvmnt-plugin` bundle:

```bash
# Build a specific plugin
npm run build-plugin src/plugins/my-plugin

# List available plugins
npm run build-plugin
```

This will:

1. Validate `plugin.json` against the manifest schema
2. Check for element type collisions with built-in elements
3. Validate element classes have required methods
4. Bundle each element with esbuild (minified, ESM format)
5. Create a `.mvmnt-plugin` ZIP file in the `dist/` directory

### Build Output

The build process produces:

- **Location:** `dist/{plugin-id}-{version}.mvmnt-plugin`
- **Format:** ZIP archive with `.mvmnt-plugin` extension
- **Size:** Typically 50-500 KB per element (minified and compressed)

Example output:

```
Building plugin: My Plugin v1.0.0
Plugin ID: myplugin
Elements: 5

Validating manifest...
✓ Manifest is valid

Validating element classes...
✓ All element classes are valid

Bundling elements...
  ✓ My Element
  ✓ My Element Two
  ...

✓ Bundle created: myplugin-1.0.0.mvmnt-plugin

Output: dist/myplugin-1.0.0.mvmnt-plugin
Size: 243.36 KB
Elements: 5
```

### Distribution Format

The `.mvmnt-plugin` format is a ZIP archive containing:

- `manifest.json`: Plugin metadata (generated from `plugin.json`)
- `elements/*.js`: Bundled element code (minified ES modules)
- `assets/`: Optional assets (images, fonts, etc.) if present

### Validation Rules

The build process enforces several validation rules:

**Manifest Validation:**

- Required fields must be present (`id`, `name`, `version`, `apiVersion`, `elements`)
- `apiVersion` may be provided as `mvmntVersion` for backwards compatibility (deprecated)
- Plugin ID must match `^[a-z0-9.-]+$` and be at least 3 characters
- Version must follow semantic versioning (`1.0.0`, `2.1.3-beta`, etc.)
- Each element must have `type` and `entry` fields
- Element `type` must match `^[a-z][a-z0-9-]*$` (start with a letter, lowercase, hyphens allowed)
- Element `type` must be unique within the plugin
- Entry files must exist and have a `.ts`, `.js`, or `.mjs` extension

**Collision Detection:**

- Element types cannot conflict with built-in elements

**Element Class Validation:**

- Must extend `SceneElement`
- Must implement `static getConfigSchema()` (with or without `override`)
- Must implement `_buildRenderObjects()` or `render()` method

**Import Validation:**

- Importing `@state/*`, `@selectors/*`, `@persistence/*`, `@constants/*`, `@types/*`, `@app/*`, `@workspace/*`, `@context/*`, `@fonts/*`, `@assets/*`, `@export/*`, `@bindings/*`, `@math/*`, `@pages/*`, `@devtools/*`, or `@config/*` is a hard error
- Importing `@core/*`, `@audio/*`, or `@utils/*` is a warning (legacy aliases — migrate to `@mvmnt/plugin-sdk`)

### Build Configuration

The build process uses esbuild with the following configuration:

- **Format:** ES modules (ESM)
- **Target:** ES2020
- **Minification:** Enabled
- **Source maps:** Disabled (for smaller bundle size)
- **External dependencies:**
    - `react`, `react-dom` (provided by host)
    - `@core/*`, `@audio/*`, `@utils/*`, `@state/*`, `@types/*`, `@constants/*` (MVMNT APIs)

### Distributing Your Plugin

Users install plugins through the **Settings panel → Plugins → Import**. They drag in the `.mvmnt-plugin` file; MVMNT validates the manifest, loads the element classes, and registers everything without an app restart. Plugins are persisted to IndexedDB and reloaded automatically on next launch.

See [Runtime Plugin Loading](runtime-plugin-loading.md) for the full loading, versioning, and persistence details.

## Best Practices

### Render Determinism

`_buildRenderObjects()` **must be deterministic**: given the same `targetTime` and props, it must always return the same result, regardless of call order or how many times it has been called before.

This matters because the renderer may call elements out of order during scrubbing, video export, or preview. Elements that accumulate state across calls will produce wrong output in those cases.

**Do not** store animation state as instance fields:

```typescript
// ❌ Wrong — depends on call history
private _noteOnTimes = new Map<number, number>();

protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    for (const note of activeNotes) {
        if (!this._noteOnTimes.has(note)) this._noteOnTimes.set(note, targetTime); // breaks on scrub
    }
}
```

**Do** derive all animation state from `targetTime` and note event data from the SDK:

```typescript
// ✅ Correct — deterministic from targetTime alone
protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const { api } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

    // Look back far enough to catch long notes and the full fade window
    const notes = api.timeline.selectNotesInWindow({
        trackIds: [trackId],
        startSec: targetTime - lookbackSec,
        endSec: targetTime + 0.05,
    });

    for (const n of notes) {
        if (n.startTime <= targetTime && targetTime < n.endTime) {
            // Note is active — animate from n.startTime
            const elapsedMs = (targetTime - n.startTime) * 1000;
            const animValue = 1 - Math.pow(Math.min(elapsedMs / ANIM_DURATION_MS, 1), 3);
            // Apply animValue to scale/position...
        } else if (n.endTime <= targetTime && n.endTime >= targetTime - fadeOutSec) {
            // Note just ended — fade out based on n.endTime
            const opacity = 1 - (targetTime - n.endTime) / fadeOutSec;
        }
    }
}
```

For MIDI note range auto-detection, use `api.timeline.getNoteRange()` rather than accessing `midiCache` internals via `getStateSnapshot()`.

### Performance Considerations

**Limit Render Objects:**

```typescript
const MAX_OBJECTS = 1000;

protected override _buildRenderObjects(...): RenderObject[] {
    const objects: RenderObject[] = [];

    // Generate objects...

    if (objects.length > MAX_OBJECTS) {
        console.warn(`[MyElement] Exceeded ${MAX_OBJECTS} objects, truncating`);
        return objects.slice(0, MAX_OBJECTS);
    }

    return objects;
}
```

**Cache Expensive Calculations:**

```typescript
private _cachedData: Map<number, any> = new Map();

protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const frame = Math.floor(targetTime * 60); // Cache per frame at 60fps

    if (!this._cachedData.has(frame)) {
        this._cachedData.set(frame, this._expensiveCalculation());

        // Clean old cache entries
        if (this._cachedData.size > 120) { // Keep 2 seconds
            const oldestFrame = frame - 120;
            this._cachedData.delete(oldestFrame);
        }
    }

    const data = this._cachedData.get(frame);
    // Use cached data...
}
```

### Naming Conventions

- **Element types:** kebab-case (`my-custom-element`)
- **Plugin IDs:** reverse domain notation (`com.example.myplugin`)
- **Property keys:** camelCase (`backgroundColor`, `lineWidth`)
- **Class names:** PascalCase + `Element` suffix (`MyCustomElement`)

### Error Handling

**Graceful Degradation:**

```typescript
protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const props = this.getSchemaProps();

    try {
        if (!props.requiredProperty) {
            // Show helpful message instead of crashing
            return [
                new Text(0, 0, 'Please configure required property',
                         '14px Inter, sans-serif', '#ef4444', 'left', 'top')
            ];
        }

        // Normal rendering...
        return this._renderNormally(props, targetTime);
    } catch (error) {
        console.error('[MyElement] Render error:', error);
        // Return error indicator
        return [
            new Rectangle(0, 0, 100, 100, '#ff000040'),
            new Text(50, 50, '⚠️', '32px sans-serif', '#ffffff', 'center', 'middle')
        ];
    }
}
```

### Type Safety

**Use proper typing:**

```typescript
interface MyElementProps {
    width: number;
    height: number;
    color: string;
    enabled: boolean;
}

protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const props = this.getSchemaProps() as MyElementProps;

    // Now you have type safety
    const scaled = props.width * 2; // TypeScript knows width is a number

    return [...];
}
```

## Troubleshooting

### Element Not Appearing

**Check visibility:**

```typescript
const props = this.getSchemaProps();
console.log('Visible?', props.visible);
```

**Check render output:**

```typescript
const objects = this._buildRenderObjects(config, targetTime);
console.log('Render objects:', objects.length, objects);
```

**Check position:**

```typescript
// Element might be off-canvas
console.log('Position:', { x: props.x, y: props.y });
console.log('Canvas size:', config.canvas);
```

### Render Issues

**Colors not showing:** Verify color format is 8-digit hex with alpha (`#RRGGBBAA`)

**Objects in wrong position:**

- Render objects use local coordinates (0,0 = element origin)
- Element position is set via `x`/`y`/`offsetX`/`offsetY` properties

**Z-order issues:** Use `zIndex` property to control layering

### Performance Problems

**Profile render time:**

```typescript
protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const startTime = performance.now();

    const objects = this._buildRenderObjectsImpl(_config, targetTime);

    const elapsed = performance.now() - startTime;
    if (elapsed > 16) { // More than one frame at 60fps
        console.warn(`[MyElement] Slow render: ${elapsed.toFixed(2)}ms`);
    }

    return objects;
}
```

**Reduce object count:** Aim for <1000 objects per element per frame

**Optimize loops:** Use efficient algorithms for generating many objects

---

## Related Documentation

- [Plugin Development Quickstart](plugin-quickstart.md)
- [Plugin API v1](plugin-api-v1.md)
- [Runtime Plugin Loading](runtime-plugin-loading.md)
- [Plugin Manifest Schema](plugin-manifest.schema.json)
- [Architecture Overview](ARCHITECTURE.md)
- Scene System Documentation _(coming soon)_
