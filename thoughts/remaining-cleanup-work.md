# Remaining cleanup work

## Status

The scene-editor follow-up is complete. This document records optional cleanup that would make the
repository easier and faster for agents to navigate without changing product behavior. It is a
backlog, not a compatibility commitment. Current architecture references live in
`docs/ARCHITECTURE.md`, `docs/document-state/scene-store.md`, and
`docs/document-state/timeline-command-gateway.md`.

## Current evidence

The largest remaining implementation files are `state/scene/storeComposition.ts` (about 1,950
lines), `state/timelineStore.ts` (about 1,770 lines), `state/audioDiagnosticsStore.ts` (about 1,325
lines), `core/scene/elements/base.ts` (about 1,315 lines), `NodeTransformPanel.tsx` (about 1,140
lines), and `VisualizerContext.tsx` (about 860 lines). Large files are not automatically defects,
but they increase search noise and make ownership harder to infer.

The import pipeline is capability-split, but its extracted modules currently repeat a broad import
contract. The codebase also contains concentrated `any` usage and suppression comments around
timeline state, plugin loading, persistence, and diagnostics. These are useful markers for boundary
typing work rather than targets for blind mechanical replacement.

## High-value cleanup

### Finish mutation ownership inside store slices

- Move the remaining element/binding, graph/node-binding, and automation/macro mutation bodies out
  of `scene/storeComposition.ts` and into their existing slice modules.
- Continue moving timeline action bodies into transport, track/clip, audio/cache, view, and
  persistence creators. Keep `timelineStore.ts` as the compatibility hook and gateway composition.
- Add small capability contract tests that instantiate each creator without application startup
  wiring. This gives agents fast, local feedback.

### Reduce UI composition files

- Move the multi-selection and node-state sections out of `NodeTransformPanel.tsx`; keep the panel
  responsible for selecting data and wiring callbacks.
- Move the export runner and desktop-background effects from `VisualizerContext.tsx` into a
  `useExportLifecycle` hook built around `ExportLifecycleService`.
- Split `AutomationLaneRow`, `MacroConfig`, and the large settings/render modals by interaction
  capability. Preserve one public component per current import path.

### Tighten persistence and plugin boundaries

- Introduce shared import-pipeline contracts for parsed artifacts, hydration inputs, and warnings so
  extracted import modules do not repeat the facade's broad dependency header.
- Split `persistence/export.ts` into document shaping, binary asset collection, package assembly,
  and manifest emission, mirroring the import pipeline.
- Replace untyped document casts at the final application boundary with a validated current-document
  type.
- Define typed plugin-loader results and host-runtime error variants before reducing `any` usage in
  plugin loading.

## Agentic coding efficiency

### Make ownership discoverable

- Add short `AGENTS.md` files to `src/context/visualizer`, `src/persistence/import`, and
  `src/state/timeline` describing public facades, side-effect owners, and focused verification
  commands.
- Add an evergreen module map generated from TypeScript imports and check it for dependency cycles in
  CI. Keep generated output out of hand-edited architecture documentation.
- Prefer capability barrels only for stable public contracts; internal modules should import their
  direct owner to make dependency searches precise.

### Shorten feedback loops

- Add package scripts for the scene command contract, persistence migrations, timeline commands,
  shortcut registry, and plugin contract so agents do not need to reconstruct targeted Vitest
  commands.
- Add a changed-files test selector for local use while retaining the full root verification suite
  before handoff.
- Cache plugin SDK fixture builds and other deterministic generated test inputs between unchanged
  runs.

### Improve type and test signal

- Track `any` and suppression counts by owning domain and reduce them only at validated boundaries.
  Avoid a repository-wide lint rewrite that obscures behavior changes.
- Rename remaining historical test filenames that use rollout or phase terminology to behavior-based
  names, without combining unrelated suites.
- Extract oversized test fixtures and builders from test bodies so failures show the behavior under
  test rather than setup noise.
- Add architecture tests for single global shortcut ownership, facade export stability, and import
  module dependency direction.

## Suggested order

1. Add ownership notes and focused scripts first; these improve every later agent task.
2. Finish scene and timeline mutation ownership with contract tests.
3. Extract UI composition hooks/components while public state boundaries are stable.
4. Tighten persistence and plugin types, then reduce remaining suppressions by domain.
5. Add cycle and module-size reporting as advisory CI output before considering enforcement.
