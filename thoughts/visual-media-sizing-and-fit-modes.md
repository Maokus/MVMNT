# VisualMedia — Sizing, Fit Modes, and Sprite Positioning

_Written April 2026 after investigating the `fit: 'none'` clipping bug and the Sparrow atlas rendering pipeline._

---

## The Three Coordinate Spaces

Understanding how a sprite ends up on screen requires keeping three distinct spaces straight.

**Texture space** — the raw pixels on the atlas PNG. A Sparrow frame lives at `sourceRect: {sx, sy, sw, sh}` in this space. The full atlas may be 4096×4096 while a single frame occupies a 120×80 crop within it.

**Logical space** — the full frame bounding box as the animator intended, including any transparent padding that was stripped when the atlas was packed. Stored as `logicalSize: {w, h}` per frame (and at the resource level as `logicalWidth/logicalHeight`). For `'idle dance0001'`, this might be 300×400. Content within the logical box starts at `trimOffset` (which is `-frameX, -frameY` from the Sparrow XML).

**Container space** — the `width × height` rectangle owned by the `VisualMedia` render object. Fit mode determines how the logical image maps into this box.

---

## How Each Asset Type Flows Through the Pipeline

### Plain image / GIF

One frame, no `sourceRect`, no `trimOffset`, no `logicalSize`. The drawable _is_ the image. `resource.logicalWidth/logicalHeight` equals the image's pixel dimensions.

### Grid atlas (uniform spritesheet)

Each frame has a `sourceRect` (the grid cell on the atlas) but no `trimOffset` and no `logicalSize`. All cells are assumed the same size. `resource.logicalWidth/logicalHeight` equals one cell's pixel dimensions.

### Sparrow atlas

The most complex case. Per frame:

- `sourceRect` — where in the atlas the non-transparent pixels live
- `trimOffset` — `{x: -frameX, y: -frameY}` from the XML; shifts the content within logical space
- `logicalSize` — `{w: frameWidth, h: frameHeight}` from the XML; the full frame bounding box

Different frames in the same atlas often have **different logical sizes**. A resting idle may be 300×400; a stretched punch animation may be 500×350. `resource.logicalWidth/logicalHeight` is the **median** frame logical size across all frames in the atlas (not the max, not the first frame).

---

## Fit Modes

All modes are computed in `#calculateDrawParams(imgW, imgH)` where `imgW/imgH` come from the current frame's `logicalSize` (falling back to `resource.logicalWidth/logicalHeight` for non-Sparrow assets).

| Mode        | Behaviour                                                | Scale               | Bounds                                     |
| ----------- | -------------------------------------------------------- | ------------------- | ------------------------------------------ |
| `'contain'` | Scales to fit entirely within the container, letterboxes | Scaled down (or up) | Actual drawn rect (may not fill container) |
| `'cover'`   | Scales to fill the container, clips overflow             | Scaled up (or down) | Full container                             |
| `'fill'`    | Stretches to exact container size, distorts              | Forced to container | Full container                             |
| `'none'`    | Native 1:1 pixel scale, centred, clips overflow          | 1.0                 | Intersection of image and container        |

For `'cover'` and `'none'`, the renderer saves/clips the canvas context to the container bounds before drawing, then restores.

### The `'none'` mode rendering path (after the 2026-04 fix)

The renderer computes `baseX = (container.width - frame.logicalSize.w) / 2`, which may be **negative** when the frame is wider than the container. Canvas clipping handles the boundary; the frame is never scaled. For atlas frames, `trimOffset` shifts the content within that centred logical box at scale 1.

**Before the fix:** Sparrow frames always took the `frame.sourceRect` branch, which applied `scaleX = drawWidth / imgW`. When the frame was wider than the container, `scaleX < 1` and the sprite was silently scaled down instead of clipped.

---

## The `scaleX / scaleY` Variables and Why They Matter for Atlas Frames

For every mode except `'none'`, the renderer computes:

```
scaleX = drawWidth / imgW
scaleY = drawHeight / imgH
```

These scale factors are applied to the atlas `sourceRect` dimensions when drawing:

```
ctx.drawImage(atlas, sx, sy, sw, sh, destX, destY, sw * scaleX, sh * scaleY)
```

This is how the renderer scales atlas content without reading it into a temporary canvas — it lets `drawImage` do the scaling. The `trimOffset` is also multiplied by `scaleX/scaleY` so the transparent-padding offset tracks the scaled content.

For `'none'`, scale is forced to 1 and trimOffset is applied unchanged.

---

## How to Position Sprites and Animations of Uneven Shape

This is the main source of confusion when building sprite-based elements.

### The problem

Different animations on the same Sparrow atlas typically have different `logicalSize` values. With `fitMode: 'none'`, `VisualMedia` **centres the current frame's logical box within its container**. When the active animation changes and the new animation has a larger or smaller `logicalSize`, the sprite visually shifts position. Characters appear to "jump" between animations.

Example:

- Idle animation: `logicalSize` 300×400. `baseX = (media.w - 300) / 2`
- Note-LEFT animation: `logicalSize` 450×400. `baseX = (media.w - 450) / 2` — 75px smaller than idle

The character's left edge shifts 75px right when switching animations if `media.width = 300`.

### The recommended patterns

**Pattern 1 — Oversized container (simplest)**

Set `_media.width/height` large enough to contain the biggest frame across all animations. Since `'none'` mode clips to the container, size it generously so no animation is cropped. The logical-size centering then keeps every frame's centre at the container's centre.

```typescript
// Pick a size that fits the widest/tallest frame you expect.
// logicalWidth/logicalHeight is the median, not the max — add headroom.
const MAX_W = 600;
const MAX_H = 600;
this._media.setDimensions(MAX_W, MAX_H);
this._media.setFitMode('none');
```

