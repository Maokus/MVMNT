# Scene Element Property Conventions

These guidelines cover how to organise properties in `getConfigSchema()` — tabs, groups, naming, and
visibility rules. Follow them when adding or editing element properties so the inspector stays
consistent across elements.

---

## Tabs

Use `tab.*` helpers from `plugin-sdk-prop-groups`. The **Transform** tab is automatically prepended
by `insertElementGroups` — do not create it.

| Helper                          | When to use                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `tab.content()`                 | Source selection, behaviour mode, data input, general settings |
| `tab.appearance()`              | Colors, opacity, blend modes, typography, background, borders  |
| `tab.animation()`               | Timing, easing, hold/decay parameters                          |
| `tab.advanced()`                | Technical or rarely-changed properties                         |
| `tab.custom(id, label, groups)` | Only when none of the above fit                                |

Tabs that the element doesn't need can be omitted. A simple element may have only `tab.content()`.

---

## Group order within a tab

Follow the canonical section order defined in `section.*` / `propGroup.*`:

```
Source → Content → Layout → Appearance → Typography → Border → Container → Effects → Advanced
```

This applies within any single tab. Groups that belong to a different tab follow the same order
within their own tab.

---

## Property groups

### Source group

Use the factory — do not inline a bare track picker:

```ts
propGroup.audioSource(); // key: 'audioTrackId'
propGroup.midiSource(); // key: 'midiTrackId'
```

Source groups are placed first inside `tab.content()`.

### Content / feature groups

Inline custom `PropertyGroup` objects for element-specific settings. Keep `collapsed: false` so
the most important settings are visible immediately:

```ts
{
    id: 'waveform',
    label: 'Oscilloscope',
    collapsed: false,
    properties: [ ... ],
}
```

### Appearance — colors for always-visible surfaces

Color properties for surfaces that are always visible belong in `tab.appearance()` inside a group
whose label describes the surface (e.g. `'Colors'`, `'Primary Colors'`, `'Bar Color'`). The group
should be `collapsed: false`.

Use `propGroup.appearance()` for simple single-surface elements:

```ts
propGroup.appearance({ blendMode: true }); // generates: color, opacity, blendMode
```

For multi-surface elements, use `propGroup.appearance({ keyPrefix: 'primary' })` to generate
`primaryColor`, `primaryOpacity`, etc., and repeat for each surface with a distinct prefix.

### Appearance — colors for optionally-enabled features

When a visual feature can be toggled on/off (shadows, backgrounds, strokes, secondary channels),
put its toggle and its color properties **in the same group**, with the color properties hidden
until the toggle is `true`:

```ts
{
    id: 'shadow',
    label: 'Shadow',
    collapsed: true,
    properties: [
        prop.boolean('shadowEnabled', 'Drop Shadow', false),
        prop.color('shadowColor', 'Shadow Color', '#000000', {
            visibleWhen: [{ key: 'shadowEnabled', equals: true }],
        }),
        prop.number('shadowBlur', 'Shadow Blur (px)', 8, {
            visibleWhen: [{ key: 'shadowEnabled', equals: true }],
        }),
    ],
}
```

Use the ready-made factories where they fit:

```ts
propGroup.container(); // background container toggle + color/padding/radius (collapsed: true)
propGroup.shadow(); // drop shadow toggle + color/blur/offset (collapsed: true)
propGroup.border(); // border color + width (collapsed: true)
```

These factories produce groups that are `collapsed: true` by default because they are secondary to
the element's main purpose.

### Background groups (not the container factory)

When an element has its own inline background (not the container factory), put it in
`tab.appearance()` inside a group labelled `'Background'`, `collapsed: true`:

```ts
{
    id: 'background',
    label: 'Background',
    collapsed: true,
    properties: [
        prop.color('backgroundColor', 'Background Color', '#0F172A'),
        prop.range('backgroundOpacity', 'Background Opacity', 0, { min: 0, max: 1, step: 0.01 }),
    ],
}
```

---

## visibleWhen

Use `visibleWhen` to hide properties that are irrelevant given the current state. Multiple
conditions are AND-ed together:

```ts
prop.color('gridColor', 'Grid Color', '#ffffff', {
    visibleWhen: [
        { key: 'displayMode', equals: 'grid' },
        { key: 'showGrid', equals: true },
    ],
});
```

Available condition shapes:

- `{ key, equals: value }` — exact equality
- `{ key, notEquals: value }` — inequality
- `{ key, truthy: true }` — truthy check

**Never show color pickers for features that are currently disabled.** Pair every feature toggle
with `visibleWhen` on all of that feature's sub-properties.

---

## Property naming

| Purpose                     | Key pattern                           | Examples                                     |
| --------------------------- | ------------------------------------- | -------------------------------------------- |
| Primary color/opacity       | `color` + `opacity`                   | `color`, `opacity`                           |
| Named surface color/opacity | `{surface}Color` + `{surface}Opacity` | `primaryColor`, `secondaryColor`, `barColor` |
| Blend modes                 | `{surface}BlendMode`                  | `blendMode`, `primaryBlendMode`              |
| Background                  | `background*`                         | `backgroundColor`, `backgroundOpacity`       |
| Shadow                      | `shadow*`                             | `shadowEnabled`, `shadowColor`, `shadowBlur` |
| Border                      | `border*`                             | `borderColor`, `borderWidth`, `cornerRadius` |
| Stroke                      | `stroke*`                             | `strokeColor`, `strokeWidth`                 |
| Dimensions                  | `width`, `height`                     | —                                            |
| Domain sizes                | descriptive + unit in label           | `windowSeconds`, `barCount`, `minDb`         |

Always include units in the property **label**, not in the key: `'Width (px)'`, `'Window (seconds)'`.

---

## Collapsed state

| Pattern                                     | `collapsed` |
| ------------------------------------------- | ----------- |
| Main content group (most elements have one) | `false`     |
| Source group                                | `false`     |
| Secondary surface colors                    | `false`     |
| Background group                            | `true`      |
| `propGroup.border()`                        | `true`      |
| `propGroup.container()`                     | `true`      |
| `propGroup.shadow()`                        | `true`      |
| Anything labelled 'Advanced'                | `true`      |

---

## Quick reference — structural template

```ts
static override getConfigSchema(): EnhancedConfigSchema {
    return insertElementGroups(
        super.getConfigSchema(),
        { name: 'Element Name', description: '...', category: 'Category' },
        [
            tab.content([
                propGroup.audioSource(),          // if audio element
                {
                    id: 'main',
                    label: 'Element Name',
                    collapsed: false,
                    properties: [
                        // dimension, mode, behaviour props
                    ],
                },
            ]),
            tab.appearance([
                propGroup.appearance({ blendMode: true }),   // always-visible surface
                {                                            // optional feature with toggle
                    id: 'background',
                    label: 'Background',
                    collapsed: true,
                    properties: [
                        prop.boolean('showBackground', 'Show Background', false),
                        prop.color('backgroundColor', 'Color', '#000000', {
                            visibleWhen: [{ key: 'showBackground', equals: true }],
                        }),
                    ],
                },
                propGroup.shadow(),
            ]),
        ]
    );
}
```
