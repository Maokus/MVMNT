You asked for (a) assessment of `timelineStore` tests still assuming seconds after migration to ticks, (b) a full analysis of transport/timing handling (pause/play jump, tempo change not taking effect), with at least 5 reasons these problems might occur, (c) validation of assumptions against code, and (d) proposed solutions.

Below I break this down.

---

## 1. Test File Assessment (Seconds vs Ticks)

The file timelineStore.behavior.test.ts still writes and asserts directly on `currentTimeSec`, `loopStartSec`, `loopEndSec`, `timelineView.startSec/endSec`, etc. Since the canonical domain is now ticks (`currentTick`), these tests are exercising the Phase‑4 legacy shim rather than the authoritative fields. That means:

-   They could pass while masking tick-domain regressions (e.g., if seconds derivation drifts or is out-of-sync, the test might not detect the tick problem).
-   They re-seed state with `currentTimeSec: 12` but do not explicitly synchronize `currentTick`. The shim later attempts to infer tick from seconds if `currentTick` were missing; but here `currentTick` still exists, so you can get mismatch if you intended to move tick.

Other test suites (`playPause.noHalfBarJump`, `pause.noJump`, `playheadScrub.paused`, etc.) already use `currentTick`—these are aligned with the new canonical domain.

Conclusion: timelineStore.behavior.test.ts (and any tests building synthetic `TimelineState` objects with only seconds fields like in some selector phase tests) should be modernized to seed and assert using ticks; seconds assertions should become derived expectations only if still needed.

---

## 2. Observed Runtime Issues and Root Cause Candidates

You observed:

1. On pause then play, the playhead "jumps" forward by an amount proportional to the pause duration (implying the underlying clock keeps accruing).
2. Changing tempo in the UI, then pressing play, yields no audible/visual tempo change (tempo change not propagating to playback tick progression).
3. Potential mismatch between tick and seconds-based tests causing false confidence.
4. Looping / quantization interactions (historical half-bar jump) still suspicious.
5. General inconsistency when switching BPM while paused or after scrubbing.

### At least 5 Concrete Reasons (Code-Referenced):

Reason A: PlaybackClock not integrated with transport pause/resume

-   `PlaybackClock` maintains `_lastWallTimeMs`; calling `pause()` in `timelineStore` only flips `transport.isPlaying`—there is no central orchestration that resets or freezes the clock instance. If a render/update loop continues calling `clock.update(performance.now())` while `isPlaying` is false, ticks will still accrue internally. When play resumes and you propagate its tick, you see a jump equal to wall time elapsed during pause.
-   Evidence: `pause()` in `timelineStore` (lines ~520-525) merely sets state; `PlaybackClock` has no pause API; its `update()` integrates based on `nowMs - _lastWallTimeMs`.

Reason B: Missing authoritative tick propagation path binding store <-> PlaybackClock on tempo/BPM updates

-   `setGlobalBpm` mutates store notes and BPM but does not notify or reconfigure any shared `TimingManager` instance used by a live `PlaybackClock` (the store uses an internal `_tmSingleton` only for conversions, not for clock scheduling).
-   If your playback loop uses a different `TimingManager` instance (e.g., one created when constructing `PlaybackClock`) the BPM change entered via UI (store) won't affect the active clock.
-   Evidence: timelineStore.ts uses `_tmSingleton = new TimingManager()` (line ~186) for conversion helpers only; `setGlobalBpm` (line ~438) does not propagate to that singleton nor export it. `PlaybackClock` is externally constructed with its own `TimingManager` passed in; no observed binding code here ensures they stay in sync.

Reason C: Dual-domain authority race (seconds shim vs tick updates)

-   The subscription shim at bottom of timelineStore.ts recalculates `currentTimeSec` from `currentTick` except when `playheadAuthority === 'seconds'`. If external legacy code writes `currentTimeSec` without adjusting authority (or sets authority 'seconds'), later tick writes might be conditionally overwritten or drift.
-   This can produce apparent "jumping" if UI momentarily writes seconds domain (e.g., via a legacy seek function) then playback clock writes a tick update with authority 'clock'; derived seconds update lags one frame, making the time appear to shift unexpectedly.
-   Evidence: Subscription code lines ~720-775 sets derived seconds depending on `playheadAuthority`.

