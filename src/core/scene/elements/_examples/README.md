# Element Examples

This directory contains complete, runnable plugins that illustrate specific development concepts. They are more focused and fully-commented than the `_templates/` — each example is self-contained and targets one idea.

## Available Examples

### `beat-rings/` — Audio Reactive (concentric rings)

**Concepts:** `registerFeatureRequirements`, `sampleFeatureAtTime` with different smoothing levels, `Arc` render object, `setGlobalAlpha()`, graceful audio API fallback.

Three concentric rings pulse to the audio RMS. The outermost ring uses heavy smoothing for a ghost/echo effect; the innermost ring reacts sharply to every beat.

### `falling-notes/` — MIDI Timeline (falling note blocks)

**Concepts:** `selectNotesInWindow` with a lookahead window, mapping note pitch → X and time → Y, velocity-tinted colours via hex manipulation, a static "now" line anchor.

MIDI notes appear at the top of the element and fall toward a horizontal "now" line. Pitch controls horizontal position; velocity controls colour opacity.

---

## Using an Example

Run the scaffold script and follow the prompts:

```bash
npm run create-example
```

This copies your chosen example into `src/plugins/<your-id>/` and updates `plugin.json` with your plugin ID. The element source file is copied verbatim — rename the class and customise from there.

## See Also

- [\_templates/README.md](../_templates/README.md) — leaner starting-point templates for new elements
- [Visual Asset Registry](../../../../docs/visual-asset-registry.md) — asset loading API reference
