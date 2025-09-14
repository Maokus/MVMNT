## What is the point of a playback clock?

A playback clock is the authoritative bridge between real (wall) time and musical time (ticks / beats / bars). Instead of incrementing ticks by fixed step sizes or deriving them indirectly from a seconds counter, the clock:

1. Samples high‑resolution wall time deltas (e.g. `performance.now()`).
2. Translates each real-time delta into musical beats using the current tempo (or tempo map segment) at the _current musical position_.
3. Accumulates fractional sub‑tick remainders so there is no long‑term drift or rounding loss.
4. Produces a strictly monotonic, tempo-aware tick stream that downstream systems (playhead rendering, animation, scheduling) can trust as a single source of truth.

Key benefits:

-   Tempo Reactivity: A BPM or tempo map change immediately affects subsequent deltas without resetting accumulated position.
-   Determinism (within frame cadence): Fractional tick accumulation prevents drift that would arise from naive rounding per frame.
-   Clear Authority: Separates concerns — UI scrubbing / user seeks set an absolute tick; the clock only advances when transport is playing.
-   Seamless Domain Shift: Other systems can derive seconds from ticks; seconds are no longer the authoritative domain, reducing dual‑source inconsistencies.

### Updated pause semantics (2025‑09)

Previously the internal `PlaybackClock` continued to accumulate ticks even while the transport was paused; only the store ignored those writes. This created a conceptual mismatch: resuming could jump because the internal clock had advanced invisibly. The new semantics freeze the clock itself while paused:

-   `pause()` sets an internal flag; `update()` returns the same tick without advancing.
-   Wall time anchoring still refreshes so that a long paused interval does not produce a large delta upon resume.
-   `resume()` re-anchors the wall time reference to the resume moment, so the first post‑resume `update()` only accounts for the frame duration, not the entire paused gap.

Result: When the user resumes playback the tick starts exactly where it was paused, eliminating hidden advancement and unexpected jumps.

Completed (8/8) _Summarize findings and next steps_

## Overview

Here's a structured walkthrough of how the current system models musical time, playback state, clock progression, and the notion of “authority” over the playhead. This is distilled from timelineStore.ts, playback-clock.ts, and related tests.

---

## Core Concepts

### 1. Canonical Time Domain: Ticks

-   The authoritative representation of musical position is `currentTick` in `timeline.timeline.currentTick`.
-   One musical bar = `beatsPerBar` beats; one beat = `ticksPerQuarter` ticks (PPQ) from the shared `TimingManager`.
-   Legacy representations (`currentTimeSec`, offsets in seconds/beats) are _derived shims_ maintained for transitional UI code.

### 2. Shared Timing Manager

-   A singleton (`getSharedTimingManager()`) exposes tempo context (BPM or tempo map) plus `ticksPerQuarter`.
-   Provides conversions used by:
    -   `PlaybackClock.update()` to turn wall-clock milliseconds into tick deltas.
    -   Store derivations to map ticks <-> beats <-> seconds.
-   Tempo changes (`setGlobalBpm`, `setMasterTempoMap`) mutate both:
    -   State inside the store (for persistence / selectors).
    -   The timing manager (for immediate runtime effect, especially on the playback clock).

### 3. Playback Clock vs Store

-   `PlaybackClock` is a pure runtime integrator:
    -   Holds internal `_tick`, `_fractionalTicks`, `_lastWallTimeMs`.
    -   `update(nowMs)` advances internal ticks based on elapsed wall time and tempo.
    -   Does **not** write to the store directly; a higher-level loop (e.g. a React context or animation frame loop) decides when to call `setCurrentTick(..., 'clock')`.
-   Separation allows:
    -   The clock to keep “running” internally during pause (for measuring elapsed time if desired).
    -   The store to remain frozen when transport is paused (tests assert this).

### 4. Transport State

Transport slice (`transport`) tracks:

-   `isPlaying`: boolean fast check for active playback.
-   `state`: semantic status `'idle' | 'playing' | 'paused' | 'seeking'`.
-   `loopEnabled`, `loopStartTick`, `loopEndTick`.
-   `quantize`: currently `'off' | 'bar'`; influences snapping when entering play or seeking.
-   `rate`: playback rate multiplier (already used conceptually; tied to `PlaybackClock.rate` externally).

### 5. Looping

When `setCurrentTick` receives a new tick and looping is enabled with valid start/end:

-   If the incoming tick passes `loopEndTick`, it wraps to `loopStartTick`.
-   This wrap occurs uniformly regardless of authority (except when clock writes are being ignored during pause as per the recent guard).

### 6. Quantization

-   Applied on `play()` transition only (when changing from a non-playing state).
-   Snaps `currentTick` down (floor) to the start of the containing bar if `quantize === 'bar'`.
-   Emits a DOM event `timeline-play-snapped` so external systems (e.g. visualizer) can realign their `PlaybackClock` internal tick to the snapped boundary (avoids fractional drift).

