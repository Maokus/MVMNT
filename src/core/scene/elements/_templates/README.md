# Element Templates

This directory contains template implementations for creating new custom elements.

## Available Templates

### `basic-shape.ts`
A simple geometric shape element that demonstrates:
- Property configuration with multiple types (select, number, colorAlpha)
- Conditional rendering based on property values
- Presets configuration

### `audio-reactive.ts`
An element that reacts to audio input, demonstrating:
- Audio feature requirements registration
- Audio data retrieval and channel selection
- Property transforms with validation
- Dynamic sizing based on audio data

### `midi-notes.ts`
Displays currently playing MIDI notes, demonstrating:
- MIDI data access
- Timeline track references
- Conditional rendering with fallback messaging
- Array iteration for rendering multiple objects

### `text-display.ts`
A customizable text display element, demonstrating:
- Text rendering with formatting options
- Optional background rendering
- Alignment and baseline configuration
- Estimated text dimensions for layout

## Using Templates

Templates are used by the scaffold script (`npm run create-element`) to generate new custom elements. You can also manually copy and modify templates as starting points for your own elements.

### Template Conventions

All templates follow these patterns:

1. **Class naming**: `{Name}Element` extends `SceneElement`
2. **Constructor**: Accepts `id` and `config` parameters
3. **Type identifier**: Kebab-case string passed to `super()`
4. **Schema**: Extends base schema with custom property groups
5. **Render method**: `_buildRenderObjects()` returns `RenderObject[]`

### Customizing Templates

When using a template as a starting point:

1. Rename the class to match your element
2. Update the type identifier (must be unique)
3. Update `getConfigSchema()` metadata (name, description, category)
4. Add/remove/modify properties as needed
5. Implement your custom rendering logic in `_buildRenderObjects()`

## See Also

- [Creating Custom Elements Guide](../../../../docs/creating-custom-elements.md)
- [Plugin Manifest Schema](../../../../docs/plugin-manifest.schema.json)
