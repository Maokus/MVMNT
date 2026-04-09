# Tempo Automation — Option B Implementation Plan
## Tick-Domain Special Channel, Hold-Only Interpolation

_April 2026_

---

## Why Option B + Hold-Only Resolves the Original Cons

The planning doc listed three serious concerns for Option B. Restricting to hold (constant/step) interpolation eliminates all of them:

| Original con | Status with hold-only |
|---|---|
| Circular dependency cascade | **Gone.** Hold segments convert with simple `ticks / PPQ * (60 / bpm)` — no integral needed. |
| Easing integration complexity | **Gone.** No integration; each segment is a flat BPM constant. |
| MIDI bootstrapping problem | **Gone.** Forward pass is a trivial cumulative sum, no tempo-dependent lookup required. |

The only remaining con — "evaluation pathway differs from property automation" — is embraced rather than hidden. The `__tempo__` channel has a dedicated resolver; it does not go through `AutomationCurve.evaluate()`.

---

## Core Algorithm: Forward Pass Resolver

Given `n` keyframes sorted ascending by tick, with the pre-automation `globalBpm` as the initial segment:

```
prevBpm     = globalBpm
prevTimeSec = 0
result      = [{ time: 0, bpm: globalBpm, curve: 'step' }]

for each keyframe kf at tick T with bpm B:
    durationSec = (T - prevTick) / PPQ * (60 / prevBpm)
    timeSec     = prevTimeSec + durationSec
    result.push({ time: timeSec, bpm: B, curve: 'step' })
    prevTick    = T
    prevTimeSec = timeSec
    prevBpm     = B
```

This is O(n) and deterministic — no lookup into the map being built, no circularity.

---

## Data Model

### New type: `TempoKeyframe`

```typescript
// src/core/timing/types.ts — add alongside TempoMapEntry
export interface TempoKeyframe {
    tick: number;   // tick-domain position (absolute)
    bpm: number;    // tempo starting at this tick
}
```

No `easingId` field needed — hold-only means there is nothing to configure per segment.

### Storage: extend `TimelineState`

```typescript
// src/state/timelineStore.ts — in the timeline sub-object
tempoAutomation: {
    enabled: boolean;
    keyframes: TempoKeyframe[];   // always sorted ascending by tick
};
```

Stored in `timelineStore` (not `sceneStore`) — tempo is a timeline-level concern, not a scene element property. Default: `{ enabled: false, keyframes: [] }`.

### Derivation

When `tempoAutomation.enabled` is true, the store derives `masterTempoMap` from the keyframes via the forward pass resolver and passes it to `setMasterTempoMap()`. When disabled, `masterTempoMap` is cleared and `globalBpm` resumes.

---

## State Actions

```typescript
// New actions on the timeline store
enableTempoAutomation(): void
// Seeds with a single keyframe at tick 0 at the current globalBpm.

disableTempoAutomation(): void
// Clears keyframes, sets enabled: false, clears masterTempoMap.

addTempoKeyframe(tick: number, bpm: number): void
// Inserts a keyframe (sorted). If a keyframe exists within tolerance, replaces it.
// Calls _applyTempoAutomation() to rebuild masterTempoMap.

removeTempoKeyframe(tick: number): void
// Removes the keyframe at the given tick (within tolerance).
// Calls _applyTempoAutomation().

moveTempoKeyframe(fromTick: number, toTick: number): void
// Repositions a keyframe. Preserves BPM value. Re-sorts and rebuilds map.

updateTempoKeyframeBpm(tick: number, bpm: number): void
// Updates the BPM at an existing keyframe position. Rebuilds map.

batchSetTempoKeyframes(keyframes: TempoKeyframe[]): void
// Replaces all keyframes at once. For MIDI import.

commitTempoKeyframeDrag(fromTick: number, toTick: number): void
// Same as moveTempoKeyframe, but explicitly marks this as the "final" update
// after a drag gesture — used by the UI to know it's safe to re-trigger analysis.

// Private:
_applyTempoAutomation(): void
// Runs the forward pass, calls setMasterTempoMap(derivedMap).
```

All public actions are undoable — wire into the existing undo system (scene command or timeline-level undo stack, whichever is used for timeline mutations).

---

## Resolver Module

```typescript
// src/core/timing/tempo-automation-resolver.ts

import type { TempoKeyframe } from './types';
import type { TempoMapEntry } from './types';

/**
 * Convert tick-domain hold-only tempo keyframes into a TempoMapEntry[] suitable
 * for TimingManager / TempoMapper. O(n) forward pass.
 *
 * @param keyframes  Sorted ascending by tick. Must not be empty.
 * @param globalBpm  Fallback BPM before the first keyframe.
 * @param ppq        Ticks per quarter note (from SharedTimingManager).
 */
export function resolveTempoKeyframes(
    keyframes: readonly TempoKeyframe[],
    globalBpm: number,
    ppq: number,
): TempoMapEntry[] {
    const result: TempoMapEntry[] = [{ time: 0, bpm: globalBpm, curve: 'step' }];

    let prevTick = 0;
    let prevTimeSec = 0;
    let prevBpm = globalBpm;

    for (const kf of keyframes) {
        const durationSec = (kf.tick - prevTick) / ppq * (60 / prevBpm);
        const timeSec = prevTimeSec + durationSec;
        result.push({ time: timeSec, bpm: kf.bpm, curve: 'step' });
        prevTick = kf.tick;
        prevTimeSec = timeSec;
        prevBpm = kf.bpm;
    }

    return result;
}
```