The centre of every animation aligns with the container's centre. If the character is meant to stand on the ground, position the container so its vertical centre is at mid-body height, or use `originY` to anchor a different point.

**Pattern 2 — Anchor with `originX/Y`**

`VisualMedia` supports `originX/Y` fractions (0–1) that control which point within the container maps to the render object's `(x, y)` position. This lets you pin a corner or edge of the container to a world position rather than the top-left.

```typescript
// Pin the bottom-centre of the container to the character's feet position.
const media = new VisualMedia(feetX, feetY, MAX_W, MAX_H, {
    fitMode: 'none',
    originX: 0.5,
    originY: 1.0,
});
```

The container stays centred on `feetX` horizontally and has its bottom at `feetY`. Every animation's logical-box centre maps to the container's centre, so the character body stays roughly fixed while frames shift within the logical boxes.

**Pattern 3 — Use `'contain'` instead of `'none'`**

If native pixel size isn't required, `'contain'` scales the current frame to fit the container while preserving aspect ratio. The scale changes per-frame if logical sizes differ, but the drawn region always fills the same container area. Characters won't shift position, though they may subtly grow/shrink between animations.

**Pattern 4 — `'none'` mode with `layoutRect` as the display hitbox**

This is the pattern used in `boyfriend.ts`. A separate `Rectangle` render object (`_layoutRect`) provides the user-configurable display box (the visual hitbox/anchor reference). `_media` is set to `includeInLayoutBounds: false` and its dimensions are set to `resource.logicalWidth/logicalHeight` (the median frame size). The layout rect and media share the same `(0, 0)` origin.

```typescript
this._media.setDimensions(resource.logicalWidth, resource.logicalHeight);
this._media.setFitMode('none');
this._media.setIncludeInLayoutBounds(false);
```

This works well when most animations share the same logical size. When they differ, the centering-within-container still causes subtle shifts — see Pattern 1 or 2 to eliminate this.

---

## Points of Confusion for Developers

**1. `resource.logicalWidth/logicalHeight` is the median frame size.**

The cache computes this by sorting all frame logical widths/heights and taking the middle value. It is **not** the maximum, not the first frame's size, and not the most common value. For characters with wildly varying animation sizes, this value may not correspond to any actual animation frame. Don't assume it fits all frames.

**2. `logicalSize` is per-frame and changes every tick.**

When `setAnimation()` is called and time advances, `getFrameAtTime` returns a different frame with a potentially different `logicalSize`. `VisualMedia` recalculates `drawParams` every render pass using the live frame — there is no stable "image size" you can cache at setup time.

**3. `trimOffset` is `{x: -frameX, y: -frameY}` from the XML.**

Sparrow's `frameX` is typically negative (it represents how many pixels of transparent padding were stripped from the left). `trimOffset.x = -frameX` is therefore typically **positive**, shifting the content rightward from the logical frame's top-left origin. A frame with `frameX = -50` means the actual content starts 50px in from the left of the logical box.

**4. In `'none'` mode, the container size controls clipping, not scaling.**

If the current frame's logical size is larger than `_media.width/height`, the frame is **clipped**, not scaled. The visible portion is the centre of the logical frame. This differs from `'contain'`, which would scale the whole frame to fit.

**5. `setDimensions` also updates `pivotX/Y` from stored origin fractions.**

`VisualMedia.setDimensions(w, h)` not only sets `this.width/height` — it recomputes `pivotX = originX * w` and `pivotY = originY * h`. If you call `setDimensions` after `setOrigin`, the pivot stays in sync automatically. If you set `pivotX/Y` directly _after_ `setDimensions`, a subsequent `setDimensions` call will overwrite it.

**6. `_getSelfBounds()` for `'none'` mode returns the intersection, not the full frame.**

Bounds for `'none'` and `'contain'` track the actual drawn region (not the container). For `'none'` when the frame is larger than the container, bounds equal the container. For smaller frames, bounds equal the drawn image rect (centred, smaller than container). Click-testing and layout measurement use these bounds.

**7. The `params.srcRect` source-crop path is only reached for non-atlas plain images.**

In `_renderSelf`, drawing branches are checked in this order: rotated atlas → atlas → none-mode plain → srcRect plain → full drawable. Sparrow frames always have `frame.sourceRect` set, so they always take the atlas branch. Before the 2026-04 fix, `params.srcRect` was never used for Sparrow frames in `'none'` mode, causing the silent scaling bug.

**8. `'cover'` mode does not clip the canvas until the draw call.**

The `ctx.save() / ctx.clip()` for `'cover'` (and now also `'none'`) happens immediately before the draw call. Code that draws _before_ creating the `VisualMedia` (e.g., a background rectangle rendered at a lower z-order by returning it first in `_buildRenderObjects`) is not affected by the clip.

---

## Quick Reference: What to Set for Common Scenarios

| Scenario                             | `fitMode`             | `_media.width/height`                 | Notes                                        |
| ------------------------------------ | --------------------- | ------------------------------------- | -------------------------------------------- |
| Full-area background image           | `'cover'` or `'fill'` | Element display size                  |                                              |
| Thumbnail that must not crop         | `'contain'`           | Thumbnail box size                    | Letterboxed                                  |
| UI icon at native size               | `'none'`              | Icon's native dimensions              | No clip if image ≤ container                 |
| FNF/rhythm sprite, consistent anchor | `'none'`              | Max logical size across all anims     | Centre-anchored; use `originX/Y` to pin feet |
| FNF/rhythm sprite, quick setup       | `'none'`              | `resource.logicalWidth/logicalHeight` | Slight shifts between anims OK               |
| Sprite, scale to fit display area    | `'contain'`           | Element display size                  | Subtle scale changes per frame               |