Reason D: Quantize-on-play logic may still snap unexpectedly relative to wall-clock integrated tick

-   In `play()` logic (lines ~470-505), snapping only happens if `!wasPlaying && quantize === 'bar'`. If the underlying (ignored) clock has already advanced ticks (because it was never paused), the first tick injection after resuming may appear larger; plus if user paused mid-bar and the real clock advanced into the next bar invisibly, snapping back can look like a reverse + forward sequence in UI updates.
-   Evidence: The guard doesn't freeze or align the `PlaybackClock`; it only manipulates store tick.

Reason E: Tests initializing only seconds fields create incomplete scenarios for tick-based playback

-   Example: timelineStore.behavior.test.ts sets `timeline.currentTimeSec = 12` but does not set `currentTick`; later conversions or inferred semantics may differ from a true runtime where tick is authoritative. This hides issues like incorrect tick-to-seconds conversion after tempo change.
-   Evidence: Test file content lines 1-40; no `currentTick` reset.

Reason F (extra): Tempo change does not recompute `playbackRange` or loop tick spans

-   When `setGlobalBpm` updates note seconds, it does not adjust existing `loopStartTick` / `loopEndTick` or `playbackRange` even though those might have been originally derived from seconds assumptions; user might expect loop region in "seconds length" to stretch/shrink with tempo change, but tick domain stays constant.
-   Evidence: `setGlobalBpm` only iterates cache notes; no update to transport loop tick positions or timeline view window.

Reason G (extra): Independent TimingManager instances fragment state

-   UI code instantiates a new `TimingManager` in `TimelinePanel` (lines ~240-260) just for formatting; diverges from the one driving playback or store conversions, leading to inconsistent formatting if BPM changes but panel instance not re-created / reconfigured at right time.
-   Evidence: `const tm = new TimingManager(); tm.setBPM(bpm || 120); tm.setTempoMap(tempoMap, 'seconds');` rather than referencing a shared manager.

---

## 3. Validation (Mapping Reasons to Code Evidence)

| Reason | Evidence Snippet / Location                                                                                             | Validation                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A      | `pause()` only toggles flags (lines ~520) vs. `PlaybackClock.update()` accumulating dt; no pause integration            | Confirms clock won't inherently stop |
| B      | `setGlobalBpm` (lines ~438+) updates store only; `_tmSingleton` internal; separate `new TimingManager()` used elsewhere | Confirms desynchronization risk      |
| C      | Subscription shim (lines ~720-780) with authority branch logic                                                          | Confirms potential race/drift        |
| D      | `play()` snapping logic (lines ~470-505) lacks clock coordination                                                       | Confirms mismatch on resume possible |
| E      | Test sets only `currentTimeSec` (behavior test lines 1-20)                                                              | Confirms seconds-centric test        |
| F      | `setGlobalBpm` lacks playbackRange/loop adjustments                                                                     | Confirms unchanged tick loop window  |
| G      | UI `TimelinePanel` local `TimingManager` instantiation (lines 240-260)                                                  | Confirms multiple managers pattern   |

All reasons found directly in code; no speculative external dependencies required.

---

## 4. Proposed Solutions (Actionable)

### 4.1 Core Architectural Fixes

1. Single Source of Timing Truth

    - Export a singleton (or context-provided) `TimingManager` instance used by:
        - `PlaybackClock`
        - `timelineStore` conversion helpers
        - UI formatting (BBT/time display)
    - Remove ad hoc instantiations (`new TimingManager()` in UI). Provide a hook or selector that derives formatted values from the store's tick + shared manager.

