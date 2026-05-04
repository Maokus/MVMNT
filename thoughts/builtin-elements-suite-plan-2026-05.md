# Builtin Elements: Suite Cohesion Plan

_May 2026 — distilled from `builtin-elements-improvements-2026-05.md`_

## Problem Statement

The builtin elements feel like a collection of independent tools because each one was designed in isolation: inconsistent property names, varying group structures, and no shared vocabulary. The strategy is **design system first, element polish second** — establish a shared property schema and naming conventions before adding any new features.

---

## Part 1: Assessment of Current Recommendations

### Cross-cutting issues — address as a batch

These require coordinated changes across most elements and must be done before individual element polish, because fixing them piecemeal creates intermediate inconsistency.

| #   | Issue                                                 | Priority     | Notes                                                                                                   |
| --- | ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| 1   | `colorAlpha` → `color` + `opacity`                    | **Critical** | Opacity must be independently keyframeable; combined field hides this and is harder to use              |
| 2   | `textAlign` + `fontWeight` missing from text elements | **High**     | Basic parity gap — some elements hardcode alignment                                                     |
| 3   | Background container props for display elements       | **High**     | Time/MIDI/stats elements render floating text with no visual containment                                |
| 4   | Border/frame support                                  | **High**     | Only Basic Shapes has it; no framing vocabulary elsewhere                                               |
| 5   | `blendMode` on Image, Text Overlay, audio displays    | **Medium**   | Only Basic Shapes currently exposes this                                                                |
| 6   | Drop shadow props, consistently named                 | **Medium**   | Basic Shapes has custom shadow props; Piano Roll glow is partially exposed; everything else has nothing |

### Element-specific polish — defer until after the design system rollout

These are valuable but scoped to individual elements. They don't require cross-element coordination and should not block the design system work.

- **Audio Spectrum**: gradient fills, peak hold, bar spacing, decay time
- **Audio Waveform**: area fill mode, center line, playhead shape
- **Audio Volume Meter**: peak hold, tick marks, label position/font controls
- **Audio Oscilloscope**: display modes (line/area/bar/dot), fill, grid
- **Piano Roll**: velocity height/color mode, playhead offset, grid style, simplified channel palette
- **Notes Playing Display**: `colorByVelocity` + velocity color levels, `showVelocity`
- **CC Monitor**: knob arc start/end, gradient support for track/value
- **Chord Estimate**: `showConfidence`, configurable `chromaSize`/`chromaSpacing`
- **Text Overlay**: multi-line/word-wrap, `textBaseline` control

### Recommendations to drop or defer indefinitely

- **Centralised color palette / theming** — premature; no runtime theming system exists
- **Shared display mode enum** — invisible to users, low value
- **Standardise `audioTrack` vs `audioTrackId` naming** — breaking change with no UX benefit

---

## Part 2: Shared Property Schema

### Current system

`prop.*` factories produce individual `PropertyDefinition` objects. `insertElementGroups()` composes them into an `EnhancedConfigSchema`. There is no reuse at the group level — every element hand-rolls its own groups with its own names.

### Proposal: `propGroup.*` namespace

Add a `propGroup` namespace to `plugin-sdk-prop-factories.ts` (or a `plugin-sdk-prop-groups.ts` co-exported from the same SDK surface). Each function returns a complete `PropertyGroup` with a canonical name, standard property keys, and `visibleWhen` conditions pre-wired.

Elements compose their schema from groups:

```typescript
static getConfigSchema(): EnhancedConfigSchema {
    return insertElementGroups(super.getConfigSchema(), { name: 'Text Overlay', ... }, [
        { name: 'Content', properties: [prop.string('text', 'Text', '')] },
        propGroup.appearance({ blendMode: true }),
        propGroup.typography({ stroke: true }),
        propGroup.container(),
        propGroup.shadow(),
    ]);
}
```

#### Group definitions

**`propGroup.appearance(opts?)`** → PropertyGroup `'Appearance'`

- `color` (hex, no alpha), `opacity` (range 0–1)
- `blendMode` (select) — opt-in: `{ blendMode: true }`

**`propGroup.typography(opts?)`** → PropertyGroup `'Typography'`

- `fontFamily` (font picker — stores `"Family|weight"` via existing `parseFontSelection` convention), `fontSize`, `textAlign` (left/center/right), `letterSpacing`
- Text stroke: `textStrokeColor`, `textStrokeWidth` — opt-in: `{ stroke: true }`
- Text shadow: `textShadowColor`, `textShadowBlur`, `textShadowOffsetX/Y` — opt-in: `{ textShadow: true }`

