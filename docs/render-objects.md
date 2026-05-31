# Render Objects Reference

`src/core/render/render-objects/`

The render-object system is a scene-graph renderer built on the Canvas 2D API. Every drawable entity extends `RenderObject` and participates in a parent–child hierarchy with inherited transforms.

---

## Core Concepts

### Transform Pipeline

`render(ctx, config, time)` applies transforms in this order before calling `_renderSelf()`:

1. Translate to `(x, y)`
2. Rotate by `rotation` (radians)
3. Scale by `(scaleX, scaleY)`
4. Skew by `(skewX, skewY)`
5. Translate by `(-originX, -originY)` (so origin becomes the pivot)

Children inherit the accumulated transform.

### Bounds

Two kinds of bounds are available on every object:

- **`getVisualBounds()`** — union of self + all children, ignoring `layoutParticipation`. Never null.
- **`getLayoutBounds()`** — same union but gated by `layoutParticipation`; returns `null` if excluded.

Subclasses override `_getSelfBounds()` to report their own extent. Shapes account for stroke width, shadow spread, etc.

### Layout Participation

`layoutParticipation: 'auto' | 'include' | 'exclude'`

| Value       | Meaning                                             |
| ----------- | --------------------------------------------------- |
| `'auto'`    | Include self, respect children's policies (default) |
| `'include'` | Force-include self and all descendants              |
| `'exclude'` | Force-exclude self and all descendants              |

`EmptyRenderObject` defaults to `'exclude'` because containers usually don't contribute their own bounds.

---

## Class Hierarchy

```
RenderObject (abstract)
├── BoxRenderObject (abstract)  — adds width/height + origin-fraction reapplication
│   ├── Rectangle
│   ├── VisualMedia
│   └── PixelGrid
├── EmptyRenderObject           — no intrinsic visual; container / anchor debug
│   ├── ClipLayer
│   ├── CompositeLayer
│   └── GlowLayer
├── Line
├── Arc
├── BezierPath
├── Text
└── Poly
```

---

## RenderObject (base)

**`src/core/render/render-objects/base.ts`**

All renderable objects extend this class.

### Transform properties

| Property             | Type      | Default | Notes                            |
| -------------------- | --------- | ------- | -------------------------------- |
| `x`, `y`             | `number`  | `0`     | World position                   |
| `scaleX`, `scaleY`   | `number`  | `1`     | Scale factors                    |
| `rotation`           | `number`  | `0`     | Radians                          |
| `skewX`, `skewY`     | `number`  | `0`     | Radians                          |
| `opacity`            | `number`  | `1`     | 0–1; applied as `globalAlpha`    |
| `visible`            | `boolean` | `true`  | Skip render when false           |
| `originX`, `originY` | `number`  | `0`     | Local-space pivot point (pixels) |

### Layout / composition

| Property              | Type                               | Default  |
| --------------------- | ---------------------------------- | -------- |
| `children`            | `RenderObject[]`                   | `[]`     |
| `layoutParticipation` | `LayoutParticipation`              | `'auto'` |
| `blendMode`           | `GlobalCompositeOperation \| null` | `null`   |
| `filter`              | `string \| null`                   | `null`   |

### Key methods

```typescript
// Transform (chainable — all return `this`)
setPosition(x, y)
setScale(x, y)
setRotation(radians)
setSkew(x, y)
setOpacity(alpha)        // clamps to [0, 1]
setOrigin(x, y)          // pixels
setOriginFraction(x, y)  // fractions of own dimensions (BoxRenderObject subclasses reapply on resize)
setBlendMode(mode)
setFilter(filter)

// Hierarchy
addChild(child)
addChildren(children)
removeChild(child)
clearChildren()

// Bounds
getVisualBounds(): Bounds
getLayoutBounds(): Bounds | null
```

### Subclass extension points

```typescript
protected _renderSelf(ctx: CanvasRenderingContext2D, config: RenderConfig, time: number): void
protected _getSelfBounds(): Bounds | null
```

---

## BoxRenderObject (abstract)

**`src/core/render/render-objects/box.ts`**

Base for objects with a known rectangular extent. Adds `width` / `height` and ensures origin fractions are reapplied whenever `setSize()` is called.

```typescript
width: number
height: number
setSize(w: number, h: number): this
```

---

## Primitives

### Rectangle

```typescript
new Rectangle(x, y, width, height, options?: RectangleOptions)
```

| Option                             | Type                  | Default  |
| ---------------------------------- | --------------------- | -------- |
| `fillColor`                        | `string`              | —        |
| `strokeColor`                      | `string`              | —        |
| `strokeWidth`                      | `number`              | `1`      |
| `cornerRadius`                     | `number`              | `0`      |
| `lineDash`                         | `number[]`            | `[]`     |
| `lineDashOffset`                   | `number`              | `0`      |
| `shadowColor/Blur/OffsetX/OffsetY` | `string / number`     | —        |
| `layoutParticipation`              | `LayoutParticipation` | `'auto'` |

