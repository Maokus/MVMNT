# Time Domain Architecture

Authoritative domain: **ticks** (integer). Seconds are a _derived_ presentation & scheduling view
computed through the shared `TimingManager` using the tempo map + global BPM fallback.

## Canonical Concepts

| Concept                       | Stored Field(s)                                             | Notes                                                               |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Playhead                      | `timeline.currentTick`                                      | Always integer tick.                                                |
| Loop Range                    | `transport.loopStartTick`, `transport.loopEndTick`          | Optional; inclusive start, exclusive end semantics for comparisons. |
| Timeline View Window          | `timelineView.startTick`, `timelineView.endTick`            | UI pan/zoom.                                                        |
| Playback Range (Scene Bounds) | `playbackRange.startTick`, `playbackRange.endTick`          | Optional explicit scene trimming.                                   |
| MIDI track offsets            | `tracks[id].offsetTicks`                                    | Applied additively to note start/end ticks for global position.     |
| Notes                         | `note.startTick`, `note.endTick`, `note.durationTicks`      | Ingest normalizes to canonical PPQ.                                 |
| Audio clip placement          | `audioClip.offsetTicks`                                     | Musical start of source time zero.                                  |
| Audio source and clip trim    | `durationSeconds`, `sourceStartSeconds`, `sourceEndSeconds` | Immutable media-time offsets; never tempo-scaled.                   |

No seconds (`currentTimeSec`, `loopStartSec`, `offsetSec`, etc.) or beats fields are persisted in state. Beats/seconds are computed on demand.

Audio tracks use clips exclusively. Track-level `offsetTicks`, `regionStartTick`,
`regionEndTick`, and `audioSourceId` are not part of the runtime or schema V10 model.
Audio clips keep musical placement in `offsetTicks`, but trims use immutable source time
(`sourceStartSeconds`/`sourceEndSeconds`). Source cache entries likewise store duration in
seconds and samples, not tempo-dependent `durationTicks`.

Schema V10 scenes are packaged `.mvt` ZIP files. Export no longer produces inline JSON.
Import still migrates older scene schemas, including inline assets and tick-based audio trims,
before V10 validation and hydration.

## Conversion Flow

```
             +--------------+            +------------------+
     tick -> | TimingManager| -> beats ->| Tempo Segments   | -> seconds
             +--------------+            +------------------+
```

Fast paths:

- Fixed tempo (no map): seconds = ticks / TPQ \* (60 / BPM)
- Tempo map: piecewise integration of beats across precomputed cumulative segments.

Selectors & helpers centralize conversions; UI/components never perform ad‑hoc math.

## Tempo Mapper Service

- `TempoMapperService` wraps `TimingManager` integration utilities and exposes batch APIs used by the
  hybrid audio cache adapter.
- Mapper instances are stateless. They memoize tempo integrals per segment to keep conversions O(1)
  during steady sections.
- Audio feature selectors request tick-to-seconds projections through the mapper so real-time caches
  stay authoritative while UI code continues to operate in ticks.

## Tempo Changes

Changing BPM or tempo map:

1. Mutate `timeline.globalBpm` or set new tempo map on `TimingManager`.
2. Increment an internal `tempoVersion` counter in `TimingManager` (hash) used by memo caches.
3. No mutation to any stored tick field required; musical positions remain stable.
4. All seconds-based selectors recompute because the hash changes.

## Playback Clock

`PlaybackClock` advances ticks per frame:

```
ΔrealSeconds -> segment SPB (seconds per beat) -> beats advanced -> ticks advanced (rounding strategy: accumulate fractional ticks separately to avoid drift) -> new currentTick
```

Looping clamps the next tick into `[loopStartTick, loopEndTick)`.

## Integer & Precision Strategy

- Ticks stored as 32-bit safe integers (< 2^53 to remain precise in JS). With PPQ=960, 2^53 ticks ≈ 9.5e12 ticks ≈ >300,000 years at 120 BPM – safe.
- Avoid accumulating seconds directly for playhead; always derive from beats/ticks.
- Fractional accumulation: clock retains `fractionalTicks` remainder to ensure long‑run drift < 1 tick.

