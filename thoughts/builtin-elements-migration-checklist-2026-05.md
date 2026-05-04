# Builtin Elements Migration Checklist

_Phase 0 audit — May 2026. Prerequisite for all subsequent phases of the suite cohesion plan._

**Phase 1 complete** — all `colorAlpha` props split to `color` + `opacity`. TypeScript: zero errors.

**Phase 2 complete** — `propGroup.*` applied across all builtin elements. TypeScript: zero errors.

---

## Phase 0 — Infrastructure

- [x] Implement `propGroup.*` namespace (`plugin-sdk-prop-groups.ts` or extend `plugin-sdk-prop-factories.ts`)
    - [x] `propGroup.appearance(opts?)` — `color`, `opacity`; opt-in `blendMode`
    - [x] `propGroup.typography(opts?)` — `fontFamily`, `fontSize`, `textAlign`, `letterSpacing`; opt-in `stroke`, `textShadow`
    - [x] `propGroup.border(opts?)` — `borderColor`, `borderWidth`; opt-in `cornerRadius`
    - [x] `propGroup.container()` — `showBackground`, `backgroundColor`, `backgroundOpacity`, `backgroundPaddingX/Y`, `backgroundCornerRadius`
    - [x] `propGroup.shadow()` — `shadowEnabled`, `shadowColor`, `shadowBlur`, `shadowOffsetX/Y`
    - [x] `propGroup.audioSource(key?)` — source group wrapping `audioTrackId`
    - [x] `propGroup.midiSource(key?)` — source group wrapping `midiTrackId`
- [x] Export `BLEND_MODE_CHOICES` constant (16 modes, `source-over` first)
- [x] Co-export from `plugin-sdk.ts` surface if these groups should be available to plugin authors

---

## Phase 1 — `colorAlpha` → `color` + `opacity`

Elements confirmed to use `colorAlpha`. Each must split the field into a `prop.color` (opaque hex) and a `prop.range` opacity. A config migration path is required so saved scenes without an `opacity` key load with `opacity: 1.0` as default.

> **Key**: `→ color` means rename to the canonical `color` prop; `→ keep name` means keep the specific name prefix but split the alpha out.

### misc/background.ts

| Current prop      | Type                   | Migration                                                                    |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `backgroundColor` | colorAlpha `#1a1a1aff` | → `backgroundColor` (hex `#1a1a1a`) + `backgroundOpacity` (range, default 1) |

- [x] Split `backgroundColor` colorAlpha
- [x] Config migration: missing `backgroundOpacity` → default 1

### misc/basic-shapes.ts

| Current prop  | Type                   | Migration                                                                                                                                                                                                                                                                          |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fillColor`   | colorAlpha `#4488ffff` | → `fillColor` (hex) + `fillOpacity` (range, default 1)                                                                                                                                                                                                                             |
| `strokeColor` | colorAlpha `#ffffffff` | → `strokeColor` (hex) + `strokeOpacity` (range, default 1)                                                                                                                                                                                                                         |
| `shadowColor` | colorAlpha `#00000000` | → `shadowColor` (hex `#000000`) + used within `propGroup.shadow()` (shadowEnabled toggle); shadow sub-props already hidden when disabled, so no separate opacity field needed — but alpha default 0 means it was effectively "off by default". New default: `shadowEnabled: false` |

- [x] Split `fillColor` colorAlpha
- [x] Split `strokeColor` colorAlpha
- [x] Migrate `shadowColor` colorAlpha to `shadowEnabled` bool + `shadowColor` opaque + rest of shadow group props
- [x] Config migration for each split prop

### audio-displays/audio-locked-oscilloscope.ts

| Current prop      | Type                   | Migration                                                                    |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `lineColor`       | colorAlpha `#F472B6FF` | → `color` (hex `#F472B6`) + `opacity` (range, default 1)                     |
| `backgroundColor` | colorAlpha `#0F172A00` | → `backgroundColor` (hex `#0F172A`) + `backgroundOpacity` (range, default 0) |

- [x] Rename `lineColor` → `color` + `opacity`
- [x] Split `backgroundColor` colorAlpha
- [x] Config migration

### audio-displays/audio-spectrum.ts

| Current prop      | Type                   | Migration                                                                    |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `primaryColor`    | colorAlpha `#60A5FAFF` | → `color` (hex `#60A5FA`) + `opacity` (range, default 1)                     |
| `backgroundColor` | colorAlpha `#0F172A00` | → `backgroundColor` (hex `#0F172A`) + `backgroundOpacity` (range, default 0) |

- [x] Rename `primaryColor` → `color` + `opacity`
- [x] Split `backgroundColor` colorAlpha
- [x] Config migration

### audio-displays/audio-volume-meter.ts

