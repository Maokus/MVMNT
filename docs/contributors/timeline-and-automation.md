# Timeline and automation

## Time domains

Integer ticks are authoritative for musical position. The timeline stores the playhead, loop,
viewport, playback range, note positions, and clip placement in ticks. Beats and seconds are
derived through `TimingManager` and the current tempo map.

Audio differs at the media boundary: an audio clip is placed in ticks, while source duration and
trim points use immutable source seconds. Changing tempo therefore changes the clip's musical span
without changing which source samples play.

MIDI input is normalized to the canonical 960 PPQ during ingestion. Playback retains fractional
tick remainder internally to avoid cumulative drift. Export snapshots timing inputs before mapping
frame seconds back to ticks.

## Clips and selection

MIDI and audio tracks contain clips that reference immutable source-cache entries. The clip view
stores transient point, range, or explicit-clip selection separately from scene and automation
selection. Background gestures create point or range selections; clip gestures resolve ranges to
concrete references before move, resize, clipboard, or duplicate commands.

Clip mutations go through timeline commands. Cross-track moves validate compatible destinations,
and clipboard payloads carry source references needed to paste into additional tracks. Selection is
not persisted.

## Property automation

Automation channels have opaque IDs and structured targets:

```ts
type AutomationTarget = {
    owner: { kind: 'element' | 'node'; id: string };
    propertyPath: string;
};
```

Channels contain ordered keyframes and a value type. Numbers and colors interpolate through easing;
booleans and strings step. Before the first and after the last keyframe, evaluation holds the
nearest value.

Effective values are resolved from automation, macro modifiers, and constant fallback. The shared
property catalog and edit coordinator apply identical automation, auto-key, macro, gesture-merge,
and undo semantics to element properties, host-node fields, compound controls, and compatible bulk
edits.

## Editing rules

- Use scene automation commands to enable, disable, add, remove, update, or move keyframes.
- Use a stable merge key for continuous keyframe and canvas gestures.
- Never mutate automation arrays or bindings directly from a component.
- Keep aggregate multi-selection transforms separate from bindable local properties.
- Obtain tick/second conversions from timing services or selectors; do not duplicate tempo math in
  UI code.

Automation implementation and tests live in `src/automation/`, `src/bindings/`, and the scene
command suites.
