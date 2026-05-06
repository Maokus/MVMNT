# Prop System Analysis — May 2026

## What We Have

### Prop Factories (`prop.*`)

Low-level builders for individual `PropertyDefinition` objects. Each takes a `key`, `label`, `default`, and optional metadata (`description`, `visibleWhen`, numeric bounds). Examples: `prop.color()`, `prop.range()`, `prop.select()`.

Keys are free-form strings. Labels are for UI display only. There is no enforcement that a key follows any naming convention, and nothing prevents two groups in the same element from using the same key.

### Prop Groups (`propGroup.*`)

Reusable bundles of related properties. Currently:

- `propGroup.appearance(opts?)` — `color`, `opacity`, optional `blendMode`
- `propGroup.typography(opts?)` — font family/size/align/spacing, optional stroke + shadow
- `propGroup.border(opts?)` — border color/width, optional corner radius
- `propGroup.container()` — toggled background with color/opacity/padding/radius
- `propGroup.shadow()` — toggled shadow with color/blur/offset
- `propGroup.audioSource()` / `propGroup.midiSource()` — track selectors

Groups have a fixed `id`, `label`, `variant`, and property list. They cannot be parameterised beyond the small option bags each accepts.

### Schema Assembly

`insertElementGroups(base, overrides, pluginGroups)` merges element-level groups into the base class schema, slotting base-class groups (visibility, transform, anchor) around the element's own groups.

---

## The `appearance` Problem

`propGroup.appearance()` emits two properties: `color` and `opacity`. For simple elements — a basic shape, a text overlay — this is fine. "Color" is unambiguous when there is only one visual surface.

The problem emerges when elements grow. Right now there are two failure modes:

### 1. Implicit Primary / Secondary split

`AudioWaveformElement` uses `propGroup.appearance()` for its primary waveform line, then declares `secondaryColor` and `secondaryOpacity` by hand in the Oscilloscope group. The generic `color` label now implicitly means "Primary Color" but the user has no way to know that from the label. The two colour controls are in different groups — one in "Appearance", one in "Oscilloscope" — which makes the relationship less obvious.

### 2. Unrelated semantic colours mixed into one group

`AudioSpectrumElement` uses `propGroup.appearance()` for the bar/line colour, but then manually adds `backgroundColor` + `backgroundOpacity` to the Spectrum group. In the UI, the main spectrum colour is in "Appearance" and the background colour is buried in "Spectrum". Both affect the same rendered element but they are split across groups for the wrong reason (one came from a reusable factory, the other was added later).

### 3. Complex elements abandon the factory entirely

`ProgressDisplayElement` has seven named colour/opacity pairs (`barColor`, `barBgColor`, `borderColor`, `statsTextColor`, etc.) defined entirely by hand. This is the right instinct — specific names are better than `color` — but it means the element doesn't benefit from `propGroup.appearance()` at all, and defining inline `PropertyDefinition` objects by hand is verbose and error-prone (no auto-filled `runtime` transform).

---

## Underlying Root Causes

### Fixed keys in `propGroup.appearance()`

The property keys `color` and `opacity` are hardcoded. There is no way to call `propGroup.appearance()` and get `fillColor`/`fillOpacity` out. This forces elements to either:

- Accept the generic label and add specificity only through context (group name or surrounding labels), or
- Not use the factory and write the property by hand.

### No support for multiple `appearance`-style groups

Because `propGroup.appearance()` always produces `{ id: 'appearance', ... }` with keys `color`/`opacity`, you cannot include it twice in one element — you'd get a key collision and a duplicate group id. If you want a "Fill Appearance" and a "Stroke Appearance" group, you must write both by hand.

### Color and opacity are separate props but conceptually one value

This is a known design tension. Keeping them separate allows independent animation (keyframe `opacity` while leaving `color` constant). But it means every "colour slot" in an element needs two props, two labels, two default values, and two `runtime` transform entries. The manual duplication seen in `ProgressDisplayElement` is a direct consequence.

The `prop.colorAlpha()` factory exists but is not used by any `propGroup` and appears unused by current default elements. If it had full alpha-channel picker support in the UI it could halve the prop count for colour slots that don't need independent opacity animation.

