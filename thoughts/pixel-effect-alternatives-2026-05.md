# Pixel-Effect Alternatives to Individual Rectangle Objects

Current situation: `DitheratorElement` creates one `Rectangle` RenderObject per visible cell. At 200×200 that's up to 40,000 objects per frame, each going through the full transform/render pipeline. This document covers alternatives, roughly ordered from easiest to hardest.

---

## Option 1: Single Custom RenderObject with Direct Canvas Calls

**Idea:** Extend `RenderObject`, override `_renderSelf()`, and draw the entire grid yourself using `ctx.fillRect()` in a loop.

```ts
class DitherCanvasObject extends RenderObject {
    // ... props passed in constructor
    protected _renderSelf(ctx: CanvasRenderingContext2D, _config, time) {
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (!cellVisible(col, row, time)) continue;
                ctx.fillStyle = cellColor;
                ctx.fillRect(ox + col * cellSize + drawOffset, oy + row * cellSize + drawOffset, drawSize, drawSize);
            }
        }
    }
}
```

**Pros:**

- Trivial change — same pixel-perfect output, no new dependencies
- Eliminates all per-object overhead (transform stack, object allocation, iteration in renderer)
- Single `fillStyle` set per frame (or per color change) vs. one per Rectangle

**Cons:**

- `ctx.fillRect()` in a tight loop still has non-trivial call overhead at 40k cells
- Every call flushes the path; batching with a single `Path2D` would be faster

**Verdict:** Easy win, probably 3–5× faster than the current approach for dense grids.

---

## Option 2: Path2D Batching

Same as Option 1 but accumulate all visible rects into a single `Path2D` then fill once.

```ts
const path = new Path2D();
for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
        if (!cellVisible(col, row, time)) continue;
        path.rect(ox + col * cellSize + drawOffset, oy + row * cellSize + drawOffset, drawSize, drawSize);
    }
}
ctx.fillStyle = cellColor;
ctx.fill(path);
```

**Pros:**

- One draw call for the entire grid regardless of cell count — fastest Canvas 2D approach for single-color dithers
- `Path2D` objects can be cached across frames if the pattern didn't change (e.g. cache until `evolution`, `threshold`, or grid props change)

**Cons:**

- Only works cleanly for single-color grids. Multi-color dithers need one Path2D per color bucket
- `Path2D` cache invalidation logic adds complexity

**Verdict:** Best Canvas 2D approach for single-color dithers. Could cache path per-frame-worth-of-params and reuse if nothing changed.

---

## Option 3: Offscreen Canvas + `putImageData`

**Idea:** Render the dither pattern into a small `OffscreenCanvas` at 1px-per-cell resolution, then `drawImage()` it scaled up to the target size.

```ts
// Inside _renderSelf():
const off = new OffscreenCanvas(cols, rows); // tiny — e.g. 24×24
const offCtx = off.getContext('2d')!;
const imgData = offCtx.createImageData(cols, rows);
const [r, g, b, a] = parseColor(cellColor);

for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
        const i = (row * cols + col) * 4;
        if (cellVisible(col, row, time)) {
            imgData.data[i] = r;
            imgData.data[i + 1] = g;
            imgData.data[i + 2] = b;
            imgData.data[i + 3] = a;
        }
        // else leave as 0,0,0,0 (transparent)
    }
}
offCtx.putImageData(imgData, 0, 0);

// Scale up to actual pixel dimensions, with pixelated rendering
ctx.imageSmoothingEnabled = false;
ctx.drawImage(off, ox, oy, cols * cellSize, rows * cellSize);
```

**Pros:**

- O(cols × rows) array writes (very fast, typed array)
- Single `drawImage()` call — GPU compositing handles the scale-up
- `ctx.imageSmoothingEnabled = false` gives crisp pixel-art look for free
- Naturally handles cell gap: draw the offscreen at `(cols * drawSize + cols * cellGap)` and adjust

**Cons:**

- Cell gap needs thought: you can't get sub-pixel gaps with this approach unless you upscale at a multiple that accommodates the gap. A workaround is to pre-render at `cols * (cellSize)` px and clear the gap pixels — still fast
- `OffscreenCanvas` allocation per frame is expensive; must reuse (use a cached instance, resize only when grid changes)
- Alpha compositing quirks: `putImageData` ignores the current context transform, so you need to position via `drawImage` parameters

