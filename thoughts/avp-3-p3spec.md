# Audio Visualisation Phase 3 — Cache Intents & Diagnostics Spec

**Status:** Draft for Review (2025-10-12)

This document elaborates the implementation details for Phase 3 of the consolidated [Audio Visualisation Implementation Plan (Phase Consolidation)](./audio-visualisation-plan-3.md). Phase 3 focuses on cache intent surfacing, diff-aware regeneration UX, and diagnostics tooling to keep audio feature caches deterministic and recoverable.

## Objectives
- Provide a deterministic declaration of cache requirements ("analysis intents") per element.
- Surface non-blocking UI affordances that communicate mismatches between current caches and requested descriptors.
- Enable creators and developers to inspect, filter, and selectively regenerate stale cache entries without touching unrelated features.
- Record regeneration history for auditability while keeping project files slim.

## Success Metrics
- **Determinism:** Regeneration actions mutate only the targeted cache entries and never alter unrelated descriptors.
- **Visibility:** Creators understand when caches are stale within a single interaction loop (banner + diagnostics panel).
- **Recoverability:** Failed regenerations can be retried without manual project edits.
- **Low overhead:** Analysis intents and history logging add <5% overhead to scene save/load times.

## Scope
- Implement runtime plumbing for structured analysis intents emitted from audio visualisation elements.
- Introduce scheduler-side diffing between cached descriptors and requested intents.
- Deliver inspector/UI surfaces (banners + diagnostics panel) with regeneration controls.
- Persist regeneration history to the developer tooling channel (debug pane + export manifest notes).

### Out of Scope
- Changes to how analysis profiles themselves are defined (covered by Phase 1).
- Automation hooks or notifications outside of the audio visualisation workspace.
- Telemetry beyond aggregated usage counts (handled once privacy review completes).

## Architecture Overview

### Analysis Intent Emission
- Each audio visualisation element constructs an `AnalysisIntent` object at render preparation time containing:
  - `elementId`
  - `trackRef`
  - `analysisProfileId`
  - `descriptors[]` (fully-qualified descriptor IDs including channel alias where applicable)
  - `requestedAt` timestamp (ISO 8601, derived from project timebase)
- Intents are published to a new `analysisIntentBus` (in-memory emitter) consumed by the scheduler.
- Intents are cached per element to avoid duplicate emission when the element's configuration is unchanged. A memoized hash of the tuple `{trackRef, analysisProfileId, descriptors[]}` gates updates.

### Scheduler Diffing Pipeline
1. Collect intents per render frame and normalize by `{trackRef, analysisProfileId}`.
2. For each grouping, query the cache metadata service (Phase 1 deliverable) for the currently materialised descriptors.
3. Produce a `CacheDiff` object:
   ```ts
   type CacheDiff = {
     trackRef: string;
     analysisProfileId: string;
     descriptorsRequested: string[];
     descriptorsCached: string[];
     missing: string[];
     stale: string[]; // profile mismatch or outdated revision hash
     extraneous: string[]; // cached but no longer requested
   };
   ```
4. Publish diffs to:
   - UI store for banner + diagnostics panel rendering.
   - Regeneration queue module that batches regeneration jobs per `{trackRef, analysisProfileId}` to avoid redundant analysis runs.

### Regeneration Queue
- Backed by an async worker that serializes jobs per track/profile while allowing cross-track concurrency.
- Job payload includes the list of descriptors to recompute and the triggering reason (missing, stale, manual rerun).
- Queue events emit status updates (`queued`, `running`, `succeeded`, `failed`) consumed by diagnostics UI and history logger.

### Diagnostics Panel
- Implemented as a dockable inspector pane within the audio visualisation workspace.
- Sections grouped by `trackRef`. Within each track group, sub-sections for each `analysisProfileId`.
- Rows display descriptor name, status (Current, Missing, Stale, Extraneous), last analysis timestamp, and action buttons (`Regenerate`, `Dismiss` for extraneous entries).
- Panel persists sorting/filter preferences via user settings storage (leverages existing inspector preference store).