| Current prop      | Type                   | Migration                                                                    |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `meterColor`      | colorAlpha `#F472B6FF` | → `color` (hex `#F472B6`) + `opacity` (range, default 1)                     |
| `backgroundColor` | colorAlpha `#0F172A00` | → `backgroundColor` (hex `#0F172A`) + `backgroundOpacity` (range, default 0) |

- [x] Rename `meterColor` → `color` + `opacity`
- [x] Split `backgroundColor` colorAlpha
- [x] Config migration

### audio-displays/audio-waveform.ts

| Current prop      | Type                   | Migration                                                                     |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `primaryColor`    | colorAlpha `#22D3EEFF` | → `color` (hex `#22D3EE`) + `opacity` (range, default 1)                      |
| `secondaryColor`  | colorAlpha `#F472B6FF` | keep `secondaryColor` (hex `#F472B6`) + `secondaryOpacity` (range, default 1) |
| `backgroundColor` | colorAlpha `#0F172A00` | → `backgroundColor` (hex `#0F172A`) + `backgroundOpacity` (range, default 0)  |

- [x] Rename `primaryColor` → `color` + `opacity`
- [x] Split `secondaryColor` colorAlpha
- [x] Split `backgroundColor` colorAlpha
- [x] Config migration

### midi-displays/moving-notes-piano-roll.ts

| Current prop    | Type                   | Migration                                                                                      |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `noteColor`     | colorAlpha `#FF6B6BCC` | → `noteColor` (hex `#FF6B6B`) + `noteOpacity` (range, default ~0.8 from `CC` = 204/255 ≈ 0.80) |
| `playheadColor` | colorAlpha `#ff6b6bff` | → `playheadColor` (hex `#ff6b6b`) + `playheadOpacity` (range, default 1)                       |

- [x] Split `noteColor` colorAlpha (note: default alpha is `CC` = 0.80, not 1.0)
- [x] Split `playheadColor` colorAlpha
- [x] Config migration

### midi-displays/time-unit-piano-roll.ts

| Current prop    | Type                   | Migration                                                                |
| --------------- | ---------------------- | ------------------------------------------------------------------------ |
| `noteColor`     | colorAlpha `#FF6B6BCC` | → `noteColor` (hex `#FF6B6B`) + `noteOpacity` (range, default ~0.80)     |
| `playheadColor` | colorAlpha `#ff6b6bff` | → `playheadColor` (hex `#ff6b6b`) + `playheadOpacity` (range, default 1) |

- [x] Split `noteColor` colorAlpha
- [x] Split `playheadColor` colorAlpha
- [x] Config migration

### audio-debug/audio-debug.ts _(debug element — lower priority)_

| Current prop      | Type                   | Migration                                                              |
| ----------------- | ---------------------- | ---------------------------------------------------------------------- |
| `textColor`       | colorAlpha `#E2E8F0FF` | → `color` (hex) + `opacity` (range, default 1)                         |
| `backgroundColor` | colorAlpha `#0F172A8C` | → `backgroundColor` (hex) + `backgroundOpacity` (range, default ~0.55) |

- [ ] Split both colorAlpha props
- [ ] Config migration

---

## Phase 2 — Design System Rollout

Apply `propGroup.*` across elements per the applicability table. New props use safe defaults so existing saved scenes are unaffected (no config migration needed).

### Legend

- `appearance` = `propGroup.appearance()` — `color`, `opacity`
- `appearance+b` = `propGroup.appearance({ blendMode: true })`
- `typography` = `propGroup.typography()`
- `typography+s` = `propGroup.typography({ stroke: true })`
- `border` = `propGroup.border()`
- `border+r` = `propGroup.border({ cornerRadius: true })`
- `container` = `propGroup.container()`
- `shadow` = `propGroup.shadow()`
- `audioSrc` = `propGroup.audioSource()`
- `midiSrc` = `propGroup.midiSource()`

### Element checklist