---

## Proposed Improvements

### 1. Named / prefixed `appearance` groups

The most targeted fix for the stated concern. Add a `name` option to `propGroup.appearance()` that:

- Renames the group label: `propGroup.appearance({ name: 'Fill' })` → group label "Fill"
- Prefixes the property keys: keys become `fillColor`, `fillOpacity`, `fillBlendMode`
- Sets a stable, derived group id: `id: 'appearance_fill'`

This enables multiple appearance groups per element without key collisions:

```typescript
propGroup.appearance({ name: 'Fill' }),    // fillColor, fillOpacity
propGroup.appearance({ name: 'Stroke' }), // strokeColor, strokeOpacity
```

Labels in the UI would read "Fill Color" and "Stroke Color" rather than two "Color" controls.

Minimal API change, fully backwards-compatible (a call without `name` would continue to emit `color`/`opacity` as today).

The same option could apply to `propGroup.border()` so `borderColor`/`borderWidth` can be contextualised.

### 2. A `prop.colorAlpha()` promotion

Promote `prop.colorAlpha()` to first-class usage in `propGroup.appearance()` as an opt-in:

```typescript
propGroup.appearance({ colorAlpha: true });
// → emits one `prop.colorAlpha('color', ...)` instead of color + opacity
```

Useful for elements where independent opacity animation is not a goal and the prop count matters. Requires that the UI has a working RGBA/hex+alpha colour picker for this input type; worth confirming before adopting.

### 3. Better placement of related colours

Currently the convention is: generic colour goes in the "Appearance" group, additional colours go wherever the author decides. This is inconsistent.

An alternative convention: **put all colour/opacity props for the primary visual surface in the "Appearance" group, and give the group a semantic label that reflects that surface**.

For `AudioSpectrumElement`:

- Rename the group from "Appearance" to "Bars / Lines" (or keep "Spectrum")
- Put `color`, `opacity`, `backgroundColor`, `backgroundOpacity`, and `blendMode` all together
- Remove the scattered `backgroundColor` props from the Spectrum group

This requires that `propGroup.appearance()` allows injecting extra properties, or that elements build the group manually but use `prop.color()` etc. from the factory for the inner props.

### 4. A `propGroup.colorSlot()` micro-factory

For elements with many named colour pairs (ProgressDisplay), provide a helper that produces a consistently-structured color+opacity pair given a semantic name:

```typescript
propGroup.colorSlot('bar', 'Bar');
// → [prop.color('barColor', 'Bar Color', ...), prop.range('barOpacity', 'Bar Opacity', ...)]
// returns a PropertyDefinition[], not a full group
```

This is a small helper (`propGroup.colorSlot` or just a top-level `colorSlotProps()` function) that eliminates the inline `PropertyDefinition` boilerplate seen in ProgressDisplayElement. The author still decides which group these props belong to, but the runtime transforms and default structure are handled consistently.

### 5. Group labels as the primary disambiguation

Independent of which of the above is adopted: the simplest change today is to audit existing elements and make group labels carry the semantic weight when property labels are generic.

Example: `AudioWaveformElement` currently has a group labelled "Oscilloscope" that contains `secondaryColor`. Renaming the Appearance group to "Primary Channel" and the Oscilloscope group to "Secondary Channel" (with colour props at the top of each group) makes the UI clearly communicate which colour controls which surface — without changing any keys or prop factory signatures.

This is zero-risk and purely editorial, but it has a meaningful impact on usability.

---

## Recommended Path

In priority order:

1. **Audit group labels** for all existing elements — rename ambiguous groups so labels reflect the visual surface they control (no code changes, just config string updates).

2. **Add the `name` option to `propGroup.appearance()`** — small, backwards-compatible, solves the multi-surface problem cleanly.

3. **Introduce `colorSlotProps(key, label, defaultColor?)`** utility — reduces boilerplate in complex elements and enforces consistent runtime transforms.

4. **Defer `colorAlpha` promotion** until the UI colour picker robustly supports alpha.