**`propGroup.border(opts?)`** → PropertyGroup `'Border'`

- `borderColor`, `borderWidth` (0 = none, no separate toggle needed)
- `cornerRadius` — opt-in: `{ cornerRadius: true }`

**`propGroup.container()`** → PropertyGroup `'Container'`

- `showBackground` (boolean)
- `backgroundColor`, `backgroundOpacity`, `backgroundPaddingX/Y`, `backgroundCornerRadius` — all `visibleWhen: [{ key: 'showBackground', equals: true }]`

**`propGroup.shadow()`** → PropertyGroup `'Effects'`

- `shadowEnabled` (boolean)
- `shadowColor`, `shadowBlur`, `shadowOffsetX/Y` — all `visibleWhen: shadowEnabled`

**Source-selector helpers** (single-prop groups, enforce standard key names):

- `propGroup.audioSource(key = 'audioTrackId')` → PropertyGroup `'Source'`
- `propGroup.midiSource(key = 'midiTrackId')` → PropertyGroup `'Source'`

#### Where each group applies

| Element               |  appearance   | typography |      border      | container | shadow | audioSource | midiSource |
| --------------------- | :-----------: | :--------: | :--------------: | :-------: | :----: | :---------: | :--------: |
| Background            |       ✓       |     —      |        ✓         |     —     |   —    |      —      |     —      |
| Basic Shapes          | ✓ + blendMode |     —      |  custom (keep)   |     —     |   ✓    |      —      |     —      |
| Image                 | ✓ + blendMode |     —      | ✓ + cornerRadius |     —     |   ✓    |      —      |     —      |
| Text Overlay          | ✓ + blendMode | ✓ + stroke |        —         |     ✓     |   —    |      —      |     —      |
| Time Display          |       ✓       |     ✓      |        —         |     ✓     |   —    |      —      |     —      |
| Progress Display      |       ✓       | ✓ (labels) |     ✓ (bar)      |     —     |   —    |      —      |     —      |
| Audio Spectrum        | ✓ + blendMode |     —      |        —         |     —     |   —    |      ✓      |     —      |
| Audio Waveform        | ✓ + blendMode |     —      |        —         |     —     |   —    |      ✓      |     —      |
| Audio Volume Meter    |       ✓       | ✓ (labels) |        —         |     —     |   —    |      ✓      |     —      |
| Audio Oscilloscope    | ✓ + blendMode |     —      |        —         |     —     |   —    |      ✓      |     —      |
| Notes Played Tracker  |       ✓       |     ✓      |        —         |     ✓     |   —    |      —      |     ✓      |
| Notes Playing Display |       ✓       |     ✓      |        —         |     ✓     |   —    |      —      |     ✓      |
| CC Monitor            |       ✓       |     ✓      |        —         |     —     |   —    |      —      |     ✓      |
| Chord Estimate        |       ✓       |     ✓      |        —         |     ✓     |   —    |      —      |     ✓      |
| Piano Roll            |       ✓       |     —      |        —         |     —     |   —    |      —      |     ✓      |

#### Where NOT to apply groups — avoid bloat

