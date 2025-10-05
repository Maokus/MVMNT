## 1. Goal & Scope

Add a per‑MIDI‑track toggleable synth audition (muted by default) that plays that track’s notes through a lightweight Web Audio–based polyphonic synth synchronized with the existing transport. It must: - Respect transport play/stop, looping, and tempo (including tempo map changes if supported). - Be low CPU, garbage‑light, and not interfere with existing rendering/export systems. - Persist its on/off state with documents. - Require a single user gesture to unlock AudioContext (first activation or global transport start). - Be future‑extensible (envelopes, instrument presets, velocity curves).

## Out of scope (for now): multi‑instrument selection UI, soundfonts, pedal CCs, pitch bend, advanced effects.

## 2. Data Model Changes

Add properties to `TimelineTrack` (only when `type === 'midi'`):

```
interface TimelineTrack {
  // ...existing
  auditionEnabled?: boolean; // user toggled synth playback
  auditionVolume?: number;   // linear 0–1 (default 0.8)
}
```

Defaults: `auditionEnabled = false`, `auditionVolume = 0.8`.

Persistence:

-   Include these fields in: `timelineStore` serialization snapshots, document export/import (document-gateway.ts, export.ts, import.ts).
-   Backward compatibility: default them when undefined.

---

## 3. Synth Architecture (Web Audio)

Create a small “poly manager” per active auditioned track rather than one global poly pool to simplify per‑track volume/gain.

File: `src/state/audio/track-synth.ts` (new folder `audio/` if not present; or reuse `audio-engine.ts` pattern).

Components:

1. Shared `AudioContext` singleton (lazy, created on first need or on global transport start).
2. `TrackSynth` class:
    - Constructor: `(ctx, trackId, options)`; creates a `GainNode` (track bus) feeding a global master gain (optional).
    - Methods:
        - `scheduleNoteOn(note: number, velocity: number, startTime: number, durationSeconds: number)`
        - `flushActive()` (on stop / track disable).
        - `setVolume(v: number)`
        - `dispose()`
    - Internals:
        - Simple oscillator selection (triangle or square + lowpass optional).
        - Per note: create an `OscillatorNode` + `GainNode` envelope:
            - Attack 5–10ms, decay none, sustain ~0.8, release ~80–120ms.
            - Frequency: `440 * 2^((note-69)/12)`.
        - Optionally add mild lowpass for smoother top end (static `BiquadFilterNode`).
3. Voice limiting: Cap simultaneous voices (e.g. 24). If exceeded: steal oldest release or lowest velocity.
4. Velocity mapping: `gain = (velocity / 127) ^ 1.2 * 0.9`.
5. Track volume: multiply velocity gain by track `auditionVolume`.

No offline rendering / no lookahead caching—real‑time scheduling only.

---

## 4. Playback / Scheduling Integration

Leverage existing transport & tempo mapping:

Sources:

-   `timelineStore.midiCache[trackKey].notesRaw` provides ticks & durations.
-   Need conversion: ticks → seconds given transport position & tempo map.

Check for existing logic:

-   If a function already converts ticks to seconds for rendering/export, reuse (else create helper `ticksToSeconds(ticks, ticksPerQuarter, tempoMap)`).
    -   Tempo map entries likely include microseconds per quarter or BPM changes with tick offsets.
    -   Precompute cumulative times for each tempo segment for fast mapping.

Scheduling strategy:

1. On transport play:
    - For each track with `auditionEnabled`, instantiate (or reuse) a `TrackSynth`.
2. Implement a scheduler loop (e.g. in `transport-coordinator.ts` or a new `midi-audition-scheduler.ts`):
    - Runs every ~50ms via `requestAnimationFrame` or `setInterval` (keep drift acceptable).
    - Look ahead `LOOKAHEAD_WINDOW = 0.25s`.
    - For current transport time (seconds) → compute current tick position. (Reverse mapping: given elapsed seconds + tempo map).
    - Retrieve notes starting within [nowTick, nowTick + lookaheadTicks].
    - For each unscheduled note:
        - Compute absolute Web Audio time = `audioCtx.currentTime + (noteStartSeconds - transportNowSeconds)`.
        - DurationSeconds = noteDurationTicks → seconds (clamp min 30ms).
        - Call `TrackSynth.scheduleNoteOn`.
        - Mark note as scheduled (cache scheduled note IDs/ticks in a per-play session map).
3. On seek / loop restart:
    - Clear scheduled map & active voices (`flushActive`).
    - Rebuild scheduling window from new transport position.
4. On stop:
    - Release all voices (set release quick).
