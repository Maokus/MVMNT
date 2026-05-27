# Atlas Development Experience — FNF Arrows Element

_May 2026 — written after implementing the FNF arrows strumline element_

This covers what was genuinely confusing, what worked well, and concrete API improvement ideas — based on building a Sparrow-atlas-heavy element from scratch.

---

## What Worked Well

**`bundledSparrow` is clean.** Declaring an atlas as an instance field and calling `.get()` each frame felt natural. The auto-disposal on element teardown is a real convenience; you never think about cleanup.

**`BundledSparrowHandle.get()` returning `{ resource, status }` composes well with `setResource`.** The chained fluent API on `VisualMedia` reads nicely:

```typescript
sprite
    .setResource(res, status)
    .setAnimation('confirmLeft')
    .setLocalTime(elapsed)
    .setFitMode('clip')
    .setDimensions(w, h)
    .setFramePlacement('center');
```

**Render determinism is easy to satisfy once understood.** Computing `localTime = targetTime - note.startTime` instead of accumulating frame deltas is a simple mental model that works for all the animations needed here.

**Per-lane instance fields (receptors, splashes, hold covers) are a good pattern.** Four VisualMedia instances allocated once in class fields, mutated each frame — no allocation pressure, no GC spikes.

---

## What Was Confusing

### 1. `setFramePlacement` + `'clip'` mode + Sparrow frame offsets

This was the hardest thing to understand and the first real bug: receptors appeared offset to the right and down, and slightly cropped.

The root cause: `'clip'` mode renders at native 1:1 pixels. `setDimensions` defines the _container_ size. `setFramePlacement` controls where the **logical Sparrow frame** (frameWidth × frameHeight) is placed inside that container. The actual drawn pixels are then offset from the frame origin by the `trimOffset` (derived from `frameX`/`frameY` in the XML).

For `staticDown`, the logical frame is 235×230 but the actual texture is 157×154 at offset (37, 37) within the frame. With `setFramePlacement('top-left')` on a 157×157 container, the frame's top-left corner is at (0,0) — so the actual pixels start drawing at (37, 37) and extend to (194, 191), both of which overflow the 157px container and get clipped. The texture appears offset to the right and down because the empty padding is occupying the visible top-left region.

The fix — `setFramePlacement('center')` — centers the 235×230 frame in the 157×157 container, placing the actual pixels starting at approximately (-2, 0.5): almost the entire sprite visible, minimal clipping.

**Why this is a trap:** The natural instinct is `'top-left'` placement. It's the "default" spatial mental model. There's no hint in the API that this will cause problems when the atlas has trim offsets. If you test with an atlas that has zero offsets (like `notes.xml`, where frameX/Y = 0), `'top-left'` works fine, so you don't notice the issue until you switch to a different atlas.

**Related confusion: `setDimensions` should match the logical frame size, not the texture size.** For `'clip'` mode to show the full sprite without overflow, the container needs to be at least as large as the logical frame (235×230), not the texture (157×154). Using the texture size as the container clips the content even with `'center'` placement if the frame is much larger than the texture. In the final implementation, container dimensions are scaled from `STRUMLINE_FRAME_W/H` (the logical frame size) rather than `NOTE_FRAME_W` (the texture size).

### 2. `'clip'` mode naming is misleading

`'clip'` sounds like "scale to fill, then clip overflow" — which is what CSS `background-size: cover; overflow: hidden` does, and what most game developers would expect from the name. But it actually means "native 1:1 pixels, no scaling, clip overflow." `'cover'` is the CSS-equivalent fill-and-clip.

The four modes are: `'contain'` (scale to fit), `'cover'` (scale to fill), `'fill'` (stretch), `'clip'` (native scale). The last one is the odd one out — it's the only mode where `setFramePlacement` does anything. A name like `'native'` or `'pixel-perfect'` would convey the intent better.

### 3. `includeInLayoutBounds` has two different interfaces

For `VisualMedia`: set via the constructor options object:

```typescript
new VisualMedia(0, 0, w, h, { layoutBoundsMode: 'none' });
```

For `Rectangle` and other primitives: set as an instance property after construction:

```typescript
const r = new Rectangle(x, y, w, h, color);
r.includeInLayoutBounds = false;
```

These are two different APIs for the same concept. When building elements that mix `VisualMedia` and `Rectangle`, you have to remember which interface each class uses. An instance property on `VisualMedia` post-construction would be consistent, or a factory option on `Rectangle` would work the other way.

### 4. Grid atlas for `NOTE_hold_assets.png`

`NOTE_hold_assets.png` has no corresponding `.xml` file. The initial implementation used a solid-color `Rectangle` for hold tails because there was no obvious path to using the spritesheet. The correct approach — a `GridAtlasSourceDescriptor` — turned out to work well once discovered, but requires several non-obvious steps that aren't covered in the bundled-asset docs.

**The `bundledSprite`/`bundledSparrow` gap.** Neither factory method handles the "bundled image used as a grid atlas" case. `bundledSprite` produces an `{ kind: 'image' }` descriptor. To get a `{ kind: 'grid-atlas' }` descriptor, you have to:
1. Call the protected `loadBundledAsset(filename)` directly to retrieve the blob URL asynchronously.
2. Store the URL in a private field (with a loading flag to guard against re-triggering).
3. Construct the `GridAtlasSourceDescriptor` manually each frame, once the URL is available.
4. Feed it into a `this.visualHandle()` via `.update(descriptor)`.

