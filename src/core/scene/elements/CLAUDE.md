# Scene Element Property Conventions

Use these rules when defining `getConfigSchema()` so inspector properties stay consistent.

## Tabs

Use `tab.*` from `plugin-sdk-prop-groups`. Do **not** create the Transform tab; `insertElementGroups` adds it automatically.

- `tab.content()` — source, data, behaviour, general settings
- `tab.appearance()` — colors, opacity, blend modes, typography, background, borders
- `tab.animation()` — timing, easing, hold/decay
- `tab.advanced()` — technical or rarely changed settings
- `tab.custom(id, label, groups)` — only when the standard tabs do not fit

Omit unused tabs.

## Group order

Within each tab, keep groups in this order:

```text
Source -> Content -> Layout -> Appearance -> Typography -> Border -> Container -> Effects -> Advanced
```

## Groups

- Use `propGroup.audioSource()` or `propGroup.midiSource()` for sources; place source groups first in `tab.content()`.
- Use inline `PropertyGroup` objects for element-specific settings; keep important/main groups `collapsed: false`.
- Put always-visible surface colors in `tab.appearance()` with a clear label such as `Colors`, `Primary Colors`, or `Bar Color`; keep these groups `collapsed: false`.
- Use `propGroup.appearance({ blendMode: true })` for simple single-surface elements.
- For multiple surfaces, use `propGroup.appearance({ keyPrefix: 'primary' })`, etc.
- For optional visual features, keep the toggle and dependent properties in the same group, and hide dependent properties with `visibleWhen`.
- Prefer factories where they fit: `propGroup.container()`, `propGroup.shadow()`, `propGroup.border()`.
- Inline background groups belong in `tab.appearance()`, label `Background`, and should be `collapsed: true`.

## Visibility

Use `visibleWhen` for properties that only apply in certain states. Multiple conditions are AND-ed.

Supported conditions:

```ts
{ key, equals: value }
{ key, notEquals: value }
{ key, truthy: true }
```

Never show color pickers for disabled features. Pair every feature toggle with `visibleWhen` on all dependent properties.

## Properties

- Naming:
    - Main surface: `color`, `opacity`, `blendMode`
    - Named surfaces: `{surface}Color`, `{surface}Opacity`, `{surface}BlendMode`
    - Background: `background*`
    - Shadow: `shadow*`
    - Border: `border*`, plus `cornerRadius`
    - Stroke: `stroke*`
    - Dimensions: `width`, `height`
    - Domain sizes: descriptive keys, units in labels only, e.g. `windowSeconds` with `Window (seconds)`
- Prefer to use prop factories where appropriate

## Collapsed defaults

Use `collapsed: false` for main content, source, and always-visible/secondary surface color groups.

Use `collapsed: true` for background, border, container, shadow, and anything labelled `Advanced`.

## Animation Determinism

`_buildRenderObjects()` must be **deterministic**: identical inputs (`targetTime` + props) must always produce identical output, regardless of call order or history.

**Do not** store animation state as instance fields (e.g. note-on/off time maps). Doing so makes scrubbing, export, and non-sequential rendering produce incorrect results.

**Do** derive all animation values from `targetTime` and event times fetched from the SDK:

- Query notes in a lookback window via `api.timeline.selectNotesInWindow()`
- Compute elapsed time as `targetTime - note.startTime` (for on-animations) or `targetTime - note.endTime` (for fade-out)
- For note range auto-detection, use `api.timeline.getNoteRange()` — not `midiCache` internals

See `src/plugins/midipack1/popcat-midi-display.ts` for the reference implementation.
