# Time Domain Architecture

Authoritative domain: **ticks** (integer). Seconds are a _derived_ presentation & scheduling view
computed through the shared `TimingManager` using the tempo map + global BPM fallback.

## Canonical Concepts

| Concept                       | Stored Field(s)                                        | Notes                                                               |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Playhead                      | `timeline.currentTick`                                 | Always integer tick.                                                |
| Loop Range                    | `transport.loopStartTick`, `transport.loopEndTick`     | Optional; inclusive start, exclusive end semantics for comparisons. |
| Timeline View Window          | `timelineView.startTick`, `timelineView.endTick`       | UI pan/zoom.                                                        |
| Playback Range (Scene Bounds) | `playbackRange.startTick`, `playbackRange.endTick`     | Optional explicit scene trimming.                                   |
| Track Offsets                 | `tracks[id].offsetTicks`                               | Applied additively to note start/end ticks for global position.     |
| Notes                         | `note.startTick`, `note.endTick`, `note.durationTicks` | Ingest normalizes to canonical PPQ.                                 |

No seconds (`currentTimeSec`, `loopStartSec`, `offsetSec`, etc.) or beats fields are persisted in state. Beats/seconds are computed on demand.

## Conversion Flow

```
             +--------------+            +------------------+
     tick -> | TimingManager| -> beats ->| Tempo Segments   | -> seconds
             +--------------+            +------------------+
```

Fast paths:

-   Fixed tempo (no map): seconds = ticks / TPQ \* (60 / BPM)
-   Tempo map: piecewise integration of beats across precomputed cumulative segments.

Selectors & helpers centralize conversions; UI/components never perform ad‑hoc math.

## Public Selector Surface (Seconds View)

(Implemented in `state/selectors/timeDerived.ts` – examples shown)

-   `useCurrentTick()` – canonical playhead.
-   `useCurrentSeconds()` – derived: `ticksToSeconds(currentTick)`.
-   `selectLoopRangeSeconds(state)` – returns `{ startSec, endSec }` or `undefined`.
-   `selectTrackOffsetSeconds(state, trackId)` – converts `offsetTicks`.
-   `selectPlaybackRangeSeconds(state)` – scene bounds in seconds.

These are memoized against `(tick, tempoVersion)` to avoid churn.

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

-   Ticks stored as 32-bit safe integers (< 2^53 to remain precise in JS). With PPQ=960, 2^53 ticks ≈ 9.5e12 ticks ≈ >300,000 years at 120 BPM – safe.
-   Avoid accumulating seconds directly for playhead; always derive from beats/ticks.
-   Fractional accumulation: clock retains `fractionalTicks` remainder to ensure long‑run drift < 1 tick.

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

-   `setCurrentTimeSec`, `seek(seconds)`, `scrub(seconds)`
-   `setLoopRange(seconds)`, `loopStartSec`, `loopEndSec`
-   `setTimelineView(seconds)`
-   `setTrackOffset(seconds)` / `offsetSec`, `offsetBeats`
-   `currentTimeSec` playhead mirror

## Operational Notes

-   Legacy tests that depended on seconds-based helpers should be updated to use the tick utilities described above.
-   Debug tooling exposes `window.__mvmntDebug.setCurrentTick(tick)` for programmatic seeking; prefer it over any deprecated second-based helpers.

## Future Extensions

-   Meter change map (bars/beat numbering in grid)
-   Per-track tempo envelopes creating layered tick->seconds contexts
-   Swing/humanization as fractional tick offsets prior to render

## Quick Usage Examples

```ts
import { useCurrentTick } from '@/state/selectors/timeDerived';
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

---

Last reviewed: 2025-02-14.