This is effectively re-implementing what `bundledSprite` does internally, with an extra step. A `bundledGridAtlas(filename, layout)` factory method on `SceneElement` would close this gap completely.

**Frame selection via `setLocalTime`.** A grid atlas resource has no named animations — `resource.animations` is empty. `setAnimation(null)` is required if the `VisualMedia` instance is reused from a pool that previously had a Sparrow animation set (otherwise the stale name lookup returns `undefined`, which silently falls back to the full frame list, but it's cleaner to be explicit).

To freeze on a specific frame N, set `frameDurationMs: 1000` in the layout and call `setLocalTime(N)` (N in seconds = N × 1s per frame). The loop math in `getFrameAtTime` is `tMs = (localTimeSec * 1000) % totalDurationMs`, so at `localTimeSec = N`, `tMs = N × 1000` which falls in frame N's bucket `[N×1000, (N+1)×1000)`. Frame count × `frameDurationMs` gives `totalDurationMs`, so no edge-case issues as long as N < frame count.

**Flipping with `scaleY`.** `RenderObject.scaleY = -1` flips the rendered image vertically (mirrors across the X axis). When doing this, shift `y` down by the object's height so the flipped image stays in its intended visual position:

```typescript
cap.y = capY + capH;  // shift down so the flip maps back to [capY, capY+capH]
cap.scaleX = 1;       // reset in case of pool reuse
cap.scaleY = -1;
```

Setting both `scaleX` and `scaleY` explicitly on pool-reused instances is important: a previous frame may have set a non-default value that would otherwise persist.

**`frameDurationMs` default is 12fps (≈83ms).** The default frameDurationMs is `1000/12`. Using `frameDurationMs: 1000` makes frame index = `localTimeSec` which is easier to reason about when you only need to freeze on individual frames.

### 5. The VisualMedia pool pattern is necessary but undocumented

For falling notes, the number of visible sprites varies frame-to-frame. You can't construct a new `VisualMedia` per note per frame (the decoder would be reinvoked constantly). The correct approach is to pre-allocate a fixed-size pool and mutate instances:

```typescript
private readonly _notePool: VisualMedia[] = Array.from(
    { length: MAX_FALLING_NOTES },
    () => new VisualMedia(0, 0, ..., { layoutBoundsMode: 'none' })
);
```

This works, but it's not mentioned in the docs. A developer who doesn't know about the decode lifecycle would naturally write `new VisualMedia(...)` inside `_buildRenderObjects` and hit poor performance. The docs should either document the pool pattern explicitly, or the API should handle it — e.g., a `VisualMediaList` that manages a pool internally.

### 6. No guidance on which `setFramePlacement` value to use for atlas sprites

The docs describe the placement presets (`'center'`, `'top-left'`, etc.) but give no guidance on which to use when working with Sparrow atlases that have trim offsets. Given that `'center'` is almost always correct for Sparrow sprites and `'top-left'` is almost always wrong, this choice should either be the default or be explicitly called out in the Sparrow atlas documentation.

---

## API Improvement Suggestions

**1. Default `setFramePlacement` to `'center'` when a Sparrow atlas is set.**
The current default is `'top-left'` (frame origin at container origin). For atlases with trim offsets, `'center'` is almost universally correct. Could be auto-applied when `setResource` is called with a Sparrow atlas resource.

**2. Rename `'clip'` fit mode.**
`'native'`, `'pixel-perfect'`, or `'unscaled'` would all be clearer. `'clip'` implies cropping of a scaled image, not native-scale rendering.

**3. Unify `includeInLayoutBounds` interfaces.**
Either add a constructor options object to `Rectangle` (and other primitives) accepting `{ includeInLayoutBounds?: boolean }`, or expose `layoutBoundsMode` as a settable property on `VisualMedia` post-construction. The mismatch is a small but persistent source of friction.

**4. Add a `bundledGridAtlas(filename, layout)` factory method on `SceneElement`.**
Fills the gap between `bundledSprite` (produces `kind:'image'`) and `bundledSparrow` (produces `kind:'sparrow'`). The grid-atlas case currently requires manually calling `loadBundledAsset`, managing a loading flag, and constructing the descriptor each frame — all boilerplate that belongs in a factory. Signature: `bundledGridAtlas(filename: string, layout: AtlasLayout): BundledGridAtlasHandle` returning the same `get()` / `destroy()` interface as `BundledSprite`.

**5. Document the VisualMedia pool pattern.**
A short "Variable-count sprites" section in the docs explaining the pool pattern, with a code snippet, would prevent most developers from hitting the performance issue by accident.

**6. `bundledSparrow` (and `bundledImage`) should warn at load time if the filename doesn't exist.**
Currently, if you typo a filename (`'holdCoverBlu.png'` instead of `'holdCoverBlue.png'`), the `status` comes back as `'loading'` or `'error'` silently during render. A dev-mode warning at construction time (when the asset path is first registered) would catch this immediately.

**7. Consider a `SparrowAtlasView` helper.**
A small utility that, given a loaded resource and an animation name, returns `{ frameW, frameH, trimOffsetX, trimOffsetY }` would allow element authors to correctly compute container sizes for `'clip'` mode without hardcoding frame dimensions as constants. This would remove the `STRUMLINE_FRAME_W = 238` style magic numbers that currently have to be read from the XML manually.
