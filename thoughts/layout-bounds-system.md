# Layout Bounds System

## Core Mechanism

Layout bounds are computed recursively from the render object tree. Each render object carries a three-state `includeInLayoutBounds` property:

- `true` — force-include self and all descendants
- `false` — force-exclude self and all descendants
- `undefined` — include self, let each child decide independently

The algorithm (`_getLayoutBoundsRecursive` in `src/core/render/render-objects/base.ts`) propagates a policy down the tree:

- Parent `force-include` → all children also force-included
- Parent `force-exclude` → returns `null` immediately, no children evaluated
- Parent `respect` → each child evaluated on its own `includeInLayoutBounds`

The aggregate layout bounds is the union of all contributing objects' self bounds. Each render object subclass overrides `_getSelfBounds()` to return its own rectangle accounting for stroke, text metrics, arc geometry, etc.

There is also `getVisualBounds()` which ignores `includeInLayoutBounds` entirely and unions everything — used for debug overlays.

## How Layout Bounds Is Used

The primary consumer is `SceneElement` base (`src/core/scene/elements/base.ts` ~line 684). It:

1. Collects layout bounds from all child render objects
2. Uses this to compute the anchor pixel position (`anchorX`/`anchorY` fractions × bounds width/height)
3. Positions the container `EmptyRenderObject` relative to the anchor point
4. Stashes the bounds as `baseBounds` metadata on the container, consumed by the UI layer for selection handles and transform math

So layout bounds directly controls: anchor point calculation, transform origin, selection handle placement, and hit testing.

## VisualMedia Special Cases

`VisualMedia` (`src/core/render/render-objects/visual-media.ts`) has a `layoutBoundsMode` option with three values:

| Mode                | Behaviour                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'drawn'` (default) | Bounds track the actual drawn/scaled image region. For `contain` fit mode this is smaller than the container (letterboxed); computed from live image dimensions each frame. |
| `'container'`       | Bounds equal the full container rect (`0, 0, width, height`) regardless of image dimensions or fit mode. Stable but decoupled from actual pixels.                           |
| `'none'`            | Sets `includeInLayoutBounds = false`. Object is excluded from layout bounds entirely.                                                                                       |

The special-case code in `_getSelfBounds()` (lines ~676–697) handles this:

```typescript
protected _getSelfBounds(): Bounds {
    if (this._layoutBoundsMode === 'container') {
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
    // 'drawn' mode — compute actual drawn region
    if (this.fitMode === 'cover' || this.fitMode === 'fill' || !this.preserveAspectRatio) {
        return this._computeTransformedRectBounds(0, 0, this.width, this.height);
    }
    const { imgW, imgH } = this.#currentImageDimensions();
    if (imgW && imgH) {
        const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams(imgW, imgH);
        return this._computeTransformedRectBounds(drawX, drawY, drawWidth, drawHeight);
    }
    return this._computeTransformedRectBounds(0, 0, this.width, this.height);
}
```

The reason this complexity exists: images with `contain` fit mode draw within a letterbox or pillarbox region that depends on the loaded image's actual aspect ratio. If layout bounds tracked the full container, anchor points and selection handles would be consistent but detached from the visible image. If they tracked the drawn region, they'd be accurate but could jitter as image dimensions update.

## The Layout Rectangle Pattern

The newer pattern avoids all of the above complexity by:

1. Creating an invisible `Rectangle` at the desired layout size (no fill, no stroke)
2. Leaving it at default `includeInLayoutBounds = undefined` so it contributes
3. Setting the `VisualMedia` to `layoutBoundsMode: 'none'` (excluded)
4. Marking any other decorative render objects `includeInLayoutBounds = false`

The layout rect is the _only_ thing that contributes, making bounds entirely explicit and stable.

### Scene elements using this pattern

| File                                                                                 | Notes                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `src/core/scene/elements/misc/image.ts`                                              | `_layoutRect` + `VisualMedia` with `layoutBoundsMode: 'none'` |
| `src/core/scene/elements/_templates/bundled-image.ts`                                | Same approach                                                 |
| `src/core/scene/elements/_templates/image-simple.ts`                                 | Same approach                                                 |
| `src/core/scene/elements/_templates/image-atlas.ts`                                  | Same approach                                                 |
| `src/core/scene/elements/midi-displays/time-unit-piano-roll/time-unit-piano-roll.ts` | Invisible rect for layout; animated lines/text marked `false` |

### Scene elements still using implicit exclusion (not the layout rect pattern)

Most audio/waveform/MIDI elements mark individual render objects `includeInLayoutBounds = false` ad-hoc:

- `audio-waveform.ts` — waveform polys excluded
- `audio-locked-oscilloscope.ts` — oscilloscope poly excluded
- `notes-playing-display.ts` — animation overlays excluded
- Various note animation types — animation shapes excluded
- `time-unit-piano-roll.ts` — grid lines, note labels, animations excluded (some objects still use ad-hoc exclusion alongside the layout rect)

## Assessment

The layout rect pattern is strictly superior for elements with visual content that varies in size or animates:

- **Predictable**: bounds don't change based on image load state or animation frame
- **Explicit**: the layout intent is encoded directly as a rect, not inferred from what's left over
- **Composable**: adding new decorative render objects doesn't accidentally affect layout unless you forget to mark them `false`

The `VisualMedia` `layoutBoundsMode: 'drawn'` and `'container'` modes exist as a mid-ground — they're reasonable for standalone uses but the complexity of per-fit-mode special-casing suggests they predate the layout rect pattern. For any element with a `VisualMedia`, the layout rect + `layoutBoundsMode: 'none'` approach is cleaner.

The main remaining question is whether existing elements that use ad-hoc `includeInLayoutBounds = false` on individual objects (waveforms, oscilloscopes, etc.) would benefit from a migration to an explicit layout rect. For elements where the "background" rect naturally defines the layout bounds, yes — it would make the intent clear and prevent accidental breakage when adding new render objects.