Key methods: `setFill(color)`, `setStroke(color, width)`, `setCornerRadius(r)`, `setShadow(color, blur, ox, oy)`

Bounds include stroke-width padding.

---

### Line

```typescript
new Line(x, y, deltaX, deltaY, options?: LineOptions)
```

Endpoints are expressed as a start point `(x, y)` plus a delta `(deltaX, deltaY)` so the whole object translates correctly.

| Option                             | Type            | Default  |
| ---------------------------------- | --------------- | -------- |
| `color`                            | `string`        | `'#000'` |
| `lineWidth`                        | `number`        | `1`      |
| `lineCap`                          | `CanvasLineCap` | `'butt'` |
| `lineDash`                         | `number[]`      | `[]`     |
| `lineDashOffset`                   | `number`        | `0`      |
| `shadowColor/Blur/OffsetX/OffsetY` | —               | —        |

**Static factories:**

```typescript
Line.createVerticalLine(x, y1, y2, color?, width?)
Line.createHorizontalLine(x1, x2, y, color?, width?)
Line.createPlayhead(x, y1, y2, color?, width?)
```

Key methods: `setEndPoint(x2, y2)`, `setDelta(dx, dy)`, `setColor(color)`, `setStroke(color, width)`, `setLineCap(cap)`, `setShadow(...)`

---

### Arc

```typescript
new Arc(x, y, radius, options?: ArcOptions)
```

| Option          | Type             | Default       |
| --------------- | ---------------- | ------------- |
| `startAngle`    | `number`         | `0`           |
| `endAngle`      | `number`         | `Math.PI * 2` |
| `anticlockwise` | `boolean`        | `false`       |
| `fillColor`     | `string`         | —             |
| `strokeColor`   | `string`         | —             |
| `strokeWidth`   | `number`         | `1`           |
| `fillRule`      | `CanvasFillRule` | `'nonzero'`   |

`arcFillStyle: 'segment' | 'sector'` controls whether fill closes to the arc chord (`segment`) or to the center point (pie slice, `sector`).

Bounds handle partial arcs by sampling cardinal points (0°, 90°, 180°, 270°).

Key methods: `setRadius(r)`, `setAngles(start, end, anticlockwise?)`, `setFill(color)`, `setStroke(color, width)`

---

### BezierPath

```typescript
new BezierPath(x, y, options?)
```

Draws an arbitrary 2D path from a sequence of commands.

**Command types:**

```typescript
type BezierPathCommand =
    | { type: 'moveTo'; x: number; y: number }
    | { type: 'lineTo'; x: number; y: number }
    | { type: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
    | { type: 'bezierCurveTo'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
    | { type: 'closePath' };
```

**Builder API (chainable):**

```typescript
path.moveTo(x, y).lineTo(x, y).quadraticCurveTo(cpx, cpy, x, y).bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y).closePath();
```

Or set all at once: `setCommands(commands)` / `getCommands()` / `clear()`

Style methods: `setFill(color)`, `setStroke(color, width)`, `setLineJoin(join)`, `setLineCap(cap)`, `setMiterLimit(limit)`, `setLineDash(dash, offset)`, `setFillRule(rule)`, `setShadow(...)`

Bounds are computed from Bezier extrema (derivative roots), not a simple bounding box of control points.

---

### Text

```typescript
new Text(x, y, text: string, font: string, options?: TextOptions)
```

| Option          | Type                                | Default        |
| --------------- | ----------------------------------- | -------------- |
| `color`         | `string`                            | `'#000'`       |
| `align`         | `CanvasTextAlign`                   | `'left'`       |
| `baseline`      | `CanvasTextBaseline`                | `'alphabetic'` |
| `strokeColor`   | `string`                            | —              |
| `strokeWidth`   | `number`                            | `1`            |
| `maxWidth`      | `number`                            | —              |
| `letterSpacing` | `number`                            | —              |
| `shadow`        | `{ color, blur, offsetX, offsetY }` | —              |

Key methods: `setText(text)`, `setFont(font)`, `setColor(color)`, `setAlignment(align, baseline)`, `setStroke(color, width)`, `setMaxWidth(w)`, `setShadow(color, blur, ox, oy)`

`measureText(ctx): TextMetrics` measures without full bounds computation.

Bounds use an offscreen canvas for accurate `TextMetrics`. Falls back to a heuristic (`length × fontSize × 0.6`) when a rendering context is unavailable.

---

### Poly

```typescript
new Poly(x, y, points, options?: PolyOptions)
```

Flexible point input — all three formats are accepted:

```typescript
// Objects
[{ x: 0, y: 0 }, { x: 100, y: 0 }, ...]

// Flat array
[0, 0, 100, 0, ...]

// Tuples
[[0, 0], [100, 0], ...]
```

Key methods: `setPoints(points)`, `addPoint(x, y)`, `clearPoints()`, `setFill(color)`, `setStroke(color, width)`, `setClosed(bool)`, `setLineJoin(join)`, `setShadow(...)`

Fill only renders when `closed = true`.

---

## Containers

### EmptyRenderObject

**`src/core/render/render-objects/empty.ts`**

A container with no intrinsic visual. Default `layoutParticipation = 'exclude'`.

Supports optional anchor-point debug visualization (`showAnchorPoints` in `RenderConfig`) that draws cyan/magenta bounds rects and a yellow crosshair.

```typescript
new EmptyRenderObject(x, y)
addChildren([...])
```

---

### ClipLayer

**`src/core/render/render-objects/clip-layer.ts`**

Clips all children to a rectangular region in local space.

```typescript
new ClipLayer(width: number, height: number)
setClipSize(width, height)
```

Clip region is `(0, 0, clipWidth, clipHeight)` in local coordinates; inherits the layer's world transform.

---

### CompositeLayer

**`src/core/render/render-objects/composite-layer.ts`**

Renders children into an isolated `OffscreenCanvas`, then composites the result onto the main canvas with a blend mode. Necessary when a blend mode should apply to the group as a whole (not to each child individually).

```typescript
new CompositeLayer()
setLayerBlendMode(mode: GlobalCompositeOperation)
```

**Common use cases:**

| Blend mode         | Effect                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| `'destination-in'` | Shape punches a mask through the group                                     |
| `'multiply'`       | Group multiplies against scene; children don't multiply against each other |
| `'screen'`         | Group screens against scene                                                |

Requires `canvas` in `RenderConfig` to determine offscreen size. Falls back to normal render otherwise.

---

### GlowLayer

**`src/core/render/render-objects/glow-layer.ts`**

Renders children twice: a normal pass plus a blurred glow pass composited on top.

```typescript
new GlowLayer()
setGlow(
  blur: number,
  opacity: number,
  blendMode: GlobalCompositeOperation = 'screen',
  resolution: number = 0.5    // 0–1; smaller = cheaper
)
```

| Property         | Default    | Notes                                       |
| ---------------- | ---------- | ------------------------------------------- |
| `glowBlur`       | `10`       | Blur radius in pixels                       |
| `glowOpacity`    | `0.8`      | 0–1                                         |
| `glowBlendMode`  | `'screen'` | How glow blends onto scene                  |
| `glowResolution` | `0.5`      | Fraction of canvas resolution for blur pass |

`glowResolution < 1.0` reduces cost significantly (0.25 = 16× fewer blur pixels) with minimal perceptual impact. Offscreen canvases are reused across frames to avoid allocation pressure.

---

### VisualMedia

**`src/core/render/render-objects/visual-media.ts`**

Renders a decoded image or animation resource into a container box. `VisualMedia` does not own or load assets; the owning element resolves a `VisualResourceHandle` and feeds the result via `setResource()`.

```typescript
new VisualMedia(x, y, width, height, options?: VisualMediaOptions)
```

#### Fit modes

| Mode        | Behavior                                                                | Bounds            |
| ----------- | ----------------------------------------------------------------------- | ----------------- |
| `'contain'` | Scale to fit within box, preserve aspect ratio. Letterbox bars visible. | Scaled image rect |
| `'cover'`   | Scale to fill box, preserve aspect ratio. Overflow is clipped.          | Full container    |
| `'fill'`    | Stretch to fill (may distort).                                          | Full container    |
| `'none'`    | 1:1 pixel scale, centered, clipped to container.                        | Drawn region      |
| `'clip'`    | 1:1 pixel scale, position controlled by `framePlacement`.               | Drawn region      |

#### Frame placement (clip mode)

```typescript
// Named preset: 'center' | 'top-left' | 'top-center' | 'top-right' |
//               'center-left' | 'center-right' |
//               'bottom-left' | 'bottom-center' | 'bottom-right'
media.setFramePlacement('top-left');

// Custom: align container point (cx, cy) with frame point (fx, fy)
media.setFramePlacement({ container: [0.5, 0.5], frame: [0, 0] });
```

#### Key methods

```typescript
setResource(resource: VisualResource | null, status?: ResourceStatus)
setStatus(status: ResourceStatus)      // 'idle' | 'loading' | 'ready' | 'error'
setLocalTime(seconds: number)          // animation playback position
setAnimation(name: string | null)      // named animation (Sparrow)
setFitMode(mode)
setPreserveAspectRatio(bool)
setDimensions(w, h)
setShadow(color, blur, ox, oy)
setSelfBoundsMode(mode: 'drawn' | 'container')
isReady(): boolean
```