5. On track toggle off:
    - Immediately stop scheduling & flush.
6. On track volume change:
    - Adjust its `TrackSynth.setVolume`.

Edge cases:

-   Looping: when loop boundary crosses, unschedule any notes beyond loop end; at loop restart treat as fresh play.
-   Very short notes (< 10ms) clamp to audible 20ms.
-   Sustain overlapping: simply let each note voice run; no pedal merging.

---

## 5. UI Changes

Where: “Track info” panel for each MIDI track (where mute/enable UI already exists).

Add:

-   A small headphone icon toggle or “Audition” speaker icon (tooltip: “Enable synth preview of this MIDI track”).
-   A slim volume slider (hidden until hover or inside a popover).
-   Visual state:
    -   Disabled (default): greyed icon.
    -   Enabled: colored (e.g. `text-indigo-300`).
-   Accessibility: `aria-pressed` on button, label for slider.

Implementation:

-   Extend track component props to include `auditionEnabled` & `auditionVolume`.
-   Dispatch actions: `toggleTrackAudition(trackId)` and `setTrackAuditionVolume(trackId, v)`.

Debounce volume updates (150ms) to avoid thrashing the AudioParam.

---

## 6. State & Actions (timelineStore.ts)

Add:

```
toggleTrackAudition: (id: string) => void
setTrackAuditionVolume: (id: string, vol: number) => void
```

Reducers:

-   Ensure immutability & snapshot validity (undo system: add action keys to snapshot inclusion list if necessary).
-   When disabling: emit event to audition manager to dispose synth (pub/sub or direct call if module imported).

Persistence:

-   Include new properties in export/import & undo snapshot comparisons (update lists in snapshot-undo.ts if they inspect track shallow identity).
-   Default injection in import path when absent.

---

## 7. Audition Manager Module

File: `src/audio/midi-audition-manager.ts` (central orchestrator).

Responsibilities:

-   Hold map: `trackId -> TrackSynth`.
-   Expose API:
    -   `onTransportPlay()`
    -   `onTransportStop()`
    -   `onTransportSeek(newTick)`
    -   `onLoopBoundary(newTick)`
    -   `onTrackAuditionToggled(trackId, enabled)`
    -   `onTrackVolumeChanged(trackId, vol)`
-   Internal scheduler tick as described.
-   Subscribes to timeline store via a lightweight subscription (or integrated into existing transport coordinator).
-   Guard: if no tracks audition-enabled, pause scheduler loop to save CPU.

Activation & AudioContext unlocking:

-   First call that requires sound triggers `resume()` inside a user gesture (wrap button handler to call `ensureAudioContextUnlocked()`).

---

## 8. Tick / Time Conversion Utilities

File: `src/audio/tempo-time-utils.ts` (if not already present):
Functions:

-   `ticksToSeconds(ticks, tempoMap, tpq)`
-   `secondsToTicks(seconds, tempoMap, tpq)`
    Precompute:
-   Build an array of segments: `{ startTick, startSec, bpm }`.
-   Binary search for segment on queries.

Reuse existing tempo code if present—if duplication exists, refactor into shared utility.

---

## 9. Action Flow Example

1. User clicks audition icon:
    - Store: `toggleTrackAudition`.
    - UI triggers `auditionManager.onTrackAuditionToggled`.
    - Manager ensures synth exists if transport playing OR waits until play to allocate.
2. User presses Play:
    - Transport coordinator notifies auditionManager (add hook at existing play event).
    - Manager starts scheduler loop & begins scheduling notes within lookahead.
3. User seeks:
    - Transport coordinator notifies; manager clears scheduling state & resumes from new position.
4. Loop restarts:
    - Same as seek.
5. User stops:
    - Manager flushes voices, stops scheduler.

---

## 10. Performance Considerations

-   Voice cap prevents explosion on dense chords.
-   Scheduler window small (0.25s) → low latency; adjustable constant for experimentation.
-   Use reuse patterns:
    -   Optionally pool `GainNode`+`OscillatorNode` pairs (but premature; start simple).
-   Avoid per-frame allocations: reuse arrays during scan of notes for lookahead.
-   Only compute conversions for notes in lookahead; pre-store note start/end ticks sorted.

Potential optimization later:

-   Precompute `tick->sec` map at segment boundaries.
-   Batch scheduling by grouping simultaneous start ticks.

---

## 11. Edge Cases & Handling