---

## Authority Model

`timeline.playheadAuthority` records which “domain” last authored the playhead:

Authorities:

-   `'tick'`: Generic internal tick-based set (default / neutral).
-   `'clock'`: Real-time progression (PlaybackClock-driven).
-   `'seconds'`: Legacy seconds-based setter (`setCurrentTimeSec`).
-   `'user'`: Explicit user intent (seeks, scrubs).

Usage Patterns:

1. **User actions (seek/scrub)** call:
    - `seekTick()` (sets authority `'user'` and sets `transport.state='seeking'`).
    - `scrubTick()` (delegates to `setCurrentTick(...,'user')`).
2. **Real-time playback** loop writes:
    - `setCurrentTick(next, 'clock')` while `isPlaying=true`.
3. **Legacy seconds writes**:
    - `setCurrentTimeSec(sec, 'seconds')` (deprecated but still sets authority).
4. **Derived or system adjustments** (quantize on play):
    - Often leave authority untouched unless rewriting via `setCurrentTick`.

Why Authority Matters:

-   In the subscription derivation layer, authority dictates which domain is considered “source of truth” when reconciling `currentTimeSec`:
    -   If authority = `'seconds'`, ticks are recomputed from stored seconds.
    -   Otherwise (`'tick' | 'clock' | 'user'`), seconds are re-derived from ticks (ensures deterministic canonicalization).

Recent Conflict / Resolution:

-   Requirement: “Pausing freezes tick advancement” vs “Clock advance overrides user authority.”
-   Solution implemented: Only ignore `'clock'` writes when `transport.state==='paused'` and `isPlaying===false`. In all other states (including `'idle'` after initialization) clock can override.

---

## State Mutation Flow Examples

### A. Normal Playback Frame

1. Animation loop calls `clock.update(performance.now())` → returns internal tick.
2. If `transport.isPlaying` true:
    - External runtime compares internal clock tick to store tick.
    - Calls `setCurrentTick(clockTick, 'clock')`.
3. Store:
    - Applies looping wrap.
    - Updates `currentTick`, `playheadAuthority='clock'`.
4. Subscription layer:
    - Authority not `'seconds'` → derive `currentTimeSec` from ticks.

### B. User Scrub While Paused

1. User drags timeline:
    - `scrubTick(newTick)` → `setCurrentTick(newTick,'user')`.
2. Authority becomes `'user'`.
3. Seconds re-derived from ticks (authority not `'seconds'`).
4. Subsequent paused clock writes (if any) are ignored (guard).

### C. Seek then Play with Quantize

1. `seekTick(target)` sets tick + `'user'`, `transport.state='seeking'`.
2. `play()`:
    - If quantize `'bar'`, snap down to bar boundary; authority remains `'user'` (no override).
    - External listener receives snapped tick event and realigns clock to prevent drift.
3. First playback frame:
    - Clock write `'clock'` overrides authority to `'clock'`.

### D. Legacy Seconds Write

1. `setCurrentTimeSec(sec,'seconds')`:
    - Converts to beats → ticks.
    - Sets both `currentTick` and `currentTimeSec`, authority `'seconds'`.
2. Subscription pass:
    - Sees authority `'seconds'`, recomputes ticks from seconds if mismatch (ensures forward consistency when tempo map changes).

---

## Derivation Subscription Layer (Shim)

Runs on every store update:

Responsibilities:

-   Ensure `currentTimeSec` is always consistent with `currentTick` unless `'seconds'` is the authority.
-   Backfill `currentTick` from `currentTimeSec` if tick was missing (legacy edge case).
-   Derive:
    -   `timelineView.startSec/endSec`
    -   Loop seconds range
    -   Track offsets in beats/seconds
    -   Playback range seconds
-   This is a transitional compatibility layer slated for removal when the UI becomes fully tick-native.

Important Invariant:

-   Only one canonical mutable domain: ticks.
-   Seconds is regenerated unless the last explicit author was seconds-based (legacy call path).

---

## Pause Semantics

-   `pause()` sets `transport.isPlaying=false`, `transport.state='paused'`.
-   Clock internal time continues if loop calls `clock.update()`, but store ignores `'clock'` writes under the new guard.
-   Resuming with `play()` (from paused):
    -   May snap (if quantize) but does not auto-advance due to bar rounding (uses floor to avoid forward jumps).
    -   Authority preserved unless the next frame's clock write overrides.

---

## Loop Handling Edge Case

If a `'clock'` write is ignored during pause and the internal clock surpasses `loopEndTick`, upon resume:

-   First accepted clock write may “jump” (wrap logic applies immediately).
-   If this is undesirable, an additional resume step could:
    -   Reset `PlaybackClock` tick to the store’s `currentTick` (clearing fractional remainder).
    -   This is partially addressed by the `timeline-play-snapped` event for quantization; similar event could be emitted on plain pause → play transitions.

