# Element Templates

This directory contains the built-in counterparts of the SDK 2 templates published by the external
plugin generator.

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
- `context.assets.project()` for lifecycle-scoped asset loading
- `RenderTime.seconds` for frame timing
- `VisualMedia` fit modes (contain, cover, fill, none)

### `bundled-image.ts` — Bundled Image / GIF

An image or GIF that ships with the plugin, with an optional user override. Demonstrates:

- `context.assets.bundledImage()` for plugin-packaged assets
- Fallback pattern: bundled default unless user picks an override
- Auto-tracked handle lifecycle (no manual `onDestroy()`)

### `audio-reactive.ts` — Audio Reactive Visual

A shape that scales with audio volume (RMS). Demonstrates:

- `audio.raw.read` declared as a required capability
- `context.audio.getRms()` for a live PCM-derived RMS value
- A configurable short averaging window for smoothing
- Structured `Result` handling when audio data is unavailable

### `midi-notes.ts` — MIDI Reactive Visual

Displays currently playing MIDI notes as colored bars. Demonstrates:

- `prop.midiTrack()` for track selection
- `timeline.read` and `midi.utils` declared as required capabilities
- `context.timeline.selectNotes()` for querying active notes
- `context.midi.noteName()` for human-readable note labels

### `image-atlas.ts` — Animated Sprite / Atlas

Animates a Sparrow-format atlas (PNG + XML) bundled with the plugin. Demonstrates:

- `context.assets.bundledSparrow()` for plugin-packaged Sparrow atlases
- Optional user-overrideable atlas via `prop.sparrowAsset()`
- Background image layer via `context.assets.bundledImage()`
- `VisualMediaPlayback` with `resource?.animations` for atlas frame timing
- `getSparrowFrameInfo(resource, animName)` to read logical frame dimensions and trim insets without hardcoding constants

### `grid-atlas.ts` — Grid Spritesheet

Displays a single frame from a bundled grid-layout spritesheet (no XML required). Demonstrates:

- `this.bundledGridAtlas(filename, layout)` for uniform-grid spritesheets
- `setAnimation(null)` + `setLocalTime(frameIndex)` to freeze on a specific frame
- `frameDurationMs: 1000` layout trick so localTimeSec maps directly to frame index

---

## Template Conventions

All templates use `definePluginElement()`, serializable schemas, callback-scoped host facets, and
lifecycle-scoped asset handles. External capability declarations live in `plugin.json`.

## Customising a Template

1. Update the definition's `type` — it must be unique within the plugin.
2. Update its metadata and schema.
3. Declare the required and optional callback capabilities.
4. Replace the `render()` implementation and add lifecycle callbacks when needed.

## See Also

- [Plugin rendering and assets](../../../../docs/plugin-api/rendering-and-assets.md)
- [Plugin authoring guide](../../../../docs/plugin-api/authoring.md)
- [Scene element instance state](../../../../docs/plugin-api/instance-state.md)
- [\_examples](../_examples/README.md) — complete worked examples illustrating specific concepts
