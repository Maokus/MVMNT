# Render Object Refactor Plan

Status: tasks 1, 2, 3, 5, 6, 7 complete  
Date: 2026-05-29

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

### Backward compatibility

- `setFillColor` and `setGlobalAlpha` are part of the render object public API that elements call. Keep them as `@deprecated` thin wrappers for one release cycle:
    ```typescript
    /** @deprecated Use setFill() */
    setFillColor(color: string | null): this { return this.setFill(color); }
    /** @deprecated Use setOpacity() */
    setGlobalAlpha(alpha: number): this { return this.setOpacity(alpha); }
    ```
- The `globalAlpha` field is currently set directly on shape instances in some elements (e.g. `myRect.globalAlpha = 0.5`). Expose a deprecated property getter/setter that reads/writes `this.opacity` so those call sites still compile.
- `Line.setColor` remains for line-specific usage (it controls stroke color on a line, not fill); adding `setStroke` as an alias does not remove `setColor`.
- Plugin authors who subclass render objects and call `_renderSelf` directly are insulated: `_renderSelf` is always internal.

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

### Backward compatibility

These are module-private helpers consumed only inside `_renderSelf` implementations. No external API surface is affected. Pure additive change.

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

### Backward compatibility

- `Rectangle`, `VisualMedia`, and `PixelGrid` remain the public-facing classes. `BoxRenderObject` is an internal base class not exported from the public SDK surface. No call sites change.
- The `width` and `height` fields move from subclass to base but remain the same type and semantics — no observable difference.
- `setOriginFraction` currently behaves differently between Rectangle (no immediate pivot reapply) and VisualMedia (does reapply). The BoxRenderObject unification should match the VisualMedia behaviour — this is a bug fix on Rectangle, not a breaking change.

---

## Task 4 — Unify bounds modes: separate layout participation from self geometry

**Goal:** replace the confusing tri-state `includeInLayoutBounds: boolean | undefined` with an explicit enum on the base class, while keeping VisualMedia's geometry-selection logic as a separate, VisualMedia-specific field. These are two distinct concerns:

- **Layout participation policy** — should this object/subtree contribute to layout bounds at all?
- **Self geometry mode** — when contributing, how does this object measure its own bounding rect?

The original proposal conflated these by adding `'drawn'` and `'container'` to a base-class type. That forces `RenderObject` to know about VisualMedia-specific draw-region concepts; other classes would silently treat unknown values as `'auto'`. Keeping them separate prevents that leakage.

### Current state

- `includeInLayoutBounds: true | false | undefined` on every `RenderObject`
    - `true` = force-include self and all descendants
    - `false` = force-exclude self and all descendants
    - `undefined` = include self, respect each child's own flag
- `VisualMedia._layoutBoundsMode: 'drawn' | 'container' | 'none'`
    - `'drawn'` (default): bounds = actually drawn/scaled image region
    - `'container'`: bounds = full container rect
    - `'none'`: excluded from layout bounds

### Concept 1 — Layout participation policy on `RenderObject`

```typescript
type LayoutParticipation = 'auto' | 'include' | 'exclude';
layoutParticipation: LayoutParticipation; // default: 'auto'
```

| Value       | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `'auto'`    | Include self; respect each child's own policy (was `undefined`) |
| `'include'` | Force-include self and all descendants (was `true`)         |
| `'exclude'` | Force-exclude self and all descendants (was `false`)        |

`VisualMedia`'s `'none'` value maps directly to `'exclude'` here.

### Concept 2 — Self geometry mode on `VisualMedia` only

```typescript
type SelfBoundsMode = 'drawn' | 'container';
selfBoundsMode: SelfBoundsMode; // default: 'drawn'
```

| Value         | Meaning                                      |
| ------------- | -------------------------------------------- |
| `'drawn'`     | Bounds = actually drawn/scaled image region  |
| `'container'` | Bounds = full container rect                 |

