# Transparent PNG Export — Research & Implementation Notes

_May 2026_

## Goal

Allow users to export image sequences where the scene background is fully transparent (alpha = 0), so the rendered visuals can be composited over custom backgrounds in video editors. This is distinct from the current image-sequence export, which always bakes a solid `#000000` background.

---

## Current Rendering Pipeline

### Render entry point

`MIDIVisualizerCore.renderAtTime()` in `src/core/visualizer-core.ts` is the authoritative render call used by both the live preview and all export paths. It drives `ModularRenderer.render()` with a config object that always carries `backgroundColor: '#000000'` (line 357 of `visualizer-core.ts`).

### Where the background is painted

`ModularRenderer.clearCanvas()` (`src/core/render/modular-renderer.ts:27`) does a solid `fillRect` with the config's `backgroundColor` before any scene elements are drawn. There is one optimisation: if the first render object has a `fillColor` matching `config.backgroundColor`, the auto-clear is skipped (the scene's own Background element takes responsibility). Either way, the result is opaque.

### Canvas context

The `2d` context is obtained without `{ alpha: false }` — so alpha is technically already enabled. The canvas is transparent until `clearCanvas` paints over it. This means **no context re-creation is needed**; we only need to stop painting the opaque fill.

### Existing image-sequence export

`ImageSequenceGenerator` (`src/export/image-sequence-generator.ts`) already:
1. Resizes the shared canvas.
2. Calls `visualizer.renderAtTime(t)` per frame.
3. Calls `canvas.toBlob('image/png', 1.0)` — PNG already preserves alpha.

So the serialisation side is already correct. The problem is purely upstream: the opaque fill erases alpha before `toBlob` is called.

---

## What Needs to Change

### 1. Replace `fillRect` with `clearRect` when transparency is requested

`ModularRenderer.clearCanvas()` currently unconditionally fills. The minimal change:

```typescript
// modular-renderer.ts
clearCanvas(ctx, width, height, backgroundColor, transparent = false) {
    if (transparent) {
        ctx.clearRect(0, 0, width, height);
    } else {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }
}
```

`render()` passes `transparent` through from config.

### 2. Thread a `transparent` flag through the config

The render config object (typed loosely as `any` in `modular-renderer.ts`, formally as `VisualizerConfig` in `src/core/types.ts`) needs a `transparent?: boolean` field. `getSceneConfig()` in `visualizer-core.ts` (around line 357) builds this config; it would be set to `false` for normal playback and `true` during a transparent export pass.

### 3. Suppress the Background scene element

There is a dedicated `background.ts` element (`src/core/scene/elements/misc/background.ts`) that most scenes include. It paints a solid rectangle over the whole canvas. During transparent export, this element must be either:

- **Skipped at render time** — filter it out of the render-object list before passing to `ModularRenderer`, or
- **Rendered with `globalCompositeOperation = 'destination-out'`** so its pixels subtract alpha rather than add colour (fragile, not recommended), or
- **Made opt-out** — add a scene-level `transparentBackground` flag that the Background element checks in `buildRenderObjects`.

The cleanest approach is **filtering at render time** in the export path: strip any RenderObject whose source element has type `'background'`. This keeps the live render unchanged and requires no schema migration.

### 4. Export UI option

Add a "Transparent background" checkbox to the image-sequence export panel. This sets `transparent: true` in `GenerateSequenceOptions`, which propagates into the per-frame render call.

---

## Potential Complications

### CompositeLayer / GlowLayer internal offscreen canvases

`CompositeLayer` (`src/core/render/render-objects/composite-layer.ts:32`) creates its own `OffscreenCanvas` and renders children into it before compositing back. Because `new OffscreenCanvas(w, h)` starts fully transparent and no fill is done inside it, CompositeLayer children are already alpha-correct as long as the _main_ canvas is cleared with `clearRect`.

`GlowLayer` uses `_offscreenCtx.clearRect()` (not fill), so it is also fine.

No changes needed to either.

### Blend modes on scene elements

Elements that use `ctx.globalCompositeOperation` (multiply, screen, etc.) work correctly against a transparent background in Canvas 2D — they composite against alpha = 0, which is the identity for most blend modes. Worth a quick visual sanity check for `multiply` specifically (black × 0 = 0, which means multiply layers effectively vanish on a transparent canvas — same as in a compositor, so this is expected behaviour, not a bug).

### The `hasExplicitBg` skip in `ModularRenderer.render()`

Lines 12–14 check whether the first render object is a background fill matching `config.backgroundColor`, and if so skip `clearCanvas`. In transparent mode, neither branch should fill; the guard should short-circuit to `clearRect` regardless:

```typescript
if (transparent) {
    ctx.clearRect(0, 0, config.canvas.width, config.canvas.height);
} else if (!renderObjects.length || !hasExplicitBg) {
    this.clearCanvas(ctx, config.canvas.width, config.canvas.height, config.backgroundColor);
}
```

### APNG / animated WebP

If we ever want a single-file animated transparent export (rather than a zip of PNGs), the video export path (`av-exporter.ts`) uses `mediabunny` / WebCodecs. WebCodecs' `VideoFrame` supports `format: 'RGBA'` but browser support for transparent video containers (WebM with alpha) is patchy. A zip of transparent PNGs is the safe deliverable for now.

---

## Recommended Implementation Approach

1. Add `transparent?: boolean` to `VisualizerConfig` in `src/core/types.ts`.
2. Update `ModularRenderer.render()` and `clearCanvas()` in `src/core/render/modular-renderer.ts` to check the flag.
3. In `ImageSequenceGenerator.generateImageSequence()`, accept `transparent?: boolean` in `GenerateSequenceOptions`. Before each `renderAtTime()` call, set the flag on the visualizer config. After the call, restore it (or thread it through a per-render argument instead of mutating shared state).
4. Filter out background-type render objects in the export path, or expose a `skipBackground` option on `MIDIVisualizerCore.renderAtTime()`.
5. Add the checkbox to the export panel UI.

The whole change is shallow — no architectural work, no new canvas contexts, no library additions. The PNG codec already handles alpha; we just need to stop painting over it.

---

## Files to Touch

| File | Change |
|---|---|
| `src/core/types.ts` | Add `transparent?: boolean` to `VisualizerConfig` |
| `src/core/render/modular-renderer.ts` | `clearCanvas` / `render` — respect `transparent` flag |
| `src/core/visualizer-core.ts` | `getSceneConfig()` — expose `transparent` in built config; optionally add `renderAtTime` overload |
| `src/export/image-sequence-generator.ts` | `GenerateSequenceOptions.transparent`; pass flag through per-frame render |
| `src/core/scene/elements/misc/background.ts` | Possibly: honour a `transparent` render-config flag to return empty object list |
| Export panel UI component | Add "Transparent background" checkbox |
