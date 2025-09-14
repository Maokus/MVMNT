## Recently Removed Legacy Components

The following legacy abstraction has now been fully removed:

-   `TimelineService`: Replaced by the Zustand `timelineStore` plus pure utilities in `core/timing/note-query.ts`. All former service tests were migrated to target the store + `noteQueryApi`. Barrel export updated; file deleted. Any remaining comments referencing the service are informational and can be pruned in a later pass.

Key utility replacements:

-   `noteQueryApi.getNotesInWindow(state, trackIds, startSec, endSec)` – windowed note retrieval w/ solo, mute, region & offsets.
-   `noteQueryApi.timelineToTrackSeconds(state, track, timelineSec)` – maps absolute timeline seconds to track-local seconds respecting regions.
-   `noteQueryApi.trackBeatsToTimelineSeconds(state, track, beats)` – canonical beats -> timeline seconds with tempo map.
-   `noteQueryApi.timelineSecondsToTrackBeats(state, track, sec)` – inverse mapping.

Offsets are now canonical in ticks (`offsetTicks`). Old tests using `offsetSec` emulate behavior by converting seconds->beats->ticks (PPQ 480). Regions migrated from seconds to tick-based (`regionStartTick`, `regionEndTick`).

Solo/mute semantics are enforced centrally in `getNotesInWindow` (solo dominance). Region clipping is applied in track-local domain prior to absolute timeline mapping.

## Observations On Current src Structure

High-level layout:

-   `animation/` (pure visual layer behaviors)
-   `core/` (timing, scene graph, rendering, playback)
-   `state/` (Zustand timeline store, selectors, tests)
-   `export/` (video/image/timing snapshot)
-   `math/` (geometry, numeric, transforms, midi subdomain)
-   `ui/` (panels, layout, forms)
-   `hooks/` (custom React hooks)
-   `context/` (React contexts bridging core/state to UI)
-   `utils/` (generic helpers)
-   `bindings/` (macro & property binding systems)
-   `pages/` (route-level screens)
-   `shared/` (thin; currently sparse services/types)
-   `types/` (ambient typing such as `zustand.d.ts`)

### Strengths

-   Domain segmentation is roughly coherent: timing logic isolated under `core/timing`, rendering under `core/render`, animation under its own root.
-   Tests colocated near their domains (`__tests__` pattern) improves locality.
-   Use of barrel exports (e.g., index.ts) gives consumers a stable facade.

### Pain / Confusion Points

1. Dual timing abstractions: `TimelineService` vs Zustand store + selectors creates conceptual duplication. Developers must decide “service or store?” on each change.
2. Mixed naming: Some files still reference “Phase” migrations (historical) which adds noise for new contributors.
3. `math/` contains both rendering-related transforms and MIDI-specific logic; splitting musical/time theory from geometric math would clarify intent.
4. `shared/` is almost empty—acts as a dumping ground without clear boundaries; might be removed or renamed (`domain-shared`, `infrastructure`) if it gains a purpose.
5. React contexts plus Zustand store both propagate overlapping playback/timeline data (e.g., current tick, play state). Could centralize one propagation source (store) and keep contexts for cross-cutting concerns (e.g., imperative engine handles).
6. Animation note system has both registry + previously removed factory; consolidation now done, but ensure external docs reflect only registry usage.
7. Legacy seconds-domain comments largely pruned; any remaining references should be modernized to emphasize tick canonical domain.

### Suggested Reorganization

Phased to reduce risk:

Phase A (Low-risk tidy):

-   Remove “Phase X” comments; replace with concise doc blocks or ADRs in docs.
-   Collapse `shared/` by moving any real code to `utils/` or a clearer domain (or delete if unused).
-   Move MIDI/music theory helpers from `math/midi` into `core/midi` or new `music/` domain; keep geometric + interaction math in `math/`.

Phase B (Timing consolidation): Completed.

-   Pure note/timing utilities extracted (`note-query.ts`).
-   `VisualizerContext` and `visualizer-core` no longer instantiate or expose the service.
-   Tests migrated; class removed and barrel export pruned.

Phase C (Selector pruning):

-   Remove deprecated seconds-based selectors once all UI components read ticks and derive seconds locally when needed.
-   Provide a single utility `ticksToHumanTime(state, tick)` for UI formatting to prevent accidental re-introduction of legacy patterns.

Phase D (Documentation ):

-   Add `docs/ARCHITECTURE_TIMING.md` summarizing canonical domain (ticks) + conversion layering (tick -> beat -> bar -> seconds).

### Specific File Moves / Renames

-   mouseToTransforms.ts => `core/interaction/mouse-to-transforms.ts` (ties directly into scene interaction rather than pure math).
-   `bindings/` could be nested under `core/` (`core/bindings/`) if they are engine-level abstractions, or under `ui/` if exclusively for front-end property mapping—decide based on usage.
-   video-exporter.ts & `export/image-sequence-generator.ts`: If they depend heavily on rendering internals, a `core/export/` nesting clarifies coupling.

### Potential Further Deletions (Pending Verification)

-   Any test files reporting “0 tests” (initial failing run showed some before re-run normalized). Confirm those now have content; if they’re placeholders, remove them or add minimal assertions.
-   Legacy comments referencing removed fields (e.g., `legacy seconds authority`) can be cleaned to reduce cognitive load.

## Small Follow-Up Improvements (Optional)

-   Add a script (e.g., `scripts/find-deprecated.ts`) scanning for keywords (`deprecated`, `legacy`) to keep cleanup continuous.
-   Add a Jest/Vitest custom matcher or rule to fail builds if a deprecated selector is imported after a cut-off date (enforces discipline).
-   Replace repeated local `const ppq = 480` literals with a single exported constant `CANONICAL_PPQ` to prevent drift (ensure no circular import).

## Summary Mapping To Todos

1. Marker search: Done.
2. Unused animations: Factory confirmed dead; removed.
3. Orphan scan: Identified & removed helpers + duplicate test.
4. Deletions + verification: Tests all green post-change.
5. Structure assessment: Provided detailed critique & phased plan.
6. Applied deletions: Completed (TimelineService + related dead paths, deprecated selectors earlier).
7. Final report: This response (updated post-removal).

## Next Steps (If You Want More)

-   Approve and implement Phase A refactors (I can start by moving math/midi or pruning comments).
-   Prune any lingering comments referencing removed seconds-domain patterns.
-   Add ADR documenting timeline canonical domains (ticks->beats->bars->seconds) referencing `note-query` utilities.

Let me know if you’d like me to proceed with any of those follow-up steps now.
