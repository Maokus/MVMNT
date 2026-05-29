# Documentation and Scene Element Migration Notes

This document summarises the updates needed for existing documentation and scene elements to align with the new render-object best practices.

## 1. Prefer explicit chainable setters

Scene elements should use the new chainable setters instead of directly assigning render-object properties during construction.

Prefer:

```ts
new Rectangle(0, 0, width, height)
    .setFill(color)
    .setStroke(strokeColor, strokeWidth)
    .setOpacity(opacity)
    .setPosition(x, y)
    .setRotation(rotation)
    .setScale(scaleX, scaleY)
    .setSkew(skewX, skewY)
    .setVisible(visible);
```

Avoid new usage of:

```ts
object.rotation = rotation;
object.skewX = skewX;
object.visible = visible;
object.globalAlpha = alpha;
```

Direct assignment remains supported for compatibility, but documentation and new scene-element code should prefer setters.

## 2. Update style API names

Documentation and examples should use the standardised style API:

| Old API                                             | New API                        |
| --------------------------------------------------- | ------------------------------ |
| `setFillColor(color)`                               | `setFill(color)`               |
| `setGlobalAlpha(alpha)`                             | `setOpacity(alpha)`            |
| `Line.setColor(color)` + `Line.setLineWidth(width)` | `Line.setStroke(color, width)` |

The old names may still exist as deprecated aliases, but they should not appear in new examples.

## 3. Use one opacity model

Scene elements should treat opacity as a single render-object property controlled through `setOpacity`.

Avoid multiplying opacity through both base `opacity` and shape-level `globalAlpha`. Existing code such as:

```ts
rect.opacity = elementOpacity;
rect.setGlobalAlpha(shapeAlpha);
```

should be collapsed into one opacity value before calling:

```ts
rect.setOpacity(finalOpacity);
```

## 4. Use `layoutParticipation` for layout inclusion

Documentation should replace `includeInLayoutBounds` with the new layout participation model:

```ts
object.setLayoutParticipation('auto');
object.setLayoutParticipation('include');
object.setLayoutParticipation('exclude');
```

Recommended meanings:

- `'auto'`: include this object and respect child policies.
- `'include'`: force this object and descendants into layout bounds.
- `'exclude'`: exclude this object and descendants from layout bounds.

Avoid documenting `includeInLayoutBounds`, except in a migration/deprecation section.

## 5. Separate VisualMedia geometry mode from layout participation

For `VisualMedia`, layout participation and self-bounds measurement are now separate concerns.

Use:

```ts
media.setLayoutParticipation('exclude');
media.setSelfBoundsMode('drawn');
media.setSelfBoundsMode('container');
```

Do not use `setLayoutBoundsMode('none')` in new code. The old `drawn`, `container`, and `none` layout-bounds mode should be documented only as deprecated migration behaviour.

## 6. Use `setOriginFraction` consistently

Scene elements should use `setOriginFraction` for both fixed-size render objects and container/layer render objects.

Prefer:

```ts
container.setPosition(offsetX, offsetY).setOriginFraction(anchorX, anchorY);
```

Avoid directly setting internal anchor fields such as:

```ts
container.anchorFraction = { x, y };
container.anchorOffsetX = anchorPixelX;
container.anchorOffsetY = anchorPixelY;
```

Documentation should present origin/anchor handling as one concept: the render object's origin.

## 7. Prefer options objects for style at construction time

New documentation should show constructors using positional arguments only for geometry, with style passed through options or chainable setters.

Prefer:

```ts
new Rectangle(0, 0, width, height, {
    fillColor,
    strokeColor,
    strokeWidth,
    cornerRadius,
});
```

Avoid new examples like:

```ts
new Rectangle(0, 0, width, height, fillColor, strokeColor, strokeWidth);
```

The deprecated positional style overloads may remain for compatibility, but should not be taught as best practice.

## 8. Scene element migration checklist

When updating existing scene elements:

1. Replace `setFillColor` with `setFill`.
2. Replace `setGlobalAlpha` and `globalAlpha` with `setOpacity`.
3. Replace line color/width pairs with `setStroke`.
4. Replace direct transform assignments with `setPosition`, `setScale`, `setRotation`, `setSkew`, and `setVisible`.
5. Replace `includeInLayoutBounds` with `layoutParticipation` or `setLayoutParticipation`.
6. Replace `VisualMedia.setLayoutBoundsMode` with `setSelfBoundsMode` plus `setLayoutParticipation`.
7. Replace container anchor-field manipulation with `setOriginFraction`.
8. Prefer constructor options objects over positional style arguments.

## 9. Documentation sections that should be updated

The following documentation areas should be revised:

- Render object overview
- Shape construction examples
- Style API reference
- Opacity documentation
- Layout bounds documentation
- VisualMedia documentation
- Scene element authoring guide
- Plugin/render-object migration guide
- Any examples that construct `Rectangle`, `Text`, `Line`, `VisualMedia`, `PixelGrid`, or `EmptyRenderObject`

## 10. Compatibility note for users

The older APIs remain available as deprecated shims during the transition period. Existing scene elements should continue to work, but all new examples and internal scene-element code should use the new setter names, options-based constructors, `layoutParticipation`, and `setOriginFraction`.