- No `typography` on Background, Basic Shapes, Image, or any audio spectrum/waveform/oscilloscope (no text output)
- No `container` on Background (it is the background) or audio spectrum/waveform (doesn't fit the spatial layout)
- No `border` on text-only elements where a border would produce confusing layering
- No `shadow` on source-selector-only groups

---

## Part 3: Property Organization

### Standard inspector section order

Use these `PropertyGroup` names in this order. Omit a section if it has no properties for the element.

| Section | Group name           | Contents                                        |
| ------- | -------------------- | ----------------------------------------------- |
| 1       | **Source**           | Track refs, asset selectors                     |
| 2       | **Content**          | Text input, display toggles (what to show)      |
| 3       | **Layout**           | Width, height, fit mode, padding                |
| 4       | **Appearance**       | color, opacity, blendMode                       |
| 5       | **Typography**       | font, size, align, spacing, stroke, text shadow |
| 6       | **Border**           | borderColor, borderWidth, cornerRadius          |
| 7       | **Container**        | Background card props                           |
| 8       | **Effects**          | Drop shadow; element-specific filter controls   |
| 9       | _(advanced variant)_ | Performance knobs, rarely-changed settings      |

### Naming conventions

#### Color and opacity — always split

```typescript
prop.color('color', 'Color', '#FFFFFF');
prop.range('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 });
```

Never use `colorAlpha` for the primary color prop of an element. Keeping them split lets opacity be keyframed independently and makes the inspector clearer.

#### Font weight

The existing `prop.font()` stores `"Family|weight"` in one field, which `parseFontSelection()` decodes. Keep using this — do not add a separate `fontWeight` prop. Ensure all text elements use `prop.font()` rather than `prop.string()` for font family.

#### Borders — use 0 as "off", no boolean toggle

```typescript
prop.color('borderColor', 'Border Color', '#FFFFFF');
prop.number('borderWidth', 'Border Width', 0, { min: 0, step: 1 });
prop.number('cornerRadius', 'Corner Radius', 0, { min: 0 });
```

`borderWidth: 0` renders nothing — no `borderEnabled` toggle needed. Simpler schema, fewer `visibleWhen` conditions.

#### Shadow — use boolean toggle, hide sub-props when disabled

```typescript
prop.boolean('shadowEnabled', 'Drop Shadow', false)
// all remaining props: visibleWhen: [{ key: 'shadowEnabled', equals: true }]
prop.color('shadowColor', 'Color', '#000000', { visibleWhen: [...] })
prop.number('shadowBlur', 'Blur', 8, { min: 0, visibleWhen: [...] })
prop.number('shadowOffsetX', 'Offset X', 2, { visibleWhen: [...] })
prop.number('shadowOffsetY', 'Offset Y', 2, { visibleWhen: [...] })
```

#### Background container — use boolean toggle, hide sub-props when disabled

```typescript
prop.boolean('showBackground', 'Show Background', false)
// all remaining props: visibleWhen: [{ key: 'showBackground', equals: true }]
prop.color('backgroundColor', 'Color', '#000000', { visibleWhen: [...] })
prop.range('backgroundOpacity', 'Opacity', 0.7, { min: 0, max: 1, step: 0.01, visibleWhen: [...] })
prop.number('backgroundPaddingX', 'Padding X', 8, { visibleWhen: [...] })
prop.number('backgroundPaddingY', 'Padding Y', 6, { visibleWhen: [...] })
prop.number('backgroundCornerRadius', 'Corner Radius', 4, { min: 0, visibleWhen: [...] })
```

#### Blend mode — shared constant

Define `BLEND_MODE_CHOICES` once (exported from the prop groups module) and reference it from every element. Avoid each element defining its own subset.

```typescript
export const BLEND_MODE_CHOICES = [
    'source-over',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
];
```

---

## Phased Plan

### Phase 0 — Infrastructure _(~1 day, no user-visible changes)_

1. Implement `propGroup.*` namespace and `BLEND_MODE_CHOICES` in `plugin-sdk-prop-factories.ts` (or a co-exported `plugin-sdk-prop-groups.ts`)
2. Audit every builtin element and record its current prop names, group names, and `colorAlpha` usage — build a migration checklist before touching any element

Prerequisite for all subsequent phases.

### Phase 1 — Color + Opacity Standardization _(1 breaking batch)_

Migrate every `colorAlpha` usage to `color` + `opacity` across all builtin elements. Do this as a single coordinated batch to avoid intermediate states where some elements are migrated and others are not.

Requires: a config migration path so saved projects with no `opacity` key load with `opacity: 1` as the default. Check all elements — Background and both audio displays are confirmed users of `colorAlpha`.

### Phase 2 — Design System Rollout _(largely additive)_

Apply `propGroup.*` across all elements, working through the applicability table in Part 2:

- `propGroup.appearance()` everywhere
- `propGroup.typography()` on all text-using elements (adds `textAlign`, `letterSpacing` where missing)
- `propGroup.container()` on all display elements
- `propGroup.border()` on Background and Image
- `propGroup.shadow()` on Basic Shapes (replacing current custom shadow props) and Image

New props use safe defaults so existing saved scenes are unaffected.

### Phase 3 — Audio Display Enhancements

With the design system in place, add the audio-specific features from the element-specific list: gradient fills, peak hold, decay time, center line, area mode, tick marks.

### Phase 4 — MIDI Display Enhancements

Piano Roll velocity modes, playhead offset, grid style, simplified channel color palette. Notes Playing Display velocity color. CC Monitor knob arc. Chord Estimate confidence display.

### Phase 5 — Image + Text Enhancement

Image: tint overlay, filter controls (brightness/contrast/saturation), drop shadow.  
Text Overlay: multi-line/word-wrap, `textBaseline`, full stroke and text shadow opts on `propGroup.typography()`.