## Ingestion Normalization

MIDI file PPQ (TPQ) scaled to canonical PPQ (currently 960) immediately:

```
scale = CANONICAL_PPQ / sourcePPQ
startTick = round(fileTick * scale)
```

Durations & end ticks recomputed post-scale.

## Grid / Ruler Generation

Given a visible window `[startTick, endTick]`:

1. Convert to beats once.
2. Iterate subdivisions (bars, beats) producing tick positions.
3. Convert to pixels via `pixelsPerTick` (UI scale). Only convert ticks->seconds if an animation system still expects seconds; otherwise stay in ticks.

## Export & Rendering

Export pipeline takes a deterministic snapshot of tempo segments before enumerating frames (optional toggle). Each frame:

```
frameSeconds -> ticks = secondsToTicks(frameSeconds, snapshot)
```

Events are gathered by tick window queries ensuring consistency independent of later tempo edits.

## Removed Legacy APIs

Removed functions / fields (BREAKING):

- `setCurrentTimeSec`, `seek(seconds)`, `scrub(seconds)`
- `setLoopRange(seconds)`, `loopStartSec`, `loopEndSec`
- `setTimelineView(seconds)`
- `setTrackOffset(seconds)` / `offsetSec`, `offsetBeats`
- `currentTimeSec` playhead mirror

## Operational Notes

- Legacy tests that depended on seconds-based helpers should be updated to use the tick utilities described above.
- Debug tooling exposes `window.__mvmntDebug.setCurrentTick(tick)` for programmatic seeking; prefer it over any deprecated second-based helpers.

## Future Extensions

- Meter change map (bars/beat numbering in grid)
- Per-track tempo envelopes creating layered tick->seconds contexts
- Swing/humanization as fractional tick offsets prior to render

## Quick Usage Examples

```ts
import { useCurrentTick } from '@state/selectors/timeDerived';
const tick = useCurrentTick();
const seconds = useCurrentSeconds();
```

Programmatic seek:

```ts
useTimelineStore.getState().seekTick(960 * 8); // bar 3 at 4/4 with PPQ=960
```

Loop setup:

```ts
useTimelineStore.getState().setLoopRangeTicks(960 * 4, 960 * 8); // bars 2-3
```

Deriving note absolute seconds (e.g., in a component):

```ts
const tm = sharedTimingManager; // or getSharedTimingManager()
const startSec = tm.ticksToSeconds(note.startTick + track.offsetTicks);
```

## Accessing Time in Plugin Elements

SDK 2 plugin callbacks receive a `RenderTime` plus the declared `timing` capability:

```ts
render(_props, _state, time, context) {
    const beats = context.timing!.secondsToBeats(time.seconds);
    const ticks = context.timing!.secondsToTicks(time.seconds);
    if (!beats.ok || !ticks.ok) return [];
    // use beats.value and ticks.value
    return [];
}
```

Declare `timing.conversion` in the element and manifest capability lists. The timing facet reflects
the current tempo map including automation keyframes on `globalBpm`.

## Tempo Automation

BPM is automatable via the keyframe system (schema version 5+). When `globalBpm` has automation channels, `TimingManager` recomputes tempo segments on each evaluator tick. All tick↔second conversions remain accurate — no additional handling is required in element or plugin code. The `tempoVersion` counter on `TimingManager` invalidates memoized selectors automatically.

Plugin elements that sample audio features should use `targetTime` (seconds) directly — the audio cache system handles tempo-aware alignment internally.

### Audio clips

Audio clips bridge the two domains: their placement is stored in ticks, but an
audio file and its trim points are stored in source seconds. A clip end tick is
derived as `secondsToTicks(ticksToSeconds(offsetTicks) + sourceEndSeconds)`.
This means a fixed-length recording occupies a different number of beats at
different tempos (and may cross a tempo step), while preview and export always
play the same source duration and samples.

---
