# Render Object Constructor Signatures

Reference for constructors in `src/core/render/render-objects` as of 2026-05-29.

## Shared Types

```ts
type LayoutParticipation = 'auto' | 'include' | 'exclude';

type Bounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type RenderConfig = {
    canvas?: HTMLCanvasElement;
    showAnchorPoints?: boolean;
    showDebug?: boolean;
    [key: string]: any;
};
```

## Base Classes

### `RenderObject`

Defined in `base.ts`. Abstract base for all render objects.

```ts
constructor(
    x = 0,
    y = 0,
    scaleX = 1,
    scaleY = 1,
    opacity = 1,
    options?: {
        layoutParticipation?: LayoutParticipation;
        /** @deprecated Use layoutParticipation instead. */
        includeInLayoutBounds?: boolean | undefined;
        pivotX?: number;
        pivotY?: number;
    }
)
```

Defaults:

- `x`, `y`: `0`
- `scaleX`, `scaleY`: `1`
- `opacity`: `1`
- `pivotX`, `pivotY`: `0`
- `layoutParticipation`: `options.layoutParticipation`, otherwise deprecated `includeInLayoutBounds`, otherwise `'auto'`
- `blendMode`: `null`
- `filter`: `null`

### `BoxRenderObject`

Defined in `box.ts`. Abstract base for rectangular render objects with known width and height.

```ts
constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { includeInLayoutBounds?: boolean | undefined }
)
```

Defaults and normalization:

- Calls `RenderObject` with `scaleX = 1`, `scaleY = 1`, `opacity = 1`
- `width` and `height` are clamped to `>= 0`

## Containers And Layers

### `EmptyRenderObject`

Defined in `empty.ts`. Container render object with no self drawing.

```ts
constructor(
    x = 0,
    y = 0,
    scaleX = 1,
    scaleY = 1,
    opacity = 1,
    options?: { includeInLayoutBounds?: boolean }
)
```

Defaults:

- Same transform defaults as `RenderObject`
- Layout participation is `'exclude'` by default
- If `options.includeInLayoutBounds === true`, layout participation becomes `'include'`

Note: this constructor currently calls `super(x, y, scaleX, scaleY, opacity)` without forwarding `options`, then sets `layoutParticipation` itself.

### `ClipLayer`

Defined in `clip-layer.ts`. Clips children to a local rectangular region.

```ts
constructor(clipWidth: number, clipHeight: number)
```

Defaults:

- Inherits `EmptyRenderObject` defaults
- Stores `clipWidth` and `clipHeight` exactly as provided

### `CompositeLayer`

Defined in `composite-layer.ts`. Renders children into an isolated buffer, then composites the group onto the main canvas.

```ts
constructor(layerBlendMode: GlobalCompositeOperation = 'source-over')
```

Defaults:

- Inherits `EmptyRenderObject` defaults
- `layerBlendMode`: `'source-over'`

### `GlowLayer`

Defined in `glow-layer.ts`. Draws children normally, then draws a blurred glow pass.

```ts
constructor(options?: {
    glowBlur?: number;
    glowOpacity?: number;
    glowBlendMode?: GlobalCompositeOperation;
    glowResolution?: number;
})
```

Defaults:

- Inherits `EmptyRenderObject` defaults
- `glowBlur`: `8`
- `glowOpacity`: `0.7`
- `glowBlendMode`: `'screen'`
- `glowResolution`: `0.5`

## Shape Render Objects

### `Arc`

Defined in `arc.ts`.

```ts
constructor(
    x: number,
    y: number,
    radius: number,
    startAngle = 0,
    endAngle = Math.PI * 2,
    anticlockwise = false,
    options?: {
        fillColor?: string | null;
        strokeColor?: string | null;
        strokeWidth?: number;
        fillRule?: CanvasFillRule;
        includeInLayoutBounds?: boolean;
    }
)
```

Defaults and normalization:

- Calls `RenderObject` with `scaleX = 1`, `scaleY = 1`, `opacity = 1`
- `radius` is clamped to `>= 0`
- `fillColor`: `null`
- `strokeColor`: `'#FFFFFF'`
- `strokeWidth`: `1`
- `fillRule`: `'nonzero'`
- `lineCap`: `'butt'`
- `lineDash`: `[]`
- `lineDashOffset`: `0`
- `shadowColor`: `null`
- `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`: `0`
- `arcFillStyle`: `'segment'`

### `BezierPath`

Defined in `bezier.ts`.