| Element                   | Groups to add                                      | Notes                                                                                            |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Background**            | `appearance`, `border`                             | Already has color after Phase 1; border adds frame option                                        |
| **Basic Shapes**          | `appearance+b`                                     | Replace custom shadow props → `propGroup.shadow()`; keep custom border (strokeColor/strokeWidth) |
| **Image**                 | `appearance+b`, `border+r`, `shadow`               | Currently has no color/opacity/border/shadow props                                               |
| **Text Overlay**          | `appearance+b`, `typography+s`, `container`        | Currently only has font+color; add textAlign, letterSpacing, stroke, bg container                |
| **Time Display**          | `appearance`, `typography`, `container`            | Has textColor/textSecondaryColor — standardize; add bg container                                 |
| **Progress Display**      | `appearance`, `typography` (labels)                | Already has color+opacity (non-standard names); standardize group names                          |
| **Audio Spectrum**        | `appearance+b`, `audioSrc`                         | Already has audioTrackId; appearance after Phase 1                                               |
| **Audio Waveform**        | `appearance+b`, `audioSrc`                         | Two-color element; primary → appearance group; secondary stays custom                            |
| **Audio Volume Meter**    | `appearance`, `typography` (labels), `audioSrc`    | Has showValue label; needs font controls for that                                                |
| **Audio Oscilloscope**    | `appearance+b`, `audioSrc`                         |                                                                                                  |
| **Notes Played Tracker**  | `appearance`, `typography`, `container`, `midiSrc` | Has partial typography already; standardize group name                                           |
| **Notes Playing Display** | `appearance`, `typography`, `container`, `midiSrc` | Same as above                                                                                    |
| **CC Monitor**            | `appearance`, `typography`, `midiSrc`              | Has partial typography (`ccTypography` group); rename to standard                                |
| **Chord Estimate**        | `appearance`, `typography`, `container`, `midiSrc` | Has `appearance` group name already (non-standard props)                                         |
| **Piano Roll (both)**     | `appearance`, `midiSrc`                            | Piano Roll notes have multi-color complexity; only primary appearance standardized               |

### Per-element tasks

#### misc/background.ts

- [x] Replace `backgroundAppearance` group → `propGroup.appearance()`
- [x] Add `propGroup.border()`
- [x] Rename group from `backgroundAppearance` to canonical `'Appearance'`

#### misc/basic-shapes.ts

- [x] Replace `shapeAppearance` `fillColor`+`strokeColor` with `propGroup.appearance({ blendMode: true })` (primary fill = `color`+`opacity`)
- [x] Replace `shapeShadow` group → `propGroup.shadow()`
- [x] Keep stroke as custom props in `'Border'`-style group (strokeColor, strokeWidth, lineCap, dash)
- [x] Use shared `BLEND_MODE_CHOICES` constant instead of inline array

#### misc/image.ts

- [x] Add `propGroup.appearance({ blendMode: true })`
- [x] Add `propGroup.border({ cornerRadius: true })`
- [x] Add `propGroup.shadow()`
- [x] Use shared `BLEND_MODE_CHOICES`

#### misc/text-overlay.ts

- [x] Replace `typography` group → `propGroup.typography({ stroke: true })`
- [x] Add `propGroup.appearance({ blendMode: true })`
- [x] Add `propGroup.container()`
- [x] Add `textAlign`, `letterSpacing` (currently missing)
- [x] Use shared `BLEND_MODE_CHOICES`

#### misc/time-display.ts

- [x] Standardize `textColor` → `color` (in appearance group)
- [x] Add `propGroup.typography()`
- [x] Add `propGroup.container()`
- [x] Decide fate of `textSecondaryColor` (secondary label color — keep as custom prop or drop)

#### misc/progress-display.ts

- [x] Rename `progressAppearance` group → canonical `'Appearance'`
- [x] Standardize prop names: `barColor`/`barOpacity` → consider if bar color belongs in appearance or a sub-section
- [x] Add `propGroup.typography()` for stats text labels

#### audio-displays/audio-spectrum.ts

- [x] Ensure `propGroup.audioSource()` used for `audioTrackId`
- [x] Wrap `color`+`opacity`+`blendMode` into `propGroup.appearance({ blendMode: true })`
- [x] Use shared `BLEND_MODE_CHOICES`

#### audio-displays/audio-waveform.ts

- [x] Primary color → `propGroup.appearance({ blendMode: true })`
- [x] Secondary color stays as custom `secondaryColor`+`secondaryOpacity` props
- [x] Ensure `propGroup.audioSource()` for `audioTrackId`
- [x] Use shared `BLEND_MODE_CHOICES`

#### audio-displays/audio-volume-meter.ts

- [x] Wrap `color`+`opacity` into `propGroup.appearance()`
- [x] Add `propGroup.typography()` scoped to label display (for `showValue` label font)
- [x] Ensure `propGroup.audioSource()` for `audioTrackId`

#### audio-displays/audio-locked-oscilloscope.ts

- [x] Wrap `color`+`opacity` into `propGroup.appearance({ blendMode: true })`
- [x] Ensure `propGroup.audioSource()` for `audioTrackId`
- [x] Use shared `BLEND_MODE_CHOICES`

#### midi-displays/notes-played-tracker.ts

- [x] Rename `trackerSource` group → `propGroup.midiSource()`
- [x] Rename `appearance` group → `propGroup.appearance()`
- [x] Replace `textJustification`/`fontFamily`/`fontSize`/`lineSpacing` → `propGroup.typography()`
- [x] Add `propGroup.container()`
- [x] Note: `textJustification` uses `['left', 'right']` — Phase 2 should standardize to `textAlign: ['left', 'center', 'right']`

#### midi-displays/notes-playing-display.ts