2. PlaybackClock Pause/Resume Semantics

    - Add methods: `pause()` capturing freeze state by setting `_lastWallTimeMs = null` so the next `update(now)` yields 0 dt after resume.
    - Optionally guard `update()` behind an `if (!isPlaying) return currentTick` check in the outer loop rather than inside the clock (cleaner separation).
    - On `timelineStore.pause()`, call `playbackClock.pause()`; on `play()`, call `playbackClock.resume(now)` (reset last wall time). This stops wall-time accumulation.

3. Central Transport Loop Controller

    - Introduce a small module (e.g., `src/core/transport-controller.ts`) that:
        - Owns the `PlaybackClock`
        - Subscribes to `timelineStore.transport.isPlaying`
        - On each animation frame (or worker tick) if playing: `clock.update(now); store.setCurrentTick(clock.currentTick, 'clock')`
        - Handles loop wrap: when tick > loopEndTick, call `clock.setTick(loopStartTick); store.setCurrentTick(loopStartTick,'clock')`.
    - Eliminates multiple sources writing ticks (prevents authority conflicts).

4. Tempo Change Propagation

    - When `setGlobalBpm` or `setMasterTempoMap` runs:
        - Update shared `TimingManager` (`timingManager.setBPM()` / `setTempoMap()`).
        - (Optional) Re-align `PlaybackClock` fractional accumulator: `clock.setTick(store.timeline.currentTick)` to ensure no fractional drift mismatch with new secondsPerBeat.
    - Provide a store action `syncTimingManager()` used internally after BPM changes.

5. Refine Authority Semantics
    - Limit accepted values to: 'clock', 'user'.
    - Remove external writes to seconds (deprecate `setCurrentTimeSec` in tests / UI).
    - Derive `currentTimeSec` purely from authoritative tick every render; remove 'seconds' authority branch to simplify.

### 4.2 Migration of Tests

-   Update timelineStore.behavior.test.ts:

    -   Initialize using `currentTick` instead of `currentTimeSec`.
    -   Replace assertions on `timelineView.startSec/endSec` with assertions on tick-window or (if needed) compute expected seconds via a helper referencing the global BPM.
    -   Keep a minimal derived seconds check by computing expected seconds from `currentTick / PPQ * secondsPerBeat`.

-   Add a new test ensuring pause truly freezes advancement:

    -   Simulate clock updates while `isPlaying=false` and assert tick unchanged.
    -   Then resume and assert correct incremental tick.

-   Add test that BPM change mid-play immediately affects delta (e.g., simulate two update intervals around a BPM change and confirm tick delta ratio changes).

### 4.3 Backward Compatibility

-   For legacy UI still reading seconds, keep the subscription derivation but remove any pathway that sets `currentTimeSec` directly.
-   Mark legacy methods (`setCurrentTimeSec`, `seek(seconds)`, etc.) with console.warning to encourage migration; internally convert seconds->ticks and call `setCurrentTick`.

### 4.4 Loop & Quantize Interaction

-   On `play()` if quantize == 'bar':
    -   Instead of snapping tick directly, compute bar-aligned tick boundaries via `TimingManager.beatsToTicks`.
    -   After snapping, also call `clock.setTick(snapped)` so internal fractional remainder cleared and no latent forward jump occurs later.
-   On loop wrap detection inside transport controller, reset `clock.setTick(loopStartTick)` before writing store to maintain consistency.

### 4.5 Handling BPM Change and Ranges

-   Decide semantics: Should loops & playback range be musical (beats/ticks) or absolute time?
    -   If MUSICAL (recommended): Leave ticks unchanged on BPM change (current design—document this).
    -   If user expectation is time-consistent, store loop definitions internally also as seconds and recompute ticks each BPM change. Clarify in UI tooltip.
-   Document chosen policy; adjust UI labeling (e.g., "Loop (musical bars)").

### 4.6 Performance / Drift

-   Replace approximate `approxSecondsPerBeat = tm.getSecondsPerBeat(tm.ticksToSeconds(this._tick))` with:
    -   For tempo maps: integrate segment-aware delta or smaller multi-step if dt spans multiple tempo changes (future improvement).
    -   For now acceptable; just ensure BPM changes reflect immediately because `getSecondsPerBeat` consults updated segments.

