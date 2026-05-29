# Render Object Refactor Plan

Status: planning  
Date: 2026-05-29

---

## What has already been fixed (done before this plan)

- **Rectangle double opacity**: `_renderSelf` was re-multiplying `ctx.globalAlpha` by `this.opacity` even though the base `render()` already does it. The duplicate line has been removed.
- **Negative size/stroke clamping**: `Math.max(0, ...)` added to `Rectangle.setSize`, and to `setStroke`/`setLineWidth` across all shape classes (Rectangle, Arc, Line, BezierPath, Poly, Text).

---

## Task 1 — Standardise style APIs

**Goal:** every shape class exposes the same method names for the same concepts.

### Current inconsistencies

| Method      | Rectangle        | Arc              | Line                      | BezierPath       | Poly             | Text        |
| ----------- | ---------------- | ---------------- | ------------------------- | ---------------- | ---------------- | ----------- |
| Set fill    | `setFillColor`   | `setFillColor`   | _(no fill)_               | `setFillColor`   | `setFillColor`   | `setColor`  |
| Set stroke  | `setStroke`      | `setStroke`      | `setColor`+`setLineWidth` | `setStroke`      | `setStroke`      | `setStroke` |
| Set opacity | `setGlobalAlpha` | `setGlobalAlpha` | _(none)_                  | `setGlobalAlpha` | `setGlobalAlpha` | _(none)_    |
| Set shadow  | `setShadow`      | `setShadow`      | `setShadow`               | `setShadow`      | `setShadow`      | `setShadow` |

### Proposed changes

**`setFill(color)`** — rename `setFillColor` → `setFill` on Rectangle, Arc, BezierPath, Poly. Add `setFill` on Text as an alias for `setColor`. Keep `setFillColor` as a deprecated alias during transition.

**`setStroke(color, width?)`** — already consistent on most classes. Add `setStroke(color, width)` to Line (wrapping `setColor` + `setLineWidth`) so callers don't need two calls.

**`setOpacity(alpha)`** — rename `setGlobalAlpha` → `setOpacity` everywhere. Also add `setOpacity` on the base `RenderObject` as a convenience setter for `this.opacity` (clamped to [0,1]). The per-class `globalAlpha` property currently multiplies on top of the base `opacity`, which is confusing. Proposal: remove the per-class `globalAlpha` field entirely and collapse into the base `opacity`. If a caller sets both `myRect.opacity = 0.5` (base) and `myRect.setGlobalAlpha(0.5)` (class), right now they get 0.25. After the change, there is only one opacity value — the base `opacity`, settable via `setOpacity(alpha)`.

**`setShadow(color, blur, offsetX, offsetY)`** — already consistent. No change needed.

### Migration path

1. Add `setFill` / `setStroke` / `setOpacity` on each class.
2. Remove `globalAlpha` field from shape classes; update `_renderSelf` to no longer read it.
3. `@deprecated` tag `setFillColor` / `setGlobalAlpha`; keep as thin wrappers for one release.
4. Search `setFillColor` / `setGlobalAlpha` usage in default elements and update.

---

## Task 2 — Extract shared style helpers

**Goal:** eliminate repeated boilerplate in every `_renderSelf` for shadow setup/teardown, dash setup/teardown, stroke setup, fill setup, and alpha management.

### Boilerplate that currently repeats in ~6 files

```typescript
// Alpha (in shape classes that have globalAlpha)
const originalAlpha = ctx.globalAlpha;
if (this.globalAlpha !== 1) ctx.globalAlpha = originalAlpha * this.globalAlpha;
// ...draw...
if (this.globalAlpha !== 1) ctx.globalAlpha = originalAlpha;

// Shadow setup
if (this.shadowColor && this.shadowBlur > 0) {
    ctx.shadowColor = this.shadowColor;
    ctx.shadowBlur = this.shadowBlur;
    ctx.shadowOffsetX = this.shadowOffsetX;
    ctx.shadowOffsetY = this.shadowOffsetY;
}
// Shadow teardown
if (this.shadowColor && this.shadowBlur > 0) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// Dash setup
if (this.lineDash.length > 0) {
    ctx.setLineDash(this.lineDash);
    ctx.lineDashOffset = this.lineDashOffset;
}
// Dash teardown
if (this.lineDash.length > 0) {
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
}
```

### Proposed helpers file: `src/core/render/render-objects/style-helpers.ts`

```typescript
// Interfaces used by the helpers — shapes implement these structurally
interface HasShadow {
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
}
interface HasDash {
    lineDash: number[];
    lineDashOffset: number;
}
interface HasStroke {
    strokeColor: string | null;
    strokeWidth: number;
}
interface HasFill {
    fillColor: string | null;
}

export function applyShadow(ctx: Ctx, s: HasShadow): void;
export function clearShadow(ctx: Ctx, s: HasShadow): void;

export function applyDash(ctx: Ctx, s: HasDash): void;
export function clearDash(ctx: Ctx, s: HasDash): void;

export function applyStroke(ctx: Ctx, s: HasStroke): void; // sets strokeStyle + lineWidth
export function applyFill(ctx: Ctx, s: HasFill): void; // sets fillStyle
```

Once Task 1 removes the per-class `globalAlpha`, the alpha boilerplate disappears too, so no helper is needed for it.

Each `_renderSelf` reduces to a clear sequence of `apply* / draw / clear*` calls.

---

## Task 3 — Introduce BoxRenderObject