- [x] Same as Notes Played Tracker above (identical structure)

#### midi-displays/cc-monitor.ts

- [x] Rename `ccSource` → `propGroup.midiSource()`
- [x] Rename `ccTypography` → `propGroup.typography()`
- [x] Standardize `textColor` → `color` in typography group
- [x] Add `propGroup.appearance()` wrapping the standardized `color`+`opacity`

#### midi-displays/chord-estimate-display.ts

- [x] Rename `chordSource` → `propGroup.midiSource()`
- [x] Replace `appearance` group's color+font → `propGroup.appearance()` + `propGroup.typography()`
- [x] Replace `textJustification` → `textAlign` with full `['left', 'center', 'right']`
- [x] Add `propGroup.container()`

#### midi-displays/moving-notes-piano-roll.ts

- [x] Add `propGroup.midiSource()` (rename `midiSource` group)
- [x] Add `propGroup.appearance()` for the primary note color (`color`+`opacity`)
- [x] Keep channel colors (`channel0Color`–`channel15Color`) as custom multi-color props

#### midi-displays/time-unit-piano-roll.ts

- [x] Same piano-roll approach as above

---

## Elements NOT in migration scope

These elements are either debug-only or infrastructure and intentionally excluded from design system work:

| Element                    | Reason                                                 |
| -------------------------- | ------------------------------------------------------ |
| `AudioAdhocProfileElement` | Debug/internal only                                    |
| `AudioBadReqElement`       | Debug/internal only                                    |
| `AudioMinimalElement`      | Debug/internal only                                    |
| `AudioOddProfileElement`   | Debug/internal only                                    |
| `DebugElement`             | Debug/internal only                                    |
| `MissingPluginElement`     | Infrastructure placeholder, intentional minimal schema |

---

## Naming inconsistencies to resolve in Phase 2

| Current usage                                                            | Standard                                  | Affected elements                                                 |
| ------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| `textJustification: ['left','right']`                                    | `textAlign: ['left','center','right']`    | NotesPlayedTracker, NotesPlayingDisplay, ChordEstimate, CCMonitor |
| `fontFamily` (prop.string)                                               | `fontFamily` (prop.font)                  | time-display uses `prop.font` ✓; verify all others                |
| `textColor`, `statsTextColor`, `meterColor`, `lineColor`, `primaryColor` | `color` (in appearance group)             | all audio displays, time-display, progress-display                |
| Group name `oscilloscopeBasics`                                          | `'Source'` + `'Layout'` standard sections | AudioWaveform                                                     |
| Group name `spectrumBasics`                                              | same                                      | AudioSpectrum                                                     |
| Group name `backgroundAppearance`                                        | `'Appearance'`                            | Background                                                        |
| Group name `shapeAppearance`, `shapeSize`, `shapeShadow`, `shapeType`    | standard section names                    | BasicShapes                                                       |
| Group name `ccTypography`                                                | `'Typography'`                            | CCMonitor                                                         |
| Group name `chordSource`                                                 | `'Source'`                                | ChordEstimate                                                     |
| Group name `trackerSource`                                               | `'Source'`                                | NotesPlayedTracker                                                |

---

## Config migration requirements (Phase 1)

Every `colorAlpha` split creates a new prop key that won't exist in saved scenes. All splits need a default:

| Element              | New key             | Default value |
| -------------------- | ------------------- | ------------- |
| Background           | `backgroundOpacity` | `1`           |
| BasicShapes          | `fillOpacity`       | `1`           |
| BasicShapes          | `strokeOpacity`     | `1`           |
| BasicShapes          | `shadowEnabled`     | `false`       |
| AudioOscilloscope    | `opacity`           | `1`           |
| AudioOscilloscope    | `backgroundOpacity` | `0`           |
| AudioSpectrum        | `opacity`           | `1`           |
| AudioSpectrum        | `backgroundOpacity` | `0`           |
| AudioVolumeMeter     | `opacity`           | `1`           |
| AudioVolumeMeter     | `backgroundOpacity` | `0`           |
| AudioWaveform        | `opacity`           | `1`           |
| AudioWaveform        | `secondaryOpacity`  | `1`           |
| AudioWaveform        | `backgroundOpacity` | `0`           |
| MovingNotesPianoRoll | `noteOpacity`       | `0.80`        |
| MovingNotesPianoRoll | `playheadOpacity`   | `1`           |
| TimeUnitPianoRoll    | `noteOpacity`       | `0.80`        |
| TimeUnitPianoRoll    | `playheadOpacity`   | `1`           |
| AudioDebug           | `opacity`           | `1`           |
| AudioDebug           | `backgroundOpacity` | `0.55`        |

Check where config defaults are applied (likely in `SceneElement.getConfigValue` or config schema resolution) and add fallback logic for missing keys.
