# Tempo Automation — Planning Document

_April 2026_

## Context

MVMNT currently supports a static `globalBpm` (single value, default 120) and `masterTempoMap` (array of `TempoMapEntry` objects with step/linear interpolation). These are set manually via the BPM input in the timeline header or programmatically through `setGlobalBpm()` / `setMasterTempoMap()`. There is no way for users to draw, edit, or animate tempo changes over time within the UI — tempo is a "set it and forget it" value.

Meanwhile, a full **property automation system** already exists for scene element properties (numbers, colors, booleans). It uses tick-domain keyframes, easing-based interpolation, a dope-sheet + curve editor UI, and undo-able scene commands. This document explores how to extend or adapt that system (or build alongside it) for tempo automation.

## What "Tempo Automation" Means

Tempo automation = the ability to define a tempo curve that varies over the timeline, so BPM changes smoothly (or abruptly) at authored positions. Use cases:

- Ritardando / accelerando effects in visualizations synced to music with tempo changes
- Importing MIDI files that already contain embedded tempo maps and visualizing/editing them
- Creative tempo ramps for artistic effect

## Current Architecture Summary

### Tempo storage

| Field | Location | Domain |
|---|---|---|
| `globalBpm` | `timelineStore.timeline.globalBpm` | BPM (number) |
| `masterTempoMap` | `timelineStore.timeline.masterTempoMap` | `TempoMapEntry[]` — time in **seconds** |
| `beatsPerBar` | `timelineStore.timeline.beatsPerBar` | integer |

### TempoMapEntry (current)

```typescript
type TempoMapEntry = {
    time: number;      // seconds
    tempo?: number;     // microseconds per quarter note
    bpm?: number;       // convenience
    curve?: 'step' | 'linear';
};
```

### Consumption chain

1. `TimingManager` (singleton) ingests the map, normalizes into cumulative segments, provides `ticksToSeconds` / `secondsToTicks` / `beatsToSeconds` / `secondsToBeats`.
2. `TempoMapper` (immutable, batch) used by audio feature pipeline — supports linear ramp integration.
3. `PlaybackClock` reads instantaneous `secondsPerBeat` from the TimingManager to convert real-time deltas to tick deltas.
4. `tempo-utils.ts` provides standalone pure conversion functions.
5. Export pipeline snapshots the tempo config at export start for deterministic rendering.

### Existing automation system

- **Data**: `AutomationKeyframe { tick, value, easingId }` in `AutomationChannel` objects, stored in `sceneStore.automation`.
- **Evaluation**: `AutomationCurve` (binary search + easing + lerp), `AutomationEvaluator` (singleton with lazy cache).
- **Binding**: `KeyframeBinding` converts render context seconds → ticks → evaluate.
- **UI**: Dope-sheet rows (`AutomationLaneRow`), curve editor (`AutomationCurvePane`), easing picker, keyframe diamonds in properties panel.
- **Commands**: `enablePropertyAutomation`, `addKeyframe`, `removeKeyframe`, `moveKeyframe`, `batchUpdateKeyframes`, etc. — all undoable.

### Key tension: domain mismatch

The existing automation system stores keyframes in ticks and evaluates at ticks. But **tempo defines the tick→seconds mapping itself**. A tempo keyframe at tick T would need to define how many seconds tick T corresponds to — which is circular if tempo before T affects the conversion.

The current `TempoMapEntry` uses **seconds** as its domain, which avoids this circularity. The `TempoMapper` class already handles the calculus of integrating variable-tempo segments (including linear ramps) to convert between ticks and seconds.

---

## Design Options

### Option A: Seconds-Domain Tempo Lane (Dedicated System)

Keep tempo automation separate from the property automation system. Tempo keyframes live in seconds-domain (matching `TempoMapEntry`), stored in the timeline store (not the scene/automation store).

**Data model:**
```typescript
interface TempoKeyframe {
    timeSec: number;       // position in seconds
    bpm: number;           // tempo at this point
    curve: 'step' | 'linear';  // interpolation to next keyframe
}
// Stored as: timelineStore.timeline.tempoKeyframes: TempoKeyframe[]
```

