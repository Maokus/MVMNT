# Element Templates

This directory contains template implementations for creating new custom elements. Use `npm run create-element` to scaffold a new element from a template, or copy a template file manually as a starting point.

## Available Templates

### `minimal.ts` — Minimal Element

The simplest possible element. A single colored rectangle with two properties. Start here when you need a blank slate.

### `basic-shape.ts` — Shape / Primitive Visual

A geometric shape (circle or rectangle) with color and size controls. Demonstrates:

- Multiple property types (select, number, colorAlpha)
- Conditional rendering based on a property value
- Property presets

### `text-display.ts` — Text Display

Customizable text with font, alignment, and optional background. Demonstrates:

- `prop.font()` and `parseFontSelection()` / `ensureFontLoaded()`
- Text alignment and baseline options
- Conditionally rendered background rectangle

### `image-simple.ts` — Image / GIF

A user-selected image or animated GIF from the asset registry. Demonstrates:

- `prop.imageAsset()` for registry picker
- `this.visualHandle()` + `resolveProjectAssetDescriptor()` for asset loading
- `VisualMediaPlayback` for frame timing
- `VisualMedia` fit modes (contain, cover, fill, none)

### `bundled-image.ts` — Bundled Image / GIF

An image or GIF that ships with the plugin, with an optional user override. Demonstrates:

- `this.bundledSprite()` / `this.bundledImage()` for plugin-packaged assets
- Fallback pattern: bundled default unless user picks an override
- Auto-tracked handle lifecycle (no manual `onDestroy()`)

### `audio-reactive.ts` — Audio Reactive Visual

A shape that scales with audio volume (RMS). Demonstrates:

- `registerFeatureRequirements()` to declare needed audio features
- `getRequiredPluginApi([PLUGIN_CAPABILITIES.audioFeaturesRead])`
- `host.api.audio.sampleFeatureAtTime()` and the `rms` feature
- Graceful fallback via `host.renderFallback()` when the audio API is unavailable

### `midi-notes.ts` — MIDI Reactive Visual

Displays currently playing MIDI notes as colored bars. Demonstrates:

- `prop.midiTrack()` for track selection
- `getRequiredPluginApi([PLUGIN_CAPABILITIES.timelineRead])`
- `host.api.timeline.selectNotesInWindow()` for querying active notes
- `host.api.utilities.midiNoteToName()` for human-readable note labels

### `image-atlas.ts` — Animated Sprite / Atlas

Animates a Sparrow-format atlas (PNG + XML) bundled with the plugin. Demonstrates:

- `this.bundledSparrow()` for plugin-packaged Sparrow atlases
- Optional user-overrideable atlas via `prop.sparrowAsset()`
- Background sprite layer via `this.bundledSprite()`
- `VisualMediaPlayback` with `resource?.animations` for atlas frame timing
- `getSparrowFrameInfo(resource, animName)` to read logical frame dimensions and trim insets without hardcoding constants

### `grid-atlas.ts` — Grid Spritesheet

Displays a single frame from a bundled grid-layout spritesheet (no XML required). Demonstrates:

- `this.bundledGridAtlas(filename, layout)` for uniform-grid spritesheets
- `setAnimation(null)` + `setLocalTime(frameIndex)` to freeze on a specific frame
- `frameDurationMs: 1000` layout trick so localTimeSec maps directly to frame index

---

## Template Conventions

All templates follow these patterns:

1. **Class naming** — `{Name}Element extends SceneElement`
2. **Constructor** — accepts `id` and `config` parameters
3. **Type identifier** — kebab-case string passed to `super()`
4. **Schema** — `insertElementConfig(super.getConfigSchema(), metadata, tabs)` with groups wrapped in `tab.properties`, `tab.content`, `tab.appearance`, or another tab helper
5. **Render method** — `_buildRenderObjects()` returns `RenderObject[]`
6. **Handles** — use `this.visualHandle()`, `this.bundledSprite()`, etc. (not `new VisualResourceHandle()`)

## Customising a Template

1. Rename the class to match your element.
2. Update the type identifier in `super()` — must be unique within the plugin.
3. Update `getConfigSchema()` metadata (name, description, category).
4. Add, remove, or modify properties as needed.
5. Replace the rendering logic in `_buildRenderObjects()`.

## See Also

- [Visual Asset Registry](../../../../docs/visual-asset-registry.md) — asset loading API reference
- [Creating Custom Elements Guide](../../../../docs/creating-custom-elements.md)
- [\_examples](../_examples/README.md) — complete worked examples illustrating specific concepts
