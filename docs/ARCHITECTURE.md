# Architecture Overview

## Domain Boundaries

Logical domains are separated to keep concerns isolated:

-   animation/: Pure animation primitives and note animation implementations (stateless except for per-instance state).
-   core/: Core engine logic (scene graph, rendering, timing, playback clock, resource management, scene builder utilities).
-   state/: Application state (Zustand store + selectors). The single source of truth for musical time in ticks.
-   ui/: React component layer (panels, property editors, layout) consuming selectors + light view-model helpers.
-   math/: Generic math, geometry, numeric helpers (no music / interaction logic remains after reorg).
-   export/: User-facing export orchestration (video, image sequence) invoking core render functions.
-   hooks/: React hooks encapsulating reusable UI behavior.
-   utils/: Small generic utilities (logging, throttling, etc.).

(After reorganization) music theory helpers and MIDI parsing will live under `core/midi/music-theory/` to reflect their coupling with core timeline + rendering.

## Canonical Time Domain

-   Canonical representation: ticks (integer) at a project-level PPQ (currently fixed constant).
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

## Future Enhancements

-   Configurable PPQ with migration helper constant (see cleanup plan optional steps).
-   Central time formatting utility for UI display (ticks -> human time string).
-   ESLint rules to detect disallowed seconds field reintroductions.

## Glossary

-   Tick: Smallest discrete musical timing unit (integer).
-   PPQ: Pulses Per Quarter note (project constant defining tick resolution).
-   Playhead: Current authoritative tick position advanced by `PlaybackClock` or user action.
-   Selector: Pure function deriving enriched view data from store state.

---

This document should be updated whenever domains move or new timing representations are introduced to prevent knowledge drift.