Setter: `setSelfBoundsMode(mode: SelfBoundsMode): this`. This is purely a geometry concern; it has no effect on whether the object participates in layout (that's `layoutParticipation`).

### Backward compatibility

**On `RenderObject`:**
- Keep `includeInLayoutBounds` as a deprecated property getter/setter mapping to/from `layoutParticipation`:
    ```typescript
    /** @deprecated Use layoutParticipation */
    get includeInLayoutBounds(): boolean | undefined {
        if (this.layoutParticipation === 'include') return true;
        if (this.layoutParticipation === 'exclude') return false;
        return undefined;
    }
    set includeInLayoutBounds(v: boolean | undefined) {
        this.layoutParticipation = v === true ? 'include' : v === false ? 'exclude' : 'auto';
    }
    ```
- `setIncludeInLayoutBounds(v)` becomes a deprecated wrapper around `setLayoutParticipation`.

**On `VisualMedia`:**
- Old `setLayoutBoundsMode('none')` maps to `this.layoutParticipation = 'exclude'`
- Old `setLayoutBoundsMode('drawn' | 'container')` maps to `this.selfBoundsMode`
- Keep deprecated `setLayoutBoundsMode(mode)` as a wrapper during transition.

### Migration steps

1. Add `layoutParticipation: LayoutParticipation = 'auto'` to `RenderObject`.
2. In `_getLayoutBoundsRecursive`, replace `includeInLayoutBounds` reads with `layoutParticipation`.
3. Deprecate `includeInLayoutBounds` and `setIncludeInLayoutBounds`; keep as shims.
4. On `VisualMedia`: add `selfBoundsMode: SelfBoundsMode = 'drawn'`; replace `_layoutBoundsMode` field with `selfBoundsMode` + `layoutParticipation`; deprecate `setLayoutBoundsMode`.
5. Update `EmptyRenderObject` constructor which currently hard-codes `includeInLayoutBounds: false` → `layoutParticipation: 'exclude'`.

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

### Backward compatibility

`_applyLayerTransform` is `protected` and internal. No impact on the public API. Pure refactor.

---

---

## Task 6 — Add positional transform setters to RenderObject base

**Goal:** make transform properties chainable via setter methods, consistent with the style-setter pattern established in Task 1.

### Current inconsistency

Task 1 adds `setFill`, `setStroke`, `setOpacity` as chainable setters. `setBlendMode`, `setFilter`, `setOrigin`, `setOriginFraction`, and `setIncludeInLayoutBounds` already exist as chainable methods. But **positional transforms have no setters** — callers must break the chain:

```typescript
// Style properties: chainable ✓
new Rectangle(0, 0, 100, 50)
    .setFill('red')
    .setOpacity(0.8)
    .setOriginFraction(0.5, 0.5);

// Transform properties: must abandon the chain ✗
const r = new Rectangle(0, 0, 100, 50).setFill('red');
r.rotation = Math.PI / 4;  // separate statement
r.visible = false;          // separate statement
```

### Proposed additions on `RenderObject`

```typescript
setPosition(x: number, y: number): this {
    this.x = x; this.y = y; return this;
}
setScale(x: number, y = x): this {
    this.scaleX = x; this.scaleY = y; return this;
}
setRotation(radians: number): this {
    this.rotation = radians; return this;
}
setSkew(x: number, y: number): this {
    this.skewX = x; this.skewY = y; return this;
}
setVisible(v: boolean): this {
    this.visible = v; return this;
}
```

`setOpacity` from Task 1 completes the set — every base-class property that affects render output then has a chainable setter.

### Backward compatibility

Pure additive. No existing code needs to change — direct assignment still works.

### Migration notes

Scene elements that currently break the construction chain to apply transforms can be cleaned up opportunistically. Priority target: `SceneElement._buildContainerObject` (base.ts ~762) which currently does:
```typescript
containerObject.rotation = this.elementRotation;
containerObject.skewX = this.elementSkewX;
containerObject.skewY = this.elementSkewY;
containerObject.visible = this.visible;
```
These could be chained onto the constructor call once setters exist.

---

## Task 7 — Standardise constructor geometry vs. options split

**Goal:** eliminate the inconsistency in how style properties are passed to shape constructors.

### Current state

| Class | Positional args (after x, y) | Style in positional | Style in options |
|-------|------------------------------|---------------------|------------------|
| `Rectangle` | `width, height` | `fillColor, strokeColor, strokeWidth` | `cornerRadius`, shadow, dash… |
| `Text` | `text, font` | `color, align, baseline, strokeColor` | `letterSpacing`, shadow… |
| `Line` | `(x2,y2 via delta)` | `color, lineWidth` | shadow, dash, cap… |
| `Arc` | `radius, startAngle, endAngle, anticlockwise` | _(none)_ | `fillColor, strokeColor, strokeWidth` |
| `VisualMedia` | `width, height` | _(none)_ | `fitMode`, `layoutBoundsMode`… |

Arc and VisualMedia already follow the preferred pattern. Rectangle, Text, and Line pass style properties positionally, forcing callers to pass placeholders (`null`, `0`) to reach later arguments.

### Proposed rule

> Positional args: `(x, y)` + **shape-defining geometry only** (`width, height`, `radius`, `text, font`).  
> Everything else — fill, stroke, opacity, shadow, dash — goes in the options object.

**Rectangle:** `Rectangle(x, y, width, height, options?: RectangleOptions)`  
**Text:** `Text(x, y, text, font, options?: TextOptions)`  
**Line:** `Line(x1, y1, x2, y2, options?: LineOptions)` — `color` and `lineWidth` move to options  

### Backward compatibility

The old positional overloads are used at many call sites. Keep deprecated overloads:
```typescript
// deprecated positional overload kept as a shim:
constructor(x: number, y: number, width: number, height: number,
    fillColor: string | null, strokeColor?: string | null, strokeWidth?: number,
    options?: RectangleOptions);
// preferred:
constructor(x: number, y: number, width: number, height: number, options?: RectangleOptions);
```
TypeScript overloads handle this at compile time. Migrate default-element call sites before removing the shim overloads.

### Why this matters

Beyond aesthetics, the positional style args are the reason Task 1 needs `setFill` / `setStroke` at all — callers reach for setters because the constructor signature is too unwieldy to pass style inline. Once the constructor is options-based, construction can look like:

```typescript
new Rectangle(0, 0, w, h, { fillColor: 'red', cornerRadius: 4, strokeColor: '#000', strokeWidth: 1 })
```

...which is self-documenting and doesn't need setter methods for the common one-shot setup case.

---

## Task 8 — Unify EmptyRenderObject anchor with RenderObject origin

**Goal:** eliminate the separate `anchorFraction` / `anchorOffsetX/Y` API on `EmptyRenderObject` and express the same concept through the base-class `setOriginFraction` already used by BoxRenderObject.

### Current split

`BoxRenderObject.setOriginFraction(fx, fy)` immediately computes `pivotX = fx * width`, `pivotY = fy * height` from known dimensions.

`EmptyRenderObject` can't do this at construction time because its "dimensions" are the runtime layout bounds of its children — not known until render. So it takes a separate `anchorFraction: {x, y}` property that the `render()` method evaluates lazily:

```typescript
// empty.ts, render path
const b = /* children layout bounds */;
const anchorX = b.x + b.width  * this.anchorFraction.x;
const anchorY = b.y + b.height * this.anchorFraction.y;
// then translate by anchorOffsetX/Y around that point...
```

Meanwhile, `SceneElement._buildContainerObject` pre-computes `anchorPixelX/Y` from the same bounds and bakes it into the EmptyRenderObject's world position:

```typescript
// base.ts
containerObject.x = this.offsetX - anchorPixelX;
containerObject.y = this.offsetY - anchorPixelY;
containerObject.anchorOffsetX = anchorPixelX;  // then re-added in empty.ts
containerObject.anchorOffsetY = anchorPixelY;
```

The pre-compute and re-add cancel out to the same geometry, but the API is opaque and uses four fields where conceptually there are two.

### Proposed change

Override `setOriginFraction` on `EmptyRenderObject` to **store the fractions** without immediately resolving them (same as the base-class no-dimension default). Then in `EmptyRenderObject.render`, replace the `anchorFraction` / `anchorOffsetX/Y` logic with a call to `_reapplyPivotFraction(b.width, b.height)` after offsetting `b` to local space — then `pivotX/Y` is correct and the standard base-class pivot path handles the rest.

`SceneElement._buildContainerObject` simplifies to:
```typescript
const container = new EmptyRenderObject(this.offsetX, this.offsetY, scaleX, scaleY, opacity)
    .setRotation(this.elementRotation)
    .setSkew(this.elementSkewX, this.elementSkewY)
    .setVisible(this.visible)
    .setOriginFraction(this.anchorX, this.anchorY);  // ← same as BoxRenderObject pattern
```

`anchorOffsetX`, `anchorOffsetY`, and `anchorFraction` on `EmptyRenderObject` become deprecated and eventually removed.

### Backward compatibility

`anchorOffsetX/Y` and `anchorFraction` are not part of the plugin-sdk public surface — they are set only by `SceneElement._buildContainerObject`. Deprecating them is a pure internal change. Keep the deprecated fields reading/writing `_pivotFractionX/Y` during transition.

### Why this is worth doing

- Same concept, one API — `setOriginFraction` works identically on every render object type.
- `SceneElement._buildContainerObject` loses ~6 lines of pre-computation that currently require understanding the anchor-offset cancellation trick.
- Task 3 (BoxRenderObject) and Task 8 together mean every concrete render object that has "dimensions" (fixed or bounds-derived) uses `setOriginFraction` the same way.

---

## Suggested implementation order

1. **Task 5** — pure refactor, zero risk, no API changes, enables cleaner work on others
2. **Task 3** — BoxRenderObject, additive, no breaking changes
3. **Task 6** — transform setters, additive, zero risk; enables cleaner construction in later tasks
4. **Task 2** — style helpers, reduces `_renderSelf` boilerplate
5. **Task 1** — API rename, most visible change; do after helpers are in place
6. **Task 4** — bounds mode unification, touches the most files but scope is well-defined
7. **Task 8** — EmptyRenderObject origin unification; depends on Task 3's `setOriginFraction` pattern being established and Task 6's setters
8. **Task 7** — constructor standardization; highest migration cost, do last once the setter API is stable
