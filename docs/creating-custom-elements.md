# Creating Custom Elements

_Last Updated: 10 February 2026_

This guide explains how to create custom scene elements for MVMNT using the plugin system.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Minimal Example Plugin](#minimal-example-plugin)
- [Plugin Manifest Reference](#plugin-manifest-reference)
- [Element API](#element-api)
- [Common Bindings](#common-bindings)
- [Categories and Organization](#categories-and-organization)
- [Testing and Debugging](#testing-and-debugging)
- [Packaging and Distribution](#packaging-and-distribution)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Custom elements extend MVMNT's visualization capabilities by providing new types of visual objects that can be added to scenes. Elements can react to audio, MIDI, or other data sources.

Key concepts:
- **Scene Elements**: Visual objects that render on the canvas (shapes, text, effects, etc.)
- **Plugin System**: Bundles custom elements for distribution and runtime loading
- **Property Bindings**: Dynamic property system supporting constants, macros, and data-driven values
- **Render Objects**: Low-level primitives (Rectangle, Circle, Text, etc.) that define visual output

## Getting Started

Prerequisites:
- Node.js 18+ installed
- MVMNT development environment set up
- Basic understanding of TypeScript and MVMNT's scene system

### Quick Start

1. **Create a new element** using the scaffold script:
   ```bash
   npm run create-element
   ```

2. **Follow the prompts** to specify element name, type, and category

3. **Edit the generated file** in `src/plugins/{pluginName}/{elementType}.ts`

4. **Test locally** - the element will automatically appear in the element picker

5. **Build for distribution** (Phase 2):
   ```bash
   npm run build-plugin -- --plugin {pluginName}
   ```

## Minimal Example Plugin

Here's a complete minimal plugin that renders a colored rectangle:

```typescript
// src/plugins/my-plugin/simple-box.ts
import { SceneElement, asNumber, asTrimmedString } from '@core/scene/elements/base';
import { Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema } from '@core/types';

export class SimpleBoxElement extends SceneElement {
    constructor(id: string = 'simpleBox', config: Record<string, unknown> = {}) {
        super('simple-box', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        
        return {
            ...base,
            name: 'Simple Box',
            description: 'A colored rectangle element',
            category: 'Custom',
            groups: [
                ...basicGroups,
                {
                    id: 'boxAppearance',
                    label: 'Box Appearance',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'boxWidth',
                            type: 'number',
                            label: 'Box Width',
                            default: 100,
                            min: 10,
                            max: 1000,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 100 },
                        },
                        {
                            key: 'boxHeight',
                            type: 'number',
                            label: 'Box Height',
                            default: 100,
                            min: 10,
                            max: 1000,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 100 },
                        },
                        {
                            key: 'boxColor',
                            type: 'colorAlpha',
                            label: 'Box Color',
                            default: '#3B82F6FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#3B82F6FF' },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        
        if (!props.visible) return [];
        
        return [
            new Rectangle(0, 0, props.boxWidth, props.boxHeight, props.boxColor)
        ];
    }
}
```

**Corresponding plugin.json:**

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "mvmntVersion": "^0.14.0",
  "description": "Example custom elements",
  "author": "Your Name",
  "elements": [
    {
      "type": "simple-box",
      "name": "Simple Box",
      "category": "custom",
      "description": "A colored rectangle element",
      "entry": "simple-box.ts"
    }
  ]
}
```

## Plugin Manifest Reference

Custom elements are distributed as plugins with a `manifest.json` file. The manifest describes the plugin and its elements.

See [plugin-manifest.schema.json](plugin-manifest.schema.json) for the complete schema definition.

### Required Fields

- `id`: Unique plugin identifier (reverse domain notation recommended)
- `name`: Human-readable plugin name  
- `version`: Semantic version (e.g., `1.0.0`)
- `mvmntVersion`: Compatible MVMNT version range (e.g., `^1.0.0`)
- `elements`: Array of element definitions

### Optional Fields

- `description`: Human-readable plugin description
- `author`: Plugin author name or organization
- `homepage`: Plugin homepage or repository URL
- `license`: Plugin license identifier
- `peerDependencies`: Other plugins required by this plugin
- `assets`: Asset paths included in the bundle

### Element Definition Fields

Each element in the `elements` array requires:
- `type`: Unique element type identifier (kebab-case, e.g., `my-element`)
- `name`: Display name for UI
- `category`: One of: `shapes`, `effects`, `text`, `particles`, `audio-reactive`, `midi`, `utility`, `custom`
- `entry`: Path to element TypeScript/JavaScript file

Optional element fields:
- `description`: Element description
- `icon`: Path to icon asset
- `thumbnail`: Path to thumbnail asset
- `capabilities`: Required capabilities (`audio-analysis`, `midi-events`, `network`, `storage`)
- `tags`: Searchable tags

## Element API

Custom elements extend the `SceneElement` base class and implement specific methods to define behavior.

### Base Class

```typescript
import { SceneElement } from '@core/scene/elements/base';

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
    const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
    const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
    
    return {
        ...base,
        name: 'My Element',           // Display name
        description: 'Element desc',  // Description
        category: 'Custom',           // UI category
        groups: [
            ...basicGroups,           // Keep base groups
            {
                id: 'myGroup',        // Unique group ID
                label: 'My Settings', // Group label
                variant: 'basic',     // 'basic' or 'advanced'
                collapsed: false,     // Initially collapsed?
                properties: [
                    // Property definitions...
                ],
                presets: [            // Optional presets
                    {
                        id: 'preset1',
                        label: 'Preset 1',
                        values: { prop1: 'value1' }
                    }
                ]
            },
            ...advancedGroups,
        ],
    };
}
```

**Property Definition Structure:**

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
- `boolean`: Checkbox
- `string`: Text input
- `colorAlpha`: Color picker with alpha
- `select`: Dropdown with options
- `timelineTrackRef`: Reference to timeline track

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
- `Rectangle(x, y, width, height, color)`
- `Circle(x, y, radius, color)`
- `Text(x, y, text, font, color, align, baseline)`
- `Line(x1, y1, x2, y2, color, lineWidth)`
- `Path(points, color, lineWidth, closed)`
- `Image(x, y, width, height, imageData)`

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

## Common Bindings

Elements can bind properties to various data sources for dynamic behavior.

### Audio Analysis Bindings

Example: Creating an audio-reactive element

```typescript
import { getFeatureData } from '@audio/features/sceneApi';
import { registerFeatureRequirements } from '@audio/audioElementMetadata';
import { selectChannelSample } from '@audio/audioFeatureUtils';

// Register required features (do this at module level)
registerFeatureRequirements('myAudioElement', [
    { feature: 'rms' },      // Volume/RMS
    { feature: 'spectrum' }, // Frequency spectrum
]);

export class MyAudioElement extends SceneElement {
    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        
        // Get RMS data for the specified audio track
        const rmsData = getFeatureData(
            this,
            props.audioTrackId,
            'rms',
            targetTime,
            { smoothing: props.smoothing }
        );
        
        // Select specific channel or use default
        const channelData = selectChannelSample(
            rmsData?.metadata.frame,
            props.channelSelector
        );
        
        const volume = channelData?.values?.[0] ?? rmsData?.values?.[0] ?? 0;
        
        // Use volume to drive visualization
        const size = 50 + volume * 200;
        
        return [new Circle(0, 0, size, props.color)];
    }
}
```

**Available Audio Features:**
- `rms`: Root mean square (volume)
- `spectrum`: Frequency spectrum
- `waveform`: Time-domain waveform
- `beat`: Beat detection
- `onset`: Onset detection

### MIDI Event Bindings

Example: Responding to MIDI notes

```typescript
import { getMidiData } from '@core/midi/midiDataService';

protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
    const props = this.getSchemaProps();
    
    if (!props.midiTrackId) return [];
    
    // Get MIDI data at current time
    const midiData = getMidiData(props.midiTrackId, targetTime);
    
    // Access active notes
    const activeNotes = midiData?.notesPlaying || [];
    
    // Render based on active notes
    return activeNotes.map((note, i) => {
        const y = (128 - note.noteNumber) * 5;
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
    
    return [new Circle(0, 0, size, props.color)];
}
```

### Custom Bindings

Elements can read any property with type transforms:

```typescript
import { asNumber, asBoolean, asTrimmedString } from '@core/scene/elements/base';

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

Elements are organized into categories in the UI. Available categories:

- `shapes`: Basic geometric shapes
- `effects`: Visual effects and filters
- `text`: Text rendering elements
- `particles`: Particle systems
- `audio-reactive`: Audio-driven visualizations
- `midi`: MIDI-driven elements
- `utility`: Helper/utility elements
- `custom`: Uncategorized custom elements

## Testing and Debugging

### Local Development

Custom elements in the `src/plugins/` directory are automatically loaded during development:

1. **Create element** with `npm run create-element`
2. **Start dev server**: `npm run dev`
3. **Open app** and add your element to a scene
4. **Edit code** - changes hot-reload automatically

### Developer Overlay

Enable the developer overlay to inspect element properties:

1. Press **Ctrl+Shift+D** (or **Cmd+Shift+D** on Mac)
2. Select an element in the scene
3. View live property values and render stats

### Debugging Tips

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
    objects.push(
        new Text(0, -20, `Time: ${targetTime.toFixed(2)}s`, 
                 '12px monospace', '#00ff00', 'left', 'top')
    );
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

**Audio/MIDI not working:**
- Call `registerFeatureRequirements()` at module level
- Check `audioTrackId` or `midiTrackId` is set
- Verify track exists in timeline

**Performance issues:**
- Limit render object count (use `maxObjects` check)
- Avoid expensive calculations in render loop
- Use caching for complex computations

## Packaging and Distribution

_(Phase 2 - coming soon)_

### Building a Plugin

Once implemented, use the build script to create a distributable `.mvmnt-plugin` bundle:

```bash
npm run build-plugin -- --plugin my-plugin
```

This will:
1. Validate `plugin.json` against schema
2. Bundle element code with dependencies
3. Create a `.mvmnt-plugin` ZIP file

### Distribution Format

The `.mvmnt-plugin` format is a ZIP archive containing:
- `manifest.json`: Plugin metadata
- `elements/*.js`: Bundled element code
- `assets/`: Optional assets (images, fonts, etc.)

## Best Practices

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

- [Plugin Manifest Schema](plugin-manifest.schema.json)
- [Architecture Overview](ARCHITECTURE.md)
- Scene System Documentation _(coming soon)_
