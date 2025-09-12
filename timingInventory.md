## Timing domains inventory (musical beats vs real seconds)

Musical (beats as canonical or convertible):

-   Note canonical positions: `NoteRaw.startBeat`, `endBeat`, `durationBeats` (new emphasis).
-   Track offsets: `TimelineTrack.offsetBeats` (source of truth; `offsetSec` derived).
-   Tempo mapping & conversion: tempo-utils.ts (beats<->seconds via tempo map), timing-manager.ts (`_beatsToSeconds`, `_secondsToBeats`).
-   MIDI ingestion: midi-ingest.ts (derives beats from ticks).
-   MIDI manager: midi-manager.ts converts stored beats to seconds on demand for windows, scheduling.
-   Selectors: timing.ts (`secondsToBeatsSelector`, `beatsToSecondsSelector`, bars conversions).
-   Hooks: `useBarNudge`, `useTrackBarNudge` operate in beats then convert back to seconds.
-   Quantization: `timelineStore.play()` and `seek()` snap using `_secondsToBarsLocal` (beats domain).

Real time (seconds as transport/render domain):

-   Transport playhead: `timeline.timeline.currentTimeSec`.
-   Timeline view & playback range: `timelineView.startSec/endSec`, `playbackRange.startSec/endSec`, loop `loopStartSec/loopEndSec`.
-   Region bounds: `TimelineTrack.regionStartSec / regionEndSec`.
-   Rendering & scheduling: compile.ts uses `note.startTime/endTime` (derived from beats).
-   Visualizer core playback clock: visualizer-core.ts (performance.now based).
-   Export timing: simulated-clock.ts.
-   UI ruler scaling: derives tick marks using conversions but renders in seconds width while labeling bars/beats.

Hybrid (stores both, keeps beats authoritative):

-   `NoteRaw.startTime/endTime/duration` now derived; updated whenever BPM or tempo map changes.
-   `TimelineTrack.offsetSec` mirrors `offsetBeats`.

Tempo & mapping data:

-   `timeline.masterTempoMap` (seconds-based segment boundaries, but drives beats<->seconds math).
-   `timeline.globalBpm` fallback when no map.
-   `TimingManager.tempoMap` mirrors master or element-specific map.

Where conversions happen explicitly:

-   `timelineStore` helper functions `_secondsToBeatsLocal`, `_beatsToSecondsLocal`, `_secondsToBarsLocal`, `_barsToSecondsLocal`.
-   Recalculation hooks inside `setGlobalBpm`, `setMasterTempoMap`, and `ingestMidiToCache`.
-   `midi-manager` window and event creation functions.

Still seconds-only (acceptable transport/UI layer):

-   Playback scrubbing & loop logic operate in seconds (`scrub`, `seek`, `setCurrentTimeSec`).
-   Scene range auto-adjust and bounds calculations (`computeContentStartSec/EndSec`) use seconds (rely on up-to-date derived note seconds).

## Behavior after fix

-   Upload MIDI → beats captured from ticks → seconds derived with current tempo.
-   Change BPM (no tempo map) → note seconds recomputed; total track real-time length scales (test validates 2s → 4s when 120→60 BPM while beats stay 4).
-   Change tempo map → note seconds recomputed segment-wise.

## Potential follow-ups (optional)

-   Precompute beats for any events lacking ticks (if such files appear) by inferring from initial seconds / fallback tempo to preserve scaling.
-   Expose a selector returning canonical beat duration per track for UI summaries.
-   Migrate remaining approximation code in timelineSelectors.ts (simple fallback path) to reuse shared converters for consistency.
-   Add inverse operations for editing note times in beats directly.

## Requirements coverage

1. Fix timing to make tempo changes affect real-time length, not beat length: Done (code + passing test).
2. Provide comprehensive list of timing usage and domains: Done (inventory above).

Let me know if you’d like the optional follow-ups implemented.