**Pros:**
- No circular dependency — seconds domain avoids the "tempo defines tick mapping" recursion
- Directly maps to the existing `TempoMapEntry` structure
- Conceptually clean: tempo is a timeline-level concern, not a scene element property
- `TempoMapper` already handles linear ramp integration math
- MIDI tempo map import maps directly to this format

**Cons:**
- Requires a new dedicated UI lane (can't reuse automation dope-sheet directly since it's tick-based)
- Seconds-domain editing feels unfamiliar if the rest of the timeline is tick-based
- Two parallel "keyframe" systems to maintain
- Horizontal pixel mapping in the UI must convert seconds→ticks→pixels (or seconds→pixels directly) which differs from the tick→pixels used elsewhere

### Option B: Tick-Domain Tempo as a Special Automation Channel

Treat tempo as a special automation channel within the existing system. Keyframes at tick positions, BPM as the value.

**Data model:**
```typescript
// Uses existing AutomationKeyframe: { tick, value (bpm), easingId }
// Special channel ID: e.g. "__tempo__"
// Stored in sceneStore.automation.channels['__tempo__']
```

**Evaluation:** Instead of the normal automation evaluator flow, a dedicated resolver would:
1. Read the `__tempo__` channel keyframes (tick-domain)
2. Iteratively build a `TempoMapEntry[]` by walking keyframes and computing cumulative seconds (each segment's duration in seconds depends on the *previous* segment's tempo)
3. Feed the resulting map to `TimingManager`

**Pros:**
- Reuses the existing automation UI (dope-sheet, curve editor, easing picker, keyframe commands, undo)
- Consistent editing paradigm — everything is tick-based keyframes
- Less new code for the UI layer

**Cons:**
- The circular dependency must be carefully managed: changing a tempo keyframe invalidates all subsequent tick→seconds mappings, which could cascade
- Iterative seconds computation from tick-domain keyframes is an O(n) forward pass (not binary-searchable like the current seconds-domain map)
- Easing-based interpolation between tempo keyframes requires re-integrating the tempo curve to get accurate tick→seconds, which is analytically complex for arbitrary easing functions (only step and linear have closed-form integrals)
- MIDI tempo map import would need seconds→ticks conversion which depends on… the tempo map being built — bootstrapping problem
- The evaluation pathway is fundamentally different from property automation (tempo affects the *timeline itself*, not a render property), so calling it an "automation channel" may be misleading

### Option C: Beat-Domain Tempo Lane (Hybrid)

Use beats as the keyframe domain. Beats have a fixed relationship to ticks (`beat = tick / PPQ`) that doesn't depend on tempo, so there's no circularity. The tempo curve would define BPM as a function of beat position.

**Data model:**
```typescript
interface TempoKeyframe {
    beat: number;          // position in beats (= tick / PPQ)
    bpm: number;           // tempo at this point
    curve: 'step' | 'linear';
}
```

**Evaluation:** Walk the keyframe list, integrating each segment:
- Step segment from beat A to beat B at tempo T: `durationSec = (B - A) * (60 / T)`
- Linear ramp from beat A (tempo T1) to beat B (tempo T2): integrate `60 / lerp(T1, T2, t)` over `t ∈ [0, 1]`, scaled by `(B - A)`

Build cumulative `(beat, cumulativeSeconds)` segments → this is essentially what `TimingManager` already does internally.

**Pros:**
- No circularity — beats are proportional to ticks, independent of tempo
- Beat positions are musically intuitive ("tempo change at beat 33")
- Integration math is well-defined for step and linear (the `TempoMapper` already does this with its `integrateRampTicks` helper)
- MIDI tempo maps can be converted to this format during import (MIDI tempo events are at tick positions, which map directly to beats)
- Can reuse most of the automation UI with minor domain adaptation (beats instead of ticks, but pixel mapping is similar)

**Cons:**
- Beats are not directly user-visible in the current UI (the ruler shows bars/beats/ticks, but the automation system works in raw ticks)
- Need to decide: are beats just `tick / PPQ`? If so, this is effectively Option B with a scale factor — same iteration requirements
- Non-step/non-linear curves (e.g., easeInOutQuad tempo ramps) still require numerical integration for the seconds mapping

### Recommendation

**Option A (seconds-domain, dedicated lane)** is the most pragmatic starting point. Reasons:

