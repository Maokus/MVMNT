# Bloom / Glow Performance Analysis (May 2026)

## Current Implementation

`GlowLayer` (`src/core/render/render-objects/glow-layer.ts`) renders children twice per frame:

1. **Normal pass** — children drawn as-is via `EmptyRenderObject.render`.
2. **Glow pass** — children rendered to a shared full-canvas offscreen buffer, then the entire buffer is drawn back to the main canvas with `ctx.filter = 'blur(Xpx)'` and `globalCompositeOperation = 'screen'`.

### Why the full-canvas blur is slow

`ctx.filter = 'blur(Xpx)'` applies a Gaussian blur across the **entire** canvas image via `drawImage`. Browser implementations approximate Gaussian blur with multiple box-blur passes, which scales roughly as **O(W × H × radius)** per frame (some engines do O(W × H) with a fixed number of passes but larger kernels for larger radii).

For an HD/4K canvas (1920 × 1080 or larger) with a blur radius of, say, 20 px:

- Every pixel in the offscreen buffer is sampled, even if 99 % of it is transparent.
- The GPU path (if available) still blits the full texture.
- Mobile / software-fallback renderers are worst-case O(W × H × r²).

**The vidilike piano roll is especially bad** because it previously wrapped _all_ objects — note rectangles _and_ all hit effects (markers, ripples, shake effects) — in a single `GlowLayer`. This means:

- Every animated effect gets blurred too, even though they often don't benefit from bloom.
- The full-canvas blur runs even when only a handful of small notes are visible.

---

## Root Causes of Poor Performance

1. **Full-canvas blur regardless of content size.** The offscreen buffer is always `canvas.width × canvas.height`. A single 20 × 8 px note rectangle causes the entire canvas (e.g., 1920 × 1080 = ~2M pixels) to be blurred.

2. **Large blur radii.** Users can set `bloomRadius` to any positive integer. At radius ≥ 16, most browsers switch to a slower multi-pass implementation.

3. **No culling or skipping.** The glow pass always runs when `glowBlur > 0`, even if all notes are off-screen.

4. **Effects incorrectly inside the bloom group.** In vidilike piano roll, hit effects (markers, ripples) were inside the `GlowLayer`, causing them to be blurred even though they look wrong when bloomed.

---

## Proposed Improvements

### 1. Downscaled blur buffer (highest impact, ~4–8× speedup)

Render the glow pass to a buffer at 1/2 or 1/4 of the canvas dimensions, then draw it back scaled up. The blurred glow is inherently soft, so the downscaling is visually imperceptible.

```
const SCALE = 0.25; // 1/4 resolution
offCtx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
// render children at 1/4 scale
offCtx.filter = `blur(${glowBlur * SCALE}px)`; // radius scales proportionally
ctx.drawImage(offscreenEl, 0, 0, fullW, fullH); // up-scale back
```

At 1/4 scale: buffer size drops from 1920 × 1080 → 480 × 270, reducing pixel count by 16×.
The blur radius also scales (e.g., 20 px at 1:1 → 5 px at 1/4), keeping the visual output identical.

**Trade-off:** Slightly reduced sharpness at the glow edges for very small blur radii (< 4 px); negligible for typical radii.

### 2. Content-bounding box crop (medium impact)

Before the glow pass, compute the bounding box of all children (from `getBounds()`) and only allocate/clear the cropped region of the offscreen buffer. Then composite only that region back.

**Trade-off:** Requires accumulating bounds across all children — adds O(N) work per frame before drawing.

### 3. Separate effects from notes in vidilike-style rolls (immediate fix)

Move hit effects (markers, ripples) outside the `GlowLayer`. Only note bodies should be bloomed. This was the immediate fix applied: `GlowLayer` now only wraps note rectangles, not the effects array.

### 4. Cap usable blur radius

Enforce a maximum of 30–40 px in the UI. Beyond this range, the visual improvement is negligible but the cost is noticeable.

### 5. Lazy / frame-budget glow

Track whether children changed since the last frame. If nothing moved and bloom radius is unchanged, reuse the previous glow frame buffer. This is a more complex change but could give near-0 cost for static scenes with bloom.

---

## Immediate Changes Applied (this session)

- `vidilike-piano-roll.ts`: `GlowLayer` now wraps only the note body objects (`objects`), not the hit effects (`effects`). Effects are composited on top of the bloom layer. The bloom property was also moved out of the "Animation" group into its own "Bloom" group to make it clear it applies to notes.
- The same pattern should be applied to `almamlike-piano-roll.ts`.

## Recommended Next Steps (not yet implemented)

1. **Implement downscaled blur buffer** in `GlowLayer` — add a `glowScale` option (default 0.25 for large canvases). A good heuristic: if `canvas.width * canvas.height > 800_000`, use 0.25 scale; else 0.5.
2. **Cap blur radius** at 40 px in the property schema for all elements.
3. **Lazy glow buffer** — add a dirty flag to `GlowLayer`; skip the glow pass if dirty=false.