**Goal:** extract the shared width/height/origin behaviour from Rectangle, VisualMedia, and PixelGrid into a common base.

### Currently duplicated across those three classes

- `width` and `height` fields
- `setSize(width, height)` with clamping to `≥ 0`
- `setOriginFraction(x, y)` override that immediately reapplies pivots
- `_getSelfBounds()` returning a rect from `(0,0)` to `(width,height)` (before stroke padding)

### Proposed class

```
RenderObject (abstract)
  └── BoxRenderObject (abstract)       ← new
        ├── Rectangle
        ├── VisualMedia
        └── PixelGrid
```

`BoxRenderObject` provides:

- `width: number` / `height: number` (clamped on set)
- `setSize(w, h): this` — `Math.max(0, ...)` applied here once
- Override of `setOriginFraction(x, y)` that stores fractions AND immediately calls `_reapplyPivotFraction(width, height)` — currently VisualMedia overrides this but Rectangle does not
- Default `_getSelfBounds()` returning the untransformed `(0,0,w,h)` rect passed through `_computeTransformedRectBounds` — subclasses that need stroke padding or fit-mode logic still override

---

## Task 4 — Unify bounds modes around layoutBoundsMode

**Goal:** replace the confusing tri-state `includeInLayoutBounds: boolean | undefined` with an explicit enum-style field that VisualMedia's three-way logic can also slot into.

### Current state

- `includeInLayoutBounds: true | false | undefined` on every `RenderObject`
    - `true` = force-include self and all descendants
    - `false` = force-exclude self and all descendants
    - `undefined` = include self, respect each child's own flag
- `VisualMedia` has a separate `layoutBoundsMode: 'drawn' | 'container' | 'none'` field that overrides the above inside `_getSelfBounds`

### Proposed unified field

```typescript
type LayoutBoundsMode = 'auto' | 'include' | 'exclude' | 'drawn' | 'container';
layoutBoundsMode: LayoutBoundsMode; // default: 'auto'
```

| Value         | Meaning                                                         |
| ------------- | --------------------------------------------------------------- |
| `'auto'`      | Include self; respect each child's own policy (was `undefined`) |
| `'include'`   | Force-include self and all descendants (was `true`)             |
| `'exclude'`   | Force-exclude self and all descendants (was `false`)            |
| `'drawn'`     | VisualMedia: bounds = actually drawn region                     |
| `'container'` | VisualMedia: bounds = full container rect                       |

`'drawn'` and `'container'` only make sense on `VisualMedia`; other classes treat them the same as `'auto'`.

### Migration steps

1. Add `layoutBoundsMode: LayoutBoundsMode = 'auto'` to `RenderObject`.
2. In `_getLayoutBoundsRecursive`, map `layoutBoundsMode` to the existing tri-state policy logic.
3. Replace `includeInLayoutBounds` reads/writes with `layoutBoundsMode`. Deprecate `setIncludeInLayoutBounds`.
4. Remove `VisualMedia`'s separate `layoutBoundsMode` field; fold into base.
5. Update `EmptyRenderObject` constructor which currently hard-codes `includeInLayoutBounds: false` → `layoutBoundsMode: 'exclude'`.

---

## Task 5 — Refactor layer transform logic

**Goal:** extract the anchor-pivot transform block from `EmptyRenderObject.render` so that `GlowLayer`, `CompositeLayer`, and `ClipLayer` call a shared method instead of duplicating it.

### The duplicated block (appears 3 times)

```typescript
ctx.translate(this.x, this.y);
if (this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1 || this.skewX !== 0 || this.skewY !== 0) {
    ctx.translate(this.anchorOffsetX, this.anchorOffsetY);
    if (this.rotation !== 0) ctx.rotate(this.rotation);
    if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
    if (this.skewX !== 0 || this.skewY !== 0) {
        ctx.transform(1, Math.tan(this.skewY), Math.tan(this.skewX), 1, 0, 0);
    }
    ctx.translate(-this.anchorOffsetX, -this.anchorOffsetY);
}
```

### Proposed extraction on EmptyRenderObject

```typescript
protected _applyLayerTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.x, this.y);
    if (this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1 || this.skewX !== 0 || this.skewY !== 0) {
        ctx.translate(this.anchorOffsetX, this.anchorOffsetY);
        if (this.rotation !== 0) ctx.rotate(this.rotation);
        if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
        if (this.skewX !== 0 || this.skewY !== 0) {
            ctx.transform(1, Math.tan(this.skewY), Math.tan(this.skewX), 1, 0, 0);
        }
        ctx.translate(-this.anchorOffsetX, -this.anchorOffsetY);
    }
}
```

`EmptyRenderObject.render`, `ClipLayer.render`, and the offscreen-setup path in `GlowLayer.render` / `CompositeLayer.render` all call `this._applyLayerTransform(ctx)`.

CompositeLayer and GlowLayer pass their offscreen context: `this._applyLayerTransform(offCtx)`.

No behaviour changes — purely mechanical extraction.

---

## Suggested implementation order

1. **Task 5** — pure refactor, zero risk, no API changes, enables cleaner work on others
2. **Task 3** — BoxRenderObject, additive, no breaking changes
3. **Task 2** — style helpers, reduces `_renderSelf` boilerplate
4. **Task 1** — API rename, most visible change; do after helpers are in place
5. **Task 4** — bounds mode unification, touches the most files but scope is well-defined