Unit-test fully: empty keyframes, single keyframe, multiple keyframes, BPM changes, edge cases at tick 0.

---

## UI: Tempo Automation Lane

### Visual design

A new lane in the timeline panel, rendered below the track list (or as a dedicated section in a future "master lane" area). Visually: a stepped curve on a BPM-scaled vertical axis, with diamond markers at each keyframe.

```
  140 ┤         █████████████
  120 ┤ ████████              █████████████
  100 ┤                                    ████
      └──────────────────────────────────────────▶ ticks
```

The lane uses tick-domain horizontal coordinates (same pixel mapping as all other timeline content), so keyframes align precisely with notes, clip edges, and beat markers.

### Components

| Component | Responsibility |
|---|---|
| `TempoAutomationLane.tsx` | SVG lane: stepped curve, keyframe diamonds, BPM value axis, interaction handlers |
| `TempoLaneHeader.tsx` | Left column: "TEMPO" label, BPM range display, enable/disable toggle |
| `TempoKeyframeLabel.tsx` | Inline BPM label on hover/select; editable on double-click |

### BPM vertical axis

- Auto-fit: `[min(kfBpms) - 20, max(kfBpms) + 20]`, clamped to `[20, 400]`
- Gridlines at round BPM increments (40, 80, 120, 160, 200…)
- Resize via vertical drag of the axis area

### Interaction

| Action | Gesture |
|---|---|
| Add keyframe | Double-click on lane background |
| Delete keyframe | Right-click → "Delete" or select + Backspace |
| Move keyframe (tick) | Drag diamond horizontally |
| Adjust BPM | Drag diamond vertically, or double-click to type exact value |
| Snap to beat/bar | Hold Shift while dragging |

No easing picker is shown for this lane — interpolation is always hold (constant), and the UI should make this clear with a label or tooltip if users ask.

### BPM input in timeline header

When `tempoAutomation.enabled`:
- Show the live BPM at the current playhead position (derived from `masterTempoMap`) — read-only
- Dim the input with a tooltip "Tempo is automated — edit keyframes in the tempo lane"
- Optionally: clicking the BPM display jumps to / reveals the tempo lane

---

## Integration Points

### `setMasterTempoMap` already does the right things

Inspecting `timelineStore.ts`: `setMasterTempoMap(map?)` already:
1. Propagates to `SharedTimingManager`
2. Marks **all audio feature caches stale** (sets `audioFeatureCacheStatus` to stale)
3. Recomputes `audioCache.durationTicks` entries

This means `_applyTempoAutomation()` only needs to call `setMasterTempoMap(derivedMap)` and all downstream invalidation is handled automatically. **No new propagation code needed.**

### `resolveTempoMapper` in the adapter pipeline

`tempoAlignedViewAdapter.ts` caches the `TempoMapper` keyed on `JSON.stringify(masterTempoMap)`. When `masterTempoMap` changes (via `_applyTempoAutomation`), the next call to `resolveTempoMapper()` gets a cache miss and builds a fresh `TempoMapper`. **No change needed.**

### Render loop

No change needed. The render loop already syncs `masterTempoMap` to `TimingManager` each frame.

### Serialization

Add `tempoAutomation` to the project persistence envelope. Bump schema version. Migration for older projects: `tempoAutomation: { enabled: false, keyframes: [] }`.

### MIDI import

The MIDI ingest path already produces `TempoMapEntry[]` per track. Conversion to `TempoKeyframe[]` for the automation lane requires a **reverse pass**: given the seconds-domain `TempoMapEntry[]`, compute tick positions.

Since all MIDI tempo events use step/constant interpolation (the `'linear'` curve is optional and rarely used in MIDI files), this is the inverse of the forward pass:

```typescript
function midiTempoMapToKeyframes(map: TempoMapEntry[], ppq: number): TempoKeyframe[] {
    // map is already in seconds-domain with step curves
    // Use a TempoMapper built from this very map to convert timeSec → tick
    const tempoMapper = createTempoMapper({ ticksPerQuarter: ppq, globalBpm: 120, tempoMap: map });
    return map.map(entry => ({
        tick: Math.round(tempoMapper.secondsToTicks(entry.time)),
        bpm: entry.bpm ?? (entry.tempo ? 60_000_000 / entry.tempo : 120),
    }));
}
```