1. It directly extends the existing `TempoMapEntry` infrastructure with zero circularity risk.
2. The `TempoMapper` already implements the hard math (linear ramp integration via `integrateRampTicks` / `invertRampTicks`).
3. Tempo is fundamentally different from element properties — it defines the timeline itself. Keeping it in a dedicated lane with purpose-built UI avoids impedance mismatches with the property automation system.
4. MIDI files with embedded tempo maps "just work" — the imported `TempoMapEntry[]` can populate the lane directly.
5. Future migration toward beat-domain (Option C) is straightforward if desired — it's a domain transform on the same fundamental structure.

---

## Proposed Architecture (Option A)

### 1. Data Model

```typescript
// src/core/timing/types.ts — extend existing
interface TempoKeyframe {
    timeSec: number;
    bpm: number;
    curve: 'step' | 'linear';
    // Future: 'bezier' with control points
}

// Stored in timeline store
interface TimelineState {
    // existing...
    globalBpm: number;
    masterTempoMap?: TempoMapEntry[];

    // new
    tempoAutomation: {
        enabled: boolean;
        keyframes: TempoKeyframe[];  // sorted by timeSec
    };
}
```

When `tempoAutomation.enabled` is true, the system derives `masterTempoMap` from the keyframes (which is essentially a 1:1 mapping since the shape matches `TempoMapEntry`). The `globalBpm` becomes the fallback for regions before the first keyframe.

### 2. State Actions

```typescript
// New timeline store actions
enableTempoAutomation(): void;          // Enable, seed with current globalBpm at t=0
disableTempoAutomation(): void;         // Disable, revert to static globalBpm
addTempoKeyframe(kf: TempoKeyframe): void;
removeTempoKeyframe(timeSec: number): void;
moveTempoKeyframe(fromSec: number, toSec: number): void;
updateTempoKeyframe(timeSec: number, patch: Partial<TempoKeyframe>): void;
batchSetTempoKeyframes(kfs: TempoKeyframe[]): void;  // For MIDI import
```

All actions rebuild/update `masterTempoMap` and propagate to `TimingManager`. Consider undo support — tempo automation could be added to the scene command system or handled via timeline-level undo.

### 3. Render Loop Integration

The render loop already syncs `masterTempoMap` to `TimingManager` each frame:

```typescript
// useRenderLoop.ts — existing pattern
if (tempoMapChanged) {
    sharedTimingManager.setTempoMap(state.timeline.masterTempoMap);
}
```

No change needed here — the automation keyframes feed into `masterTempoMap`, which flows through the existing pipeline.

### 4. PlaybackClock Impact

`PlaybackClock` already reads instantaneous `secondsPerBeat` from `TimingManager` at the current position. With a tempo map active, it automatically picks up varying tempo. **No changes needed.**

### 5. UI: Tempo Automation Lane

A new dedicated lane in the timeline panel, visually similar to the existing automation curve pane but operating in seconds-domain.

**Components to build:**

| Component | Responsibility |
|---|---|
| `TempoAutomationLane.tsx` | SVG lane showing tempo curve, keyframe points, value axis (BPM) |
| `TempoLaneLabels.tsx` | Left-column label: "TEMPO", BPM range display, enable/disable toggle |
| `TempoKeyframeEditor.tsx` | Inline editing of BPM value on keyframe click/double-click |

**Pixel mapping:** The timeline ruler maps ticks→pixels. For the tempo lane, we need seconds→pixels. Since `TimingManager` provides `secondsToTicks`, we can convert keyframe positions: `pixelX = (secondsToTicks(kf.timeSec) - viewStartTick) * pixelsPerTick`. This keeps the tempo lane horizontally aligned with the rest of the timeline.

**Interactions:**
- Double-click to add keyframe at cursor position (convert pixel→tick→seconds)
- Drag keyframe horizontally (seconds) and vertically (BPM)
- Right-click context menu: delete keyframe, change curve type (step/linear)
- Scroll-zoom on BPM axis (vertical zoom for the tempo lane)
- Optional: draw mode for painting tempo curves

**Value axis:**
- Vertical axis shows BPM range (e.g., 40–240 BPM, auto-fit to keyframe range with padding)
- Curve visualization: step/linear segments drawn between keyframes

### 6. MIDI Tempo Map Import

