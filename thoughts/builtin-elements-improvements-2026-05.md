# Builtin Elements: Improvements for a Cohesive Suite

_May 2026_

## Summary

The builtin suite has strong foundations — particularly Basic Shapes, Audio Spectrum/Waveform, and Time Unit Piano Roll — but suffers from systemic inconsistencies that make it feel like a collection of independent tools rather than a unified system. The most impactful improvements are cross-cutting: standardising color+opacity, adding border/frame support everywhere, and giving text elements the typographic control they're missing.

---

## Cross-Cutting Systemic Issues

These affect most or all elements and should be addressed as a batch before individual element polish.

### 1. Color + Opacity System (Critical)

No consistent approach. Currently:

- Some use `colorAlpha` (8-char hex — color + alpha in one field)
- Some use `color` + separate `opacity` prop
- Some use neither, hardcoding alpha into rendering

This means users can't reliably understand how to control transparency across elements.

**Recommendation:** Standardise on `color` (no alpha) + `opacity` (0–1) everywhere. The colorAlpha picker is harder to use and hides the fact that opacity can be keyframed independently.

### 2. Border / Frame Support (High)

Almost no element exposes border controls. Users can't frame or contain content, and there's no visual border vocabulary. Basic Shapes does this well — extend that pattern everywhere.

**Add to all visual elements:**

- `borderColor` (hex)
- `borderWidth` (px, 0 = none)
- `cornerRadius` (px) — where applicable

### 3. Typography Completeness (High)

Text-using elements are inconsistent and under-featured. Several expose `fontFamily` + `fontSize` + `color` and nothing else.

**Add to all text-using elements:**

- `textAlign` (left/center/right) — currently some hardcode this
- `letterSpacing` (px)
- Text stroke: `textStrokeColor` + `textStrokeWidth`
- Text shadow: `textShadowColor` + `textShadowBlur` + `textShadowOffsetX/Y`

### 4. Background Container for Displays (High)

Every data display (time, MIDI, stats) renders floating text with no visual containment. Users building clean layouts need a background/card.

**Add to all display elements:**

- `showBackground` (boolean)
- `backgroundColor` + `backgroundOpacity`
- `backgroundPaddingX` + `backgroundPaddingY`
- `backgroundCornerRadius`

### 5. Blend Mode Support (Medium)

Only Basic Shapes exposes `blendMode`. Image, Text, and all displays are stuck at `source-over`.

**Add to:** Image, Text Overlay, all audio/MIDI displays.

### 6. Shadow / Glow Consistency (Medium)

Basic Shapes exposes shadow props. Piano Roll note glow is partially exposed. Everything else has none.

**Add to all elements:**

- `shadowEnabled` (boolean toggle)
- `shadowColor`, `shadowBlur`, `shadowOffsetX/Y`

### 7. Shared Display Mode Enum (Low)

Audio Spectrum uses `display: bar|line|dot`, Waveform uses the same naming — good. But these aren't shared constants. If a new audio element is added it'll likely invent its own. Extract to a shared type so all audio displays speak the same language.

---

## Element-by-Element Recommendations

### Background

Currently only exposes `backgroundColor` (colorAlpha). The simplest element but limited.

- Add `opacity` separate from color
- Add `cornerRadius`
- Add `borderColor` + `borderWidth`
- Add gradient support: `useGradient`, `gradientAngle`, `gradientColorStart`, `gradientColorEnd`
- Document that it implicitly sits at zIndex = -1000; expose `zIndex` or at least document the default

### Basic Shapes

Well-designed. Minor gaps:

- Add `lineJoin` to match `lineCap`
- Add gradient fill support (`useGradient`, `gradientAngle`, `gradientColorStart/End`)
- The `sides` prop for polygon should have a minimum of 3 documented clearly

### Image

Missing most visual control:

- `blendMode`
- `opacity` (element-level, separate from asset)
- `tintColor` + `tintOpacity` (color overlay)
- `filterBrightness`, `filterContrast`, `filterSaturation`, `filterHueRotate` (CSS filter pass-through)
- `borderColor`, `borderWidth`, `cornerRadius` (for framing)
- `dropShadow` + shadow props

### Text Overlay

Bare minimum currently (`text`, `fontFamily`, `fontSize`, `color`). Needs the full set:

- `textAlign` (left/center/right)
- `textBaseline` (top/middle/bottom)
- `fontWeight`
- `letterSpacing`
- `textStrokeColor` + `textStrokeWidth`
- `textShadowColor`, `textShadowBlur`, `textShadowOffsetX/Y`
- `blendMode`
- Background container props (see cross-cutting)
- Multi-line: `maxWidth` + `lineHeight` + `wordWrap`