| Case                                                        | Handling                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Tempo changes mid-note                                      | Duration computed using tempo segments (integrate across segments if note spans one—approx ok if short).         |
| Very long sustain notes                                     | Just schedule full duration; release early on stop.                                                              |
| Rapid enable/disable toggle                                 | Debounce disable flush (e.g. immediate flush OK; re-enable creates new voices).                                  |
| Track removed while auditioning                             | Manager disposes synth automatically.                                                                            |
| Document load with auditionEnabled true before user gesture | Icon shows enabled but audio silent until first play (call unlock on play action).                               |
| Loop where start is inside sustained note                   | Optional: do not retrigger note if loop cuts into middle (simpler: only trigger notes whose start >= loopStart). |

---

## 12. Testing Plan

Unit Tests:

-   `tempo-time-utils` conversions with multi-tempo map.
-   Scheduler picks correct notes within lookahead window (mock context time).
-   Voice cap eviction strategy (add > limit quickly).
-   Volume scaling math & velocity mapping.

Integration (Vitest + jsdom / mocked AudioContext):

-   Mock `AudioContext` & assert `osc.start(...)` called with correct times relative to `currentTime`.
-   Toggle audition mid-play: previously scheduled future notes for disabled track not played (simulate by checking absence of scheduling calls after toggle).

Manual QA Checklist:

-   Enable audition while stopped; press play — plays.
-   Seek while playing; previously sounding notes stop if before new position.
-   Looping works: notes retrigger at loop start only if they start after loopStart.
-   Multiple tracks audition work concurrently.
-   Performance remains smooth (monitor devtools memory).

---

## 13. Accessibility & UX

-   Tooltip & `aria-label`: “Enable synth preview (audition)”.
-   Icon state contrast (WCAG).
-   Volume slider keyboard focusable; show numeric value (e.g. 80%).
-   Prevent accidental loudness: cap master at 0.9, starting volume 0.8.

---

## 14. Security & Privacy

-   No external network/audio assets; pure synthesis.
-   Respect browser autoplay policies via explicit user gesture unlock.

---

## 15. Step-by-Step Implementation Order (Concrete)

1. Data model: add fields to `TimelineTrack` + defaults.
2. Store actions: `toggleTrackAudition`, `setTrackAuditionVolume`.
3. Persistence updates (export/import, undo snapshot lists).
4. Create `tempo-time-utils.ts`.
5. Create `track-synth.ts` (basic voice scheduling).
6. Create `midi-audition-manager.ts` with scheduler loop & API.
7. Integrate manager with transport lifecycle (hooks in `transport-coordinator` or similar existing event source).
8. Add UI button + volume control to track info component.
9. Wire UI to store actions and manager notifications.
10. Implement AudioContext unlock logic.
11. Add unit tests for utilities & manager (mocked audio).
12. Manual QA pass & adjust voice cap / envelope constants.
13. Update README.md or ARCHITECTURE.md with a short “MIDI Audition Synth” section.

---

## 16. Minimal API Surface (Internal Contracts)

TrackSynth:

-   Inputs: note number (0–127), velocity (0–127), start time (AudioContext time), duration (seconds).
-   Errors: Silently ignore if startTime < currentTime - small epsilon.

AuditionManager:

-   Needs read-only access to: transport state (playing, currentTick, loop bounds), midiCache, ticksPerQuarter, tempoMap.
-   Provides: side-effect playback only.

---

## 17. Future Enhancements (Later)

-   Instrument selector (waveform presets: sine/triangle/FM/pianoish).
-   ADSR customization UI.
-   Sustain pedal / CC handling.
-   Basic reverb / delay send bus.
-   Per-track pan.
-   Render-to-audio export alignment (optional).

---

## 18. Risk Mitigation

| Risk                                        | Mitigation                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Drift between transport visual time & audio | Use AudioContext as authority; compute scheduling based on real currentTime each tick. |
| Heavy scheduling on dense MIDI              | Voice cap + short lookahead window.                                                    |
| Tempo map mismatch                          | Centralize conversion utilities; unit test.                                            |
| Undo/redo not capturing audition toggle     | Ensure action keys participate in snapshot diff logic.                                 |

---

## 19. Acceptance Criteria

-   Toggling audition on a MIDI track produces audible tones aligned within ≤20ms of note starts at 120 BPM.
-   Loop playback retriggers notes at loop start; no dangling voices after stop.
-   Volume slider adjusts perceived loudness immediately.
-   State persists after save/export/import.
-   No console errors or unbounded memory growth after 5 minutes of loop playback.

---

If you’d like, I can now scaffold the files (`track-synth`, `audition-manager`, store updates) in a follow-up step. Just let me know and I’ll start implementing. Would you like me to proceed with the initial code changes?