Current behavior: `midi-ingest.ts` extracts tempo events into `TempoMapEntry[]` per track. The master tempo map can be set from these.

Extension: When importing a MIDI file with tempo changes, offer to populate the tempo automation lane:

```typescript
function midiTempoMapToKeyframes(map: TempoMapEntry[]): TempoKeyframe[] {
    return map.map(entry => ({
        timeSec: entry.time,
        bpm: entry.bpm ?? (entry.tempo ? 60_000_000 / entry.tempo : 120),
        curve: entry.curve ?? 'step',
    }));
}
```

### 7. Export Pipeline

`ExportTimingSnapshot` already captures the tempo map at export start. When tempo automation is enabled, it captures the derived `masterTempoMap` — **no changes needed** beyond ensuring the automation state is resolved before snapshot.

### 8. Serialization

Add `tempoAutomation` to the scene/project persistence envelope. Bump schema version. Migration for older scenes: `tempoAutomation: { enabled: false, keyframes: [] }`.

---

## Phased Implementation

### Phase 1: Core Data + Static Map Generation

- Add `TempoKeyframe` type
- Add `tempoAutomation` to timeline store with actions
- Wire keyframes → `masterTempoMap` derivation
- Add `batchSetTempoKeyframes` for programmatic/test use
- Unit tests: keyframe CRUD, map derivation, edge cases (empty, single, overlapping)
- Debug tools: `window.__mvmntDebug.setTempoKeyframes([...])`

**Validates:** Tempo changes work correctly with varying keyframes, playback clock adapts, note queries return correct results.

### Phase 2: Basic UI Lane

- `TempoAutomationLane` component with step/linear curve rendering
- Keyframe points (add, drag, delete)
- BPM value axis with auto-scaling
- Toggle in timeline header to enable/disable tempo automation
- Integration into `TimelinePanel` (new section above or below existing lanes)

**Validates:** Users can visually author tempo changes and hear the effect during playback.

### Phase 3: MIDI Import Integration

- Detect tempo maps in imported MIDI files
- Offer to populate tempo automation lane
- Handle conflicts (existing keyframes)

### Phase 4: Polish + Advanced Features

- Undo/redo for tempo keyframe edits (scene command integration or timeline-level undo stack)
- Snap-to-beat for keyframe placement
- BPM value presets / tap tempo
- Copy/paste keyframe ranges
- Quantize tempo keyframes to musical positions
- Future: bezier/eased tempo curves (requires numerical integration in `TempoMapper`)

---

## Risks and Open Questions

### Circularity in seconds-domain editing

When a user drags a tempo keyframe horizontally, they're moving its seconds-domain position. But changing a keyframe's position (or value) redefines the tempo map, which changes the seconds→ticks mapping, which changes where *other* keyframes appear on the pixel timeline. This can feel disorienting during drag operations.

**Mitigation:** During a drag, freeze the tempo map to the pre-drag state for pixel mapping. Only recompute on mouse-up. Alternatively, snap keyframes to beat/bar positions (which are tempo-independent) and display in seconds as a secondary label.

### Performance with many tempo keyframes

The `TempoMapper` uses O(log n) binary search for lookups, which scales well. However, the `PlaybackClock` calls `secondsPerBeat` every frame — if the tempo map is very dense, the lookup is still fast but the segment normalization step (on map change) is O(n). This should be fine for practical use (hundreds of keyframes max).

### Meter changes

Tempo automation and meter (time signature) automation are related but distinct. This plan covers tempo only. Meter automation could follow a similar pattern later (dedicated lane, bar-aligned keyframes).

### Plugin API surface

Plugins currently access tempo via `getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead])`. The tempo automation data doesn't need to be exposed to plugins directly — they already see the *effect* of tempo changes through the existing `ticksToSeconds` / `secondsToTicks` conversions. However, a future `PLUGIN_CAPABILITIES.tempoRead` could expose the raw tempo curve if plugins need it.

### Interaction with static BPM input

When tempo automation is enabled, the BPM input in the timeline header should either:
- Show the current (interpolated) BPM at the playhead position (read-only)
- Or be hidden/disabled with a note that tempo is automated

Editing the BPM input while automation is enabled could either add a keyframe at the current position or be blocked.