### Time Display

Hardcodes a lot of layout that should be configurable:

- `fontSize` (currently fixed at 24px)
- `showBars`, `showBeats`, `showTicks`, `showMinutes`, `showSeconds`, `showMilliseconds` toggles — let users show only what they want
- Progress bar props: `progressBarWidth`, `progressBarHeight`, `progressBarColor`, `progressBarBgColor`
- `labelOpacity` (to fade the text labels while keeping values visible)

### Progress Display

Among the better-designed elements. Gaps:

- `statsFontFamily` + `statsFontSize` (currently hardcoded Arial)
- `cornerRadius` for the bar
- `showPercentage` toggle alongside or instead of time

### Audio Spectrum

Very solid. Improvements:

- Gradient fills: `useGradient`, `gradientColorStart`, `gradientColorEnd` (height-mapped)
- `barSpacing` to control gap between bars (currently implicit)
- `peakHoldEnabled` + `peakHoldDuration` + `peakHoldColor`
- `decayTime` for visual smoothing separate from the FFT `smoothing`

### Audio Waveform

Also very solid. Gaps:

- `displayMode` addition: `area` (filled under the curve)
- `showCenterLine` + `centerLineColor` + `centerLineWidth`
- `playheadShape` (line/triangle)
- Independent per-channel opacity

### Audio Volume Meter

More limited than the others:

- `peakHoldEnabled` + `peakHoldDuration` + `peakHoldColor` — a VU meter without peak hold looks unfinished
- `tickMarks`: `showTicks`, `tickCount`, `tickColor`
- `labelPosition` (above/below/left/right/none)
- `labelFontSize` + `labelFontFamily`
- `barCornerRadius`
- `decayTime`

### Audio Locked Oscilloscope

Most minimal of the audio displays:

- `displayMode` (line/area/bar/dot) — for consistency with Spectrum/Waveform
- `fillColor` + `fillOpacity` for area mode
- `showGrid` + `gridColor` + `gridOpacity`
- `showCenterLine` + `centerLineColor`
- `showFrequencyLabel` + label styling

### Notes Played Tracker

- `fontWeight`
- `showPercentages` toggle
- `showEventCount` toggle
- Background container (see cross-cutting)

### Notes Playing Display

- `fontWeight`
- `textAlign` (center option)
- `colorByVelocity` + velocity color low/mid/high
- `showVelocity` toggle
- Background container

### CC Monitor

Well-structured with good mode separation. Gaps:

- Knob mode: `knobArcStart` / `knobArcEnd` for custom sweep range
- Knob mode: gradient support for track/value
- Full monitor: `alignment` (left/center/right)
- `fadeStyle` (linear/exponential)

### Chord Estimate Display

- `showConfidence` toggle + `confidenceFontSize`
- `chromaSize` + `chromaSpacing` (currently fixed 20px)
- Background container
- Option to suppress "N.C." display

### Time Unit Piano Roll

The most feature-complete element. Specific gaps:

- `velocityHeightMode`: scale note height by velocity
- `velocityColorMode` (none/brightness/hue shift)
- `playheadOffset` (0–1) — allows left/right-weighted playhead position rather than always centered
- `gridStyle` (solid/dashed/dotted)
- Simplify the 16-channel color props: they could be a single `channelColorPalette` select (e.g. "rainbow/pastel/monochrome") with an override per channel, rather than 16 independent props

---

## Priority Order

### Immediate (consistency, no design decisions required)

1. Standardise color+opacity across all elements
2. Add `textAlign` + `textBaseline` to all text elements
3. Add `fontWeight` to all text elements
4. Add `blendMode` to Image and Text Overlay

### Short-term (highest user value)

6. Background container props for all displays
7. Border/frame support on Background, Image, Text
8. `peakHoldEnabled` + decay on audio displays
9. Gradient fills on Background + Basic Shapes
10. `filterBrightness/Contrast/Saturation` on Image

### Medium-term (feature parity + polish)

11. Text stroke + shadow on Text Overlay
12. Area fill mode on Waveform + Oscilloscope
13. Piano roll velocity visualization
14. Gradient fills on audio displays (height-mapped)
15. Knob arc customization in CC Monitor

### Low-priority (nice-to-have)

16. Centralized color palette / theming
17. Shared display mode enum
18. Preset libraries for complex elements
19. Standardize data source prop naming (`audioTrack` vs `audioTrackId`)
20. Multi-line text support in Text Overlay
