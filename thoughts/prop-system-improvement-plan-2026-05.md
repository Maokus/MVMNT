## Concise Plan: Properties System Improvements

### 1. Preserve the simple `prop.*` API

Keep individual property definitions obvious and lightweight:

```ts
prop.color('color', 'Color', '#FFFFFF');
prop.range('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 });
```

Do **not** add ordering, section, or grouping metadata to every property unless absolutely necessary.

---

### 2. Move ordering to schema assembly

Introduce canonical section helpers that control inspector order:

```ts
section.content([...])
section.layout([...])
section.appearance([...])
section.typography([...])
section.border([...])
section.container([...])
section.effects([...])
section.advanced([...])
```

The section order should be centralized once:

```ts
Source → Content → Layout → Appearance → Typography → Border → Container → Effects → Advanced
```

This gives consistent UI order without complicating property definitions.

---

### 3. Keep `propGroup.*` only for true reusable sections

Retain full group helpers where the same section recurs across many elements:

```ts
propGroup.appearance();
propGroup.typography();
propGroup.border();
propGroup.container();
propGroup.shadow();
propGroup.audioSource();
propGroup.midiSource();
```

Avoid turning every repeated pattern into a full `propGroup`.

---

### 4. Add small property-bundle helpers separately

For repeated mini-patterns like color + opacity pairs, use a lower-level helper:

```ts
prop.slot.colorOpacity('bar', 'Bar');
```

This could emit:

```ts
barColor;
barOpacity;
```

Use this inside any section:

```ts
section.appearance([...prop.slot.colorOpacity('bar', 'Bar'), ...prop.slot.colorOpacity('background', 'Background')]);
```

This reduces boilerplate without pretending every color pair is a full group.

---

### 5. Make named appearance groups explicit

Improve `propGroup.appearance()` so it can support multiple visual surfaces:

```ts
propGroup.appearance({
    id: 'fillAppearance',
    label: 'Fill',
    keyPrefix: 'fill',
    blendMode: true,
});
```

This emits:

```ts
fillColor;
fillOpacity;
fillBlendMode;
```

Avoid deriving saved config keys purely from display labels.

---

### 6. Use semantic keys for multi-surface elements

Do not force every element’s primary color to be called `color`.

Good:

```ts
barColor;
barOpacity;
secondaryColor;
secondaryOpacity;
textSecondaryColor;
```

Less good:

```ts
color;
opacity;
color2;
opacity2;
```

Rule:

> Property keys should describe the rendered thing they control.

---

### 7. Standardize only the high-value conventions

Adopt these globally:

```ts
color + opacity, not colorAlpha
borderWidth: 0 means off
shadowEnabled controls shadow sub-props
showBackground controls container sub-props
shared BLEND_MODE_CHOICES
```

Defer broader theming, palettes, shared display enums, and preset systems until the basic schema feels stable.

---

### 8. Recommended target shape

```ts
return defineElementSchema(meta, [
    propGroup.audioSource(),

    section.content([prop.boolean('showProgress', 'Show Progress', true)]),

    section.appearance([
        prop.color('color', 'Primary Color', '#FFFFFF'),
        prop.color('secondaryColor', 'Secondary Color', '#CBD5F5'),
    ]),

    propGroup.typography(),
    propGroup.container(),
]);
```

This keeps the system ordered, consistent, and readable without obscuring the simple property-definition model.