**Verdict:** Excellent for large grids (100×100+). Cache the `OffscreenCanvas` instance on the element between frames. This approach makes a 200×200 dither basically free at render time.

---

## Option 4: OffscreenCanvas + Cell Gap via `clearRect`

Extension of Option 3 for when you want actual gaps between cells:

1. Fill the entire offscreen with cell color
2. `clearRect()` the gap pixels between cells
3. Scale up and draw

Or render at `(cellSize × cols) × (cellSize × rows)` resolution with proper gaps already baked in. At large grids this offscreen gets big, but it's still one `drawImage` to blit it.

---

## Option 5: Reuse OffscreenCanvas as a Dirty Cache

Only recompute the pixel data when the pattern actually changes. The ditherer's pattern is fully determined by `(evolution, threshold, textureStrength, bayerStrength, texTranslateX, texTranslateY, texScale, baseTexture, ditherPattern, cellColor)`. Hash these together; if the hash matches the last frame, skip `putImageData` and just call `drawImage` again.

```ts
// Pseudocode
const key = `${evolution.toFixed(4)}_${threshold}_${cellColor}_...`;
if (key !== this._lastKey) {
    rebuildPixelData(offscreen, ...);
    this._lastKey = key;
}
ctx.drawImage(offscreen, ox, oy, cols * cellSize, rows * cellSize);
```

**Pros:**

- For static or slow-moving dithers, almost zero per-frame cost after the first build
- Combine with automatic animation: if `evolMotion === 0`, cache forever; if nonzero, rebuild each frame

**Cons:**

- Caching on `SceneElement` instance state is fine, but needs to handle grid size changes (recreate offscreen)
- State must live on the element instance, not in `_buildRenderObjects` local scope

---

## Option 6: CSS `image-rendering: pixelated` Pattern (Not Applicable)

Canvas 2D doesn't use CSS rendering, so this doesn't help here. Mentioned for completeness.

---

## Option 7: WebGL / OffscreenCanvas + WebGL Context

Draw the pattern using a WebGL fragment shader on a tiny canvas, then `drawImage` it. The shader computes the texture + dither entirely on the GPU.

**Pros:**

- Essentially free for any grid size; GPU parallelism makes the per-cell computation trivial
- Easy to add animated noise, smoothstep thresholding, antialiased edges

**Cons:**

- Requires switching the offscreen canvas to a `webgl` context — incompatible with the same canvas having a `2d` context
- Significant implementation complexity: need GLSL shader, uniform setup, vertex buffer
- MVMNT rendering pipeline is entirely Canvas 2D; adding a WebGL offscreen is a departure from the current architecture but doesn't break anything
- Some browser/context limit constraints (number of active WebGL contexts)

**Verdict:** Nuclear option. Worth it for a dedicated GPU-accelerated element, but heavy to maintain.

---

## Recommendation Summary

| Approach                              | Complexity | Max grid perf      | Gaps work        | Multi-color    |
| ------------------------------------- | ---------- | ------------------ | ---------------- | -------------- |
| 1. Loop + fillRect                    | Trivial    | Good               | Yes              | Yes            |
| 2. Path2D batch                       | Low        | Excellent          | No (w/o tricks)  | Per-color path |
| 3. OffscreenCanvas + putImageData     | Medium     | Excellent          | Needs workaround | Limited        |
| 4. OffscreenCanvas with gaps baked in | Medium     | Good-excellent     | Yes              | Limited        |
| 5. Dirty cache on top of 3/4          | Medium     | Near-zero (static) | Yes              | Yes            |
| 7. WebGL shader                       | High       | Essentially free   | Yes              | Yes            |

**For the Ditherator specifically:** Options 3 + 5 combined is the sweet spot. The element already computes a per-cell boolean; write that directly into a `Uint8ClampedArray` (via `ImageData`), cache the offscreen between frames, and only rebuild when animation params change. This would make even a 200×200 dither negligible at runtime.

Option 2 (Path2D) is the easiest first step and good enough for grids under ~50×50.