### Banner UX
- Non-blocking banner appears when any `CacheDiff.missing.length + CacheDiff.stale.length > 0`.
- Copy references glossary terms directly (e.g., "analysis profile", "descriptor") and links to docs: `docs/audio-feature-bindings.md#cache-regeneration`.
- Banner CTA options: `Regenerate All`, `Open Diagnostics`, `Learn More`.

## Data Model Changes
- Extend cache metadata records with `profileRevisionHash` to detect stale caches when profile parameters change.
- Introduce `analysisIntentHistory` collection stored in developer tooling (not project JSON) containing:
  - `id` (UUID)
  - `timestamp`
  - `elementId`
  - `action` (`auto_regenerate`, `manual_regenerate`, `dismissed`)
  - `descriptorIds[]`
  - `status` (`success`, `failure`)
  - `durationMs`
- Provide export pipeline hook that writes a summarized history entry to export manifests (`exports/<sceneId>/analysis-history.json`) when exports are triggered.

## UX Content Guidelines
- Glossary-aligned copy only; avoid roadmap codenames.
- Use declarative status messaging, e.g., "2 descriptors require regeneration to match the 'HighRes FFT' profile."
- Include contextual help linking to [Audio Visualisation Implementation Plan – Phase 3](./audio-visualisation-plan-3.md#phase-3--cache-intents--diagnostics).

## Edge Cases & Failure Handling
- **Profile deleted:** Show blocking modal prompting user to select a replacement profile before regenerating.
- **Offline/analysis worker unavailable:** Banner displays "Regeneration paused" state with retry once service reconnects.
- **Concurrent edits:** If multiple elements request regeneration of the same descriptor, queue deduplicates by descriptor ID; completion events update all subscribers.
- **Export in progress:** Regeneration requests are deferred; UI communicates "Queued after export" state.

## Testing Strategy
- **Unit Tests:**
  - Intent hash memoization prevents duplicate scheduler submissions.
  - Cache diffing handles permutations of missing/stale/extraneous descriptors.
  - History logger truncates entries beyond retention limit (default 1000) without data loss for recent actions.
- **Integration Tests:**
  - Simulate profile mismatch -> banner renders -> `Regenerate All` triggers queue -> caches update -> banner dismisses automatically.
  - Diagnostics panel selective regeneration updates only targeted descriptors, verified through cache metadata snapshots.
  - Failure scenario triggers retry flow and history log entry with `status: failure`.
- **End-to-End (optional once infrastructure ready):**
  - Render export before/after regeneration with unchanged descriptors to confirm identical outputs (leverages deterministic render harness).

## Instrumentation & Telemetry
- Capture aggregate counts: `regeneration.triggered`, `regeneration.failed`, `diagnostics.opened`.
- Guard behind existing privacy flag; no descriptor payloads emitted.
- Metrics sampled client-side and forwarded via analytics pipeline v2.

## Rollout Plan
1. **Behind Feature Flag:** `feature.audioVis.cacheDiagnosticsPhase3` gating all UI surfaces.
2. **Internal Dogfood:** Enable for internal creators, collect feedback on banner frequency and diagnostics clarity.
3. **Staged Release:** Gradually roll out to 10%, 50%, 100% of production workspaces once telemetry confirms stability.
4. **Flag Removal:** After two release cycles without regressions, remove feature flag and update documentation references.

## Open Questions
- What retention policy should apply to `analysisIntentHistory` to avoid large debug stores? (Proposal: 30 days or 1000 entries.)
- Do we need to expose regeneration history within exported project bundles, or is manifest logging sufficient?
- Should extraneous descriptor entries trigger automatic cleanup, or remain user-controlled to avoid data loss surprises?

## References
- [Audio Visualisation Implementation Plan – Phase 3](./audio-visualisation-plan-3.md#phase-3--cache-intents--diagnostics)
- [Audio Feature Bindings & Cache Reference](../docs/audio-feature-bindings.md)
- [Legacy Binding Shift Summary](./legacybindingshiftplan.md)