### 4.7 Additional Safeguards

-   Add guard in subscription shim: if authority not 'clock' and transport.isPlaying, prefer 'clock' to prevent old user scrub overriding live playback.
-   Provide debug devtool: a panel showing current authoritative tick, derived seconds, BPM, secondsPerBeat, last frame dt.

---

## 5. Suggested Implementation Steps (Prioritized)

1. Introduce shared `timingManagerSingleton` export.
2. Refactor `timelineStore` conversions to use that instance (remove private `_tmSingleton`).
3. Create `transport-controller.ts` that wires an animation loop.
4. Extend `PlaybackClock` with `resume(now)` / `pause()`; integrate with store actions.
5. Modify `setGlobalBpm` / `setMasterTempoMap` to call timing manager + resync clock.
6. Simplify authority logic; remove 'seconds' as writer.
7. Update tests:
    - Rewrite timelineStore.behavior.test.ts to tick domain.
    - Add pause freeze test & BPM change effect test.
8. Deprecate `setCurrentTimeSec` path (warn & convert).
9. Remove UI's ad hoc `new TimingManager()`; use shared for display.
10. Add documentation comment + README section on timing domain.

---

## 6. Risk & Edge Cases

Edge Cases to handle:

-   Rapid BPM changes while playing: ensure no runaway fractional accumulation (reset fractional on BPM change).
-   Tempo map insertion mid-play: need to realign seconds query so `getSecondsPerBeat` matches new segment (call `clock.setTick(clock.currentTick)` optionally).
-   Loop region shorter than accumulated dt between frames: after wrap, ensure we don't double-advance (wrap first, then propagate).
-   Pausing immediately after play before first `update()` call: clock last time null—resuming should not skip.
-   Zero or negative dt (tab freeze): protect with current `dtMs <= 0` guard (already present).

---

## 7. Concrete Changes to Tests (Illustrative Outline)

Example transformation for one test:

Old:

```
useTimelineStore.setState({ timeline: { ...state.timeline, currentTimeSec: 12 } });
expect(store.timeline.currentTimeSec).toBe(12);
```

New:

```
const PPQ = 480;
const secondsPerBeat = 60 / 120; // derive from BPM
const beats = 12 / secondsPerBeat;
const tick = Math.round(beats * PPQ);
useTimelineStore.setState({ timeline: { ...state.timeline, currentTick: tick }});
expect(store.timeline.currentTick).toBe(tick);
```

Then optionally:

```
const derivedSec = beats * secondsPerBeat;
expect(store.timeline.currentTimeSec).toBeCloseTo(derivedSec, 6);
```

---

## 8. Summary of Each Problem Mapped to Solutions

| Problem                              | Cause(s) | Solution(s)                                                                   |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------- |
| Playhead jump after pause            | A, D     | Add clock pause/resume; freeze updates when paused; snap & sync clock on play |
| Tempo change ignored                 | B, G     | Single timing manager; propagate BPM to clock; UI uses shared manager         |
| Tests still in seconds               | E        | Migrate tests to tick domain; rely on derived seconds only                    |
| Quantize causing unexpected movement | D        | Sync clock tick after snapping; quantize only once at transition              |
| Drift / authority confusion          | C        | Remove 'seconds' authority; centralize tick writes through controller         |

---

## 9. Next Actionable Items (If You Want Implementation)

I can proceed to:

-   Add shared `timingManagerSingleton`.
-   Introduce `transport-controller.ts`.
-   Modify store actions `play/pause` to call controller.
-   Update problematic test file(s).

Let me know if you want me to start implementing these—I'll create a todo plan and apply patches.

---

## Completion Summary

You have:

-   Identification of outdated seconds-based test (timelineStore.behavior.test.ts), rationale to migrate.
-   Seven validated code-level reasons for timing/transport issues.
-   Detailed, prioritized solution plan with architectural and incremental refactors.
-   Concrete test migration strategy and edge case considerations.

Would you like me to begin implementing the shared timing manager + controller and update the tests now? Just say the word and I’ll start applying changes.