#### Debug overlay

Set `showDebug: true` in options or `RenderConfig` to enable:

- Cyan dashed — container rect
- Green solid — drawn/clipped region
- Purple dashed — full unclipped frame (clip mode only)
- Orange ⊕ — frame placement anchor
- Yellow ◆ — transform origin

---

### PixelGrid

**`src/core/render/render-objects/pixel-grid.ts`**

Renders a rectangular grid of RGBA cells from a flat `Uint8ClampedArray`. Uses `OffscreenCanvas` + `putImageData` for performance — far faster than one `RenderObject` per cell.

```typescript
new PixelGrid(x, y, cols: number, rows: number, options?: PixelGridOptions)
updatePixels(pixels: Uint8ClampedArray)   // cols × rows × 4 bytes, RGBA
```

Cache the instance and call `updatePixels()` each frame rather than recreating. Renders with nearest-neighbour scaling (no smoothing).

---

## Style Helpers

**`src/core/render/render-objects/style-helpers.ts`**

Utilities for applying and clearing canvas style state. Shapes call these internally, but custom subclasses can use them too.

```typescript
applyShadow(ctx, obj: HasShadow)   // shadowColor/Blur/OffsetX/OffsetY
clearShadow(ctx, obj: HasShadow)
applyDash(ctx, obj: HasDash)       // lineDash[], lineDashOffset
clearDash(ctx, obj: HasDash)
applyStroke(ctx, obj: HasStroke)   // strokeColor, strokeWidth → strokeStyle, lineWidth
applyFill(ctx, obj: HasFill)       // fillColor → fillStyle
```

`applyShadow` is a no-op when `shadowBlur === 0` or `shadowColor` is falsy, so it is safe to call unconditionally.

---

## RenderConfig

Passed to every `render()` call and forwarded to `_renderSelf()`.

```typescript
interface RenderConfig {
    canvas?: HTMLCanvasElement; // required by CompositeLayer and GlowLayer for offscreen sizing
    showAnchorPoints?: boolean; // EmptyRenderObject debug overlay
    showDebug?: boolean; // VisualMedia debug overlay
    [key: string]: any; // extensible for custom render objects
}
```

---

## Common Patterns

### Building a scene graph

```typescript
const root = new EmptyRenderObject(0, 0);
root.addChildren([
    new Rectangle(10, 10, 200, 80, { fillColor: '#1a1a2e', cornerRadius: 8 }),
    new GlowLayer().setGlow(16, 0.9).addChildren([new Arc(150, 50, 40, { fillColor: '#ff6b6b' })]),
    new ClipLayer(200, 200).addChildren([new Line(0, 0, 200, 200, { color: '#4ecdc4', lineWidth: 2 })]),
]);

// Per-frame render
ctx.clearRect(0, 0, canvas.width, canvas.height);
root.render(ctx, { canvas, showDebug: false }, currentTimeSecs);
```

### Custom render object

```typescript
class MyShape extends RenderObject {
    protected _renderSelf(ctx, config, time) {
        ctx.fillStyle = 'hotpink';
        ctx.fillRect(0, 0, 80, 40);
    }

    protected _getSelfBounds() {
        return this._computeTransformedRectBounds(0, 0, 80, 40);
    }
}
```

### VisualMedia integration

```typescript
const media = new VisualMedia(0, 0, 300, 300, {
    fitMode: 'contain',
    originX: 0.5,
    originY: 0.5,
});

// In element's onRender():
const { resource, status } = this.visualHandle.resolve();
media.setResource(resource, status);
media.setLocalTime(currentTimeSecs);
media.setAnimation('idle');
```

---

## Deprecated APIs

These still work but should not be used in new code.

| Deprecated                                | Replacement                                          |
| ----------------------------------------- | ---------------------------------------------------- |
| `globalAlpha`                             | `opacity`                                            |
| `includeInLayoutBounds`                   | `layoutParticipation`                                |
| `setPivot(x, y)`                          | `setOrigin(x, y)`                                    |
| `setPivotFraction(x, y)`                  | `setOriginFraction(x, y)`                            |
| `setFillColor(c)`                         | `setFill(c)`                                         |
| `VisualMedia.setContentAnchor(x, y)`      | `setFramePlacement(...)`                             |
| `VisualMedia.setFrameAnchor(x, y)`        | `setFramePlacement(...)`                             |
| `VisualMedia.setLayoutBoundsMode(m)`      | `setSelfBoundsMode(m)` + `setLayoutParticipation(p)` |
| `EmptyRenderObject.setAnchorOffset(x, y)` | `setOriginFraction(x, y)`                            |
