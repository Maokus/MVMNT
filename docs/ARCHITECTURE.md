# Architecture Overview

## Domain Boundaries

Logical domains are separated to keep concerns isolated:

-   animation/: Pure animation primitives and note animation implementations (stateless except for per-instance state).
-   core/: Core engine logic (scene graph, rendering, timing, playback clock, resource management, scene builder utilities).
-   state/: Application state (Zustand store + selectors). The single source of truth for musical time in ticks.
-   ui/: React component layer (panels, property editors, layout) consuming selectors + light view-model helpers.
-   math/: Generic math, geometry, numeric helpers (no music / interaction logic remains after reorg).
-   export/: User-facing export orchestration (video, image sequence) invoking core render functions.
-   utils/: Small generic utilities (logging, throttling, etc.).

(After reorganization) music theory helpers and MIDI parsing will live under `core/midi/music-theory/` to reflect their coupling with core timeline + rendering.

## Canonical Time Domain

-   Canonical representation: ticks (integer) at a project-level PPQ (configurable at startup).
-   Secondary representations (beats, seconds, bars) are derived on demand through selectors/utilities; they are not stored in canonical entities.
-   Conversion rules centralize inside `core/timing/` and are accessed via utilities or selectors (never ad-hoc per feature).
-   PlaybackClock advances ticks from real-time deltas and writes authoritative playhead position; derived seconds are computed when needed for UI.

## Data Flow

1. User input / transport events -> state mutations (Zustand actions).
2. Selectors derive computed shapes (e.g., notes with seconds, layout metrics).
3. Core render/scene consumes derived tick-domain data and produces visual frames.
4. Export pipeline drives deterministic frame rendering using the same core APIs.

## Rendering Pipeline (High Level)

-   Scene Graph: Elements registered in `core/scene/elements/*` implement a common interface.
-   Modular Renderer: Compiles a window of active elements into render operations.
-   Animation Controllers: Map time (ticks) to per-note or per-element visual transitions using ADSR-like phase logic.
-   Scheduling: Deterministic iteration over ticks/time slices for rendering or export.

## Store & Selectors

-   Single store: `state/timelineStore.ts` holds tracks, notes, playhead, loop, quantization, tempo map.
-   All tempo and conversion logic avoids duplicating seconds/beats on note objects; selectors enrich data.
-   Actions use clear authority semantics (user | clock | seconds | tick) primarily for analytics/debug clarity.

## Imports & Module Patterns

-   Use relative paths within a domain and path aliases (e.g., `@core/*`, `@state/*`) for cross-domain references to clarify boundaries.
-   Avoid circular imports by keeping high-level orchestration (e.g., export pipeline) out of low-level math/timing modules.
-   Barrel files (`index.ts`) are thin re-export layers only—no side effects.

## Error & Logging Strategy

-   Non-fatal warnings use `debug-log.ts` gating (dev builds) to reduce noise in production bundles.
-   Throw only for programmer errors or invariant violations; user-facing recoverable issues surface via UI state instead.

## Testing Approach

-   Unit tests: Core timing conversions, playback clock, scheduling, and selectors.
-   Integration-like tests: Render scheduler diffing, timing manager behavior, simulated clock.
-   Future: snapshot tests for export outputs and animation curves.

## Planned / Enforced Constraints

-   No direct seconds domain writes outside timing conversion utilities.
-   No mixing of geometry/math utilities with music theory after reorg.
-   MIDI ingestion normalizes to tick-domain immediately.

### Canonical PPQ Configuration

The canonical PPQ (ticks per quarter; resolution of the tick domain) is defined in `core/timing/ppq.ts`.

API:

```
import { CANONICAL_PPQ, setCanonicalPPQ, getCanonicalPPQ } from '@core/timing/ppq';
```

`CANONICAL_PPQ` is a live mutable export (updated when `setCanonicalPPQ` is called early during startup). For dynamic reads after potential runtime adjustments (tests), prefer `getCanonicalPPQ()`.

Runtime Initialization:

-   If the Vite env var `VITE_CANONICAL_PPQ` is set (e.g. `VITE_CANONICAL_PPQ=960`), `src/app/index.tsx` will call `setCanonicalPPQ` before the app renders, ensuring all subsequent modules see the adjusted resolution.
-   Validation rejects non-positive / non-numeric values.

Guidelines:

-   Never hard-code 480/960 in production code; always derive via `CANONICAL_PPQ`.
-   Tests that assume fixed beat-to-tick math should import `CANONICAL_PPQ` instead of literals.
-   Helper converters (`beatsToTicks`, `ticksToBeats`) are provided in `ppq.ts`.

Implications:

-   Existing serialized data (if any) that persisted raw ticks will load consistently provided the same PPQ is used. A future migration layer could annotate stored PPQ to support importing sessions with different resolutions.

## Future Enhancements

-   Persist per-project PPQ and auto-migrate stored sessions with differing resolutions.
-   Central time formatting utility for UI display (ticks -> human time string).
-   ESLint rules to detect disallowed seconds field reintroductions.

## Glossary

-   Tick: Smallest discrete musical timing unit (integer).
-   PPQ: Pulses Per Quarter note (project constant defining tick resolution).
-   Playhead: Current authoritative tick position advanced by `PlaybackClock` or user action.
-   Selector: Pure function deriving enriched view data from store state.

---

This document should be updated whenever domains move or new timing representations are introduced to prevent knowledge drift.

## 2025-09 Persistence & Undo Updates

### Selection Field Removal

The transient `selection` slice (track selections) is no longer serialized in scene/timeline exports nor stored in undo snapshots. Selection is pure UI state and restoring it on load created confusing implicit focus changes. Legacy JSON that still contains a `selection` field is safely ignored during import for backwards compatibility.

Rationale:

-   Avoid polluting diffs / version control with inconsequential UI focus changes.
-   Reduce snapshot size and churn in the undo ring (less memory, fewer duplicate captures).

### Undo Snapshot Granularity Improvements

Undo previously relied solely on a debounced global store subscription and ad‑hoc scene builder instrumentation. This caused unintuitive capture points (e.g. sometimes missing a snapshot right after a discrete action, or capturing many intermediate states of a rapid drag).

Enhancements implemented:

1. Timeline store action instrumentation wraps key mutators (`addMidiTrack`, `removeTrack`, `updateTrack`, playback range setters, ordering, tempo/meter changes, etc.) and triggers an immediate (next tick) `markDirty()` after the action resolves (supporting async ingestion for MIDI).
2. Scene builder instrumentation (element add/remove/move/update/settings) remains in place to capture pure scene graph mutations that bypass the store.
3. Debounced subscription still exists as a safety net for any unwrapped mutations, but most user-driven persistent changes now yield a clean snapshot boundary.

Result: Undo/redo semantics now align closely with user intent—each discrete persistent change (track add/remove, playback range change, element structural mutation) produces a logical undo step. Continuous drags still coalesce via debounce to avoid flooding the ring.

### Backwards Compatibility

Imports created before this change continue to load; their `selection` field (if present) is ignored. No schema version bump was required because omission is additive & non-breaking.