This is bootstrapped from the MIDI-provided map itself (no circularity — we're converting from a known seconds-domain representation to tick-domain).

---

## Audio Clip Preview Adaptation

### Why waveforms depend on the tempo map

`waveformCalculator.ts` uses `context.tempoMapper` (`TempoMapper`) to convert audio frame positions (seconds) to ticks via `projectFrameCentersToTicks`. The resulting `AudioFeatureTrack` stores frame tick positions that are baked in at analysis time.

`AudioWaveform.tsx` renders these in tick-domain (using `regionStartTickAbs` / `regionEndTickAbs`). So the visual waveform is **tempo-map-dependent**: changing the tempo map changes where audio frames appear on the tick axis.

### What already works

As noted above, `setMasterTempoMap()` marks all audio feature caches stale. The stale caches trigger re-analysis with the new `TempoMapper`. The waveform will be correctly re-projected once re-analysis completes.

**This means waveform correctness is free** — the existing cache invalidation pipeline handles it automatically.

### The UX concern: re-analysis latency during keyframe dragging

Every intermediate position during a tempo keyframe drag would trigger `_applyTempoAutomation()` → `setMasterTempoMap()` → cache stale → waveform re-analysis. Analysis is async (cooperative yield via `maybeYield()`), but it's still compute-heavy and would produce visible flicker as waveforms repeatedly invalidate and re-render.

**Solution: two-phase drag commit**

1. **During drag**: update a local draft state (`tempoAutomation.draftKeyframes`) that the tempo lane UI uses for rendering the curve preview. Do NOT call `_applyTempoAutomation()` — the masterTempoMap and audio caches are untouched.
2. **On mouse-up (commit)**: write the draft to the persistent `tempoAutomation.keyframes` and call `_applyTempoAutomation()`. This triggers one cache invalidation and one re-analysis per drag gesture — perfectly acceptable.

During the drag, the lane curve updates instantly (pure UI state). The audio waveforms stay at their pre-drag positions and are visibly "misaligned" while dragging (as in most DAWs). A subtle label "Updating waveforms..." can appear post-commit while re-analysis runs.

This pattern applies to: `moveTempoKeyframe` (horizontal drag), vertical BPM-drag, and BPM field edits that are committed with Enter.

### Hold-only interpolation is ideal for waveform accuracy

With linear or eased tempo ramps, the tick positions of audio frames shift non-linearly across the entire timeline when any keyframe BPM changes. With hold-only, a BPM change in segment N only shifts the tick positions of frames **in segments N+1 and beyond** — frames in earlier segments are unaffected.

This could be exploited for a selective cache invalidation optimization (only re-analyze tracks anchored in affected segments). This is an optional optimization for Phase 2+.

---

## Phased Implementation

### Phase 1 — Core logic (no UI)

- Add `TempoKeyframe` type to `src/core/timing/types.ts`
- Add `resolveTempoKeyframes()` to `src/core/timing/tempo-automation-resolver.ts`
- Add `tempoAutomation` field to `TimelineState` with `enabled: false, keyframes: []`
- Add all store actions (`enableTempoAutomation`, `disableTempoAutomation`, `addTempoKeyframe`, `removeTempoKeyframe`, `moveTempoKeyframe`, `updateTempoKeyframeBpm`, `batchSetTempoKeyframes`)
- Wire `_applyTempoAutomation()` → `setMasterTempoMap()`
- Add serialization + schema migration
- **Unit tests** for `resolveTempoKeyframes()`: empty, single, multi, BPM=0 guard, PPQ variation
- **Integration test**: add two tempo keyframes, verify `masterTempoMap` shape, verify playback clock reports correct BPM at points within each segment
- Debug hook: `window.__mvmntDebug.setTempoKeyframes([...])`

### Phase 2 — Timeline UI

- `TempoAutomationLane.tsx` with stepped curve rendering and keyframe diamonds
- `TempoLaneHeader.tsx` with enable/disable toggle
- Two-phase drag: draft state → commit on mouse-up
- BPM inline edit (double-click → number input)
- Snap-to-beat while dragging (Shift modifier)
- Integrate into `TimelinePanel` as a pinned lane when `tempoAutomation.enabled`
- BPM header input: read-only display when automation enabled

### Phase 3 — MIDI import integration

- `midiTempoMapToKeyframes()` utility
- Offer to populate tempo automation lane on MIDI import with embedded tempo events
- Conflict resolution UI (existing keyframes)

### Phase 4 — Polish

- Undo/redo for all tempo keyframe actions
- Copy/paste keyframe ranges
- Quantize to bar/beat positions
- Selective cache invalidation (only re-analyse segments affected by a keyframe change)
- Waveform "pending" indicator during post-drag re-analysis

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| BPM = 0 or negative in a keyframe | Clamp BPM to `[1, 999]` on input; guard in `resolveTempoKeyframes` |
| Keyframe at tick 0 overrides period before it | Keyframe at tick 0 replaces the `globalBpm` initial segment; document clearly in UI |
| Dragging keyframe before another keyframe | Enforce tick ordering during drag (don't allow crossing existing keyframes, or merge on release) |
| Very many keyframes → slow forward pass | Only triggered on commit (mouse-up), not during drag preview; O(n) is fast up to thousands of keyframes |
| MIDI import with linear-curve segments | `midiTempoMapToKeyframes` converts them to hold/step — visually equivalent for step sequences; linear ramps in MIDI become step approximations. Display a warning if linear curves are detected in the import. |