---

## Error / Drift Prevention Strategies in Current Design

-   Fractional tick accumulation (`_fractionalTicks`) avoids floating point drift.
-   Snapping uses floor rather than round to prevent unwanted forward shifts.
-   Derivation compares seconds with a tiny epsilon (`> 1e-9`) before rewriting to avoid oscillatory updates.
-   Authority gating avoids race between user scrubs and background clock frames.

---

## Typical Authority Transition Lifecycle

State: Start (idle)

-   `playheadAuthority = 'tick'` (default)

User scrubs:

-   Authority → `'user'`

User hits play:

-   Authority still `'user'` until first accepted clock frame.

Clock frame while playing:

-   Authority → `'clock'`

User pauses:

-   Authority remains `'clock'` (stable snapshot)

User scrubs while paused:

-   Authority → `'user'` (overrides)

Resume play:

-   After first frame, Authority → `'clock'` again.

Legacy seconds seek:

-   Authority → `'seconds'`
-   Next user or clock action overrides to `'user'` or `'clock'`.

---

## When to Favor Each Authority

-   `'user'`: Intention-preserving, do not let background mechanics clobber an explicit reposition until real playback resumes.
-   `'clock'`: Continuous playback progression—drives animations & audio sync.
-   `'seconds'`: Temporary bridge for old APIs—should shrink in use over time.
-   `'tick'`: Neutral default; safe baseline when system (not user) sets initial conditions.

---

## Potential Improvements (Future Work)

1. Explicit Authority Priority Table
    - Codify which transitions are allowed (e.g., disallow `'clock'` overriding `'user'` while paused—already implicit).
2. Event Hooks
    - Emit structured events: `playhead-authority-changed`, `playhead-loop-wrapped`.
3. Remove Legacy Seconds
    - Move seconds computation entirely into selector utilities.
4. Deterministic Resume
    - On `play()`, always resync `PlaybackClock.setTick(store.timeline.currentTick)` (no reliance on external listener).
5. Test Coverage Additions
    - Add tests for:
        - Clock ignored only in paused (not idle).
        - Loop wrap on resume after large internal clock advancement.
        - Authority transitions explicit matrix.

---

## Mental Model Cheat Sheet

| Component                | Owns                      | Writes                           | Reads                           | Notes                        |
| ------------------------ | ------------------------- | -------------------------------- | ------------------------------- | ---------------------------- |
| `PlaybackClock`          | internal tick accumulator | (indirect via external call)     | tempo (TimingManager)           | Pure runtime integrator      |
| `TimingManager`          | tempo map, BPM, PPQ       | via BPM/tempo APIs               | conversions                     | Shared singleton             |
| `timelineStore.timeline` | canonical tick, authority | actions (`setCurrentTick`, etc.) | UI, export, derivations         | Ticks are source of truth    |
| `transport`              | playback state flags      | `play`, `pause`, etc.            | gating setCurrentTick semantics | Distinguishes paused vs idle |
| Subscription shim        | derived seconds, ranges   | mutates state object post-update | tick + tempo context            | Transitional compatibility   |

---

## Quick Reference: Core Actions

| Action                             | Authority Set             | Side Effects                                            |
| ---------------------------------- | ------------------------- | ------------------------------------------------------- |
| `setCurrentTick(t,'clock')`        | `'clock'` (unless paused) | Loop wrap, derive seconds                               |
| `setCurrentTick(t,'user')`         | `'user'`                  | Loop wrap, derive seconds                               |
| `setCurrentTimeSec(sec,'seconds')` | `'seconds'`               | Converts to ticks, seconds authoritative reconciliation |
| `seekTick(t)`                      | `'user'`                  | `transport.state='seeking'`                             |
| `scrubTick(t)`                     | `'user'`                  | Lightweight; no transport state change                  |
| `play()`                           | (unchanged)               | Optional quantize snap + event                          |
| `pause()`                          | (unchanged)               | Freezes acceptance of `'clock'` writes                  |
| `setGlobalBpm(bpm)`                | (unchanged)               | Re-scales seconds computations when needed              |
| `setMasterTempoMap(map)`           | (unchanged)               | Recomputes note seconds + timing manager update         |

---

## Summary

The architecture cleanly separates:

-   Real-time continuous advancement (PlaybackClock).
-   Canonical deterministic timeline state (ticks in store).
-   Intent layering via authority (user vs clock vs legacy).
-   Transitional shims for seconds until full tick migration.

The recent guard refines the contract: “paused means the store is immutable to passive clock progression” without weakening the ability for the clock to regain authority once playback resumes.

Let me know if you’d like diagrams, a state transition table, or proposed refactors for authority normalization. Happy to extend this with selectors or additional tests.