```ts
type BezierPathCommand =
    | { type: 'moveTo'; x: number; y: number }
    | { type: 'lineTo'; x: number; y: number }
    | { type: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
    | { type: 'bezierCurveTo'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
    | { type: 'closePath' };

constructor(
    x = 0,
    y = 0,
    commands: BezierPathCommand[] = [],
    options?: {
        fillColor?: string | null;
        strokeColor?: string | null;
        strokeWidth?: number;
        fillRule?: CanvasFillRule;
        includeInLayoutBounds?: boolean;
    }
)
```

Defaults:

- Calls `RenderObject` with `scaleX = 1`, `scaleY = 1`, `opacity = 1`
- `commands` are cloned on input
- `fillColor`: `null`
- `strokeColor`: `'#FFFFFF'`
- `strokeWidth`: `1`
- `fillRule`: `'nonzero'`
- `lineJoin`: `'miter'`
- `lineCap`: `'butt'`
- `miterLimit`: `10`
- `lineDash`: `[]`
- `lineDashOffset`: `0`
- `shadowColor`: `null`
- `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`: `0`

### `Line`

Defined in `line.ts`.

Preferred signature:

```ts
interface LineOptions {
    color?: string;
    lineWidth?: number;
    lineCap?: CanvasLineCap;
    lineDash?: number[];
    lineDashOffset?: number;
    shadowColor?: string | null;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    layoutParticipation?: LayoutParticipation;
    /** @deprecated Use layoutParticipation. */
    includeInLayoutBounds?: boolean;
}

constructor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: LineOptions
)
```

Deprecated compatibility signature:

```ts
constructor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    lineWidth?: number,
    options?: LineOptions
)
```

Defaults:

- Calls `RenderObject` at `(x1, y1)` with `scaleX = 1`, `scaleY = 1`, `opacity = 1`
- Stores endpoint as `deltaX = x2 - x1`, `deltaY = y2 - y1`
- `color`: `'#FFFFFF'`
- `lineWidth`: `1`
- `lineCap`: `'butt'`
- `lineDash`: `[]`
- `lineDashOffset`: `0`
- `shadowColor`: `null`
- `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`: `0`

### `Poly`

Defined in `poly.ts`.

```ts
constructor(
    points: unknown = [],
    fillColor: string | null = null,
    strokeColor: string | null = '#FFFFFF',
    strokeWidth = 1,
    options?: { includeInLayoutBounds?: boolean }
)
```

Accepted point inputs:

- `{ x: number; y: number }[]`
- Flat number array, interpreted as `[x0, y0, x1, y1, ...]`
- Tuple array, interpreted as `[number, number][]`

Defaults:

- Calls `RenderObject` at `(0, 0)` with `scaleX = 1`, `scaleY = 1`, `opacity = 1`
- `points`: normalized to `{ x, y }[]`; invalid input becomes `[]`
- `fillColor`: `null`
- `strokeColor`: `'#FFFFFF'`
- `strokeWidth`: `1`
- `closed`: `true`
- `lineJoin`: `'miter'`
- `lineCap`: `'butt'`
- `miterLimit`: `10`
- `lineDash`: `[]`
- `lineDashOffset`: `0`
- `shadowColor`: `null`
- `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`: `0`

### `Rectangle`

Defined in `rectangle.ts`.

Preferred signature:

```ts
interface RectangleOptions {
    fillColor?: string | null;
    strokeColor?: string | null;
    strokeWidth?: number;
    cornerRadius?: number;
    lineDash?: number[];
    lineDashOffset?: number;
    shadowColor?: string | null;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    layoutParticipation?: LayoutParticipation;
    /** @deprecated Use layoutParticipation. */
    includeInLayoutBounds?: boolean;
}

constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: RectangleOptions
)
```

Deprecated compatibility signature:

```ts
constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor: string | null,
    strokeColor?: string | null,
    strokeWidth?: number,
    options?: RectangleOptions
)
```

Defaults and normalization:

- `x` and `y` are clamped to `[-1_000_000, 1_000_000]`
- `width` and `height` are clamped to `[0, 1_000_000]`
- Calls `BoxRenderObject` with the clamped position and size
- `fillColor`: `'#FFFFFF'`
- `strokeColor`: `null`
- `strokeWidth`: `1`
- `cornerRadius`: `0`
- `lineDash`: `[]`
- `lineDashOffset`: `0`
- `shadowColor`: `null`
- `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`: `0`

## Text

### `Text`

Defined in `text.ts`.

Preferred signature:

```ts
type TextAlign = CanvasTextAlign;
type TextBaseline = CanvasTextBaseline;

type TextShadow = {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
};

interface TextOptions {
    color?: string;
    align?: TextAlign;
    baseline?: TextBaseline;
    strokeColor?: string | null;
    strokeWidth?: number;
    maxWidth?: number | null;
    letterSpacing?: number;
    shadow?: TextShadow | null;
    layoutParticipation?: LayoutParticipation;
    /** @deprecated Use layoutParticipation. */
    includeInLayoutBounds?: boolean;
}

constructor(
    x: number,
    y: number,
    text: string,
    font?: string,
    options?: TextOptions
)
```

Deprecated compatibility signature:

```ts
constructor(
    x: number,
    y: number,
    text: string,
    font: string,
    color: string,
    align?: TextAlign,
    baseline?: TextBaseline,
    options?: TextOptions
)
```

Defaults and normalization:

- `x` and `y` are clamped to `[-1_000_000, 1_000_000]`
- Calls `RenderObject` with `scaleX = 1`, `scaleY = 1`, `opacity = 1`
- `font`: `'16px Arial'`
- `color`: `'#FFFFFF'`
- `align`: `'left'`
- `baseline`: `'top'`
- `strokeColor`: `null`
- `strokeWidth`: `0`
- `maxWidth`: `null`
- `shadow`: `null`
- `letterSpacing`: `0`

## Media And Pixel Data

### `PixelGrid`

Defined in `pixel-grid.ts`.

```ts
constructor(
    x: number,
    y: number,
    cols: number,
    rows: number,
    cellSize: number,
    pixels: Uint8ClampedArray,
    options?: {
        cellGap?: number;
        includeInLayoutBounds?: boolean;
    }
)
```

Defaults and normalization:

- `cols` and `rows` are rounded and clamped to `>= 1`
- `cellSize` is clamped to `>= 1`
- `width = cols * cellSize`
- `height = rows * cellSize`
- `cellGap`: `0`, clamped to `>= 0`
- Calls `BoxRenderObject` with normalized size
- Builds an `OffscreenCanvas` from `pixels`

The expected pixel data format is a flat `Uint8ClampedArray` of length `cols * rows * 4`, with RGBA values per cell.

### `VisualMedia`

Defined in `visual-media.ts`.

```ts
type FramePlacementPreset =
    | 'center'
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'center-left'
    | 'center-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

type FramePlacementCustom = {
    container: [number, number];
    frame: [number, number];
};

type FramePlacement = FramePlacementPreset | FramePlacementCustom;

type SelfBoundsMode = 'drawn' | 'container';

type VisualMediaOptions = {
    fitMode?: 'contain' | 'cover' | 'fill' | 'clip';
    preserveAspectRatio?: boolean;
    /** @deprecated Use layoutBoundsMode: 'none' instead. */
    includeInLayoutBounds?: boolean;
    layoutBoundsMode?: 'container' | 'drawn' | 'none';
    originX?: number;
    originY?: number;
    /** @deprecated Use originX instead. */
    pivotFractionX?: number;
    /** @deprecated Use originY instead. */
    pivotFractionY?: number;
    framePlacement?: FramePlacement;
    /** @deprecated Use framePlacement instead. */
    contentAnchorX?: number;
    /** @deprecated Use framePlacement instead. */
    contentAnchorY?: number;
    /** @deprecated Use framePlacement instead. */
    frameAnchorX?: number;
    /** @deprecated Use framePlacement instead. */
    frameAnchorY?: number;
    showDebug?: boolean;
};

constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    options: VisualMediaOptions = {}
)
```

Defaults:

- Calls `BoxRenderObject` with the provided position and size
- `fitMode`: `'contain'`
- `preserveAspectRatio`: `true`
- `showDebug`: `false`
- `shadowColor`: `null`
- `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`: `0`
- `selfBoundsMode`: `'drawn'`
- Resource state starts as `resource = null`, `status = 'idle'`, `localTime = 0`, `animationName = null`
- Clip-mode frame placement defaults to centered container and centered frame

Option precedence:

- `layoutBoundsMode` wins over deprecated `includeInLayoutBounds`
- `framePlacement` wins over deprecated `contentAnchorX`, `contentAnchorY`, `frameAnchorX`, and `frameAnchorY`
- `originX` and `originY` win over deprecated `pivotFractionX` and `pivotFractionY`

## Helper-Only Module

### `style-helpers.ts`

This module exports helper functions only and has no constructor signatures:

```ts
applyShadow(ctx, s)
clearShadow(ctx, s)
applyDash(ctx, s)
clearDash(ctx, s)
applyStroke(ctx, s)
applyFill(ctx, s)
```

## Barrel Exports

### `index.ts`

This module re-exports render object classes, option types, and style helpers. It has no constructor signatures of its own.
