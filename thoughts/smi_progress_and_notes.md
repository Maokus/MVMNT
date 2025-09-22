Use this document to add progress and notes on the store migration implementation.

## 2025-02-20 – Phase 0 pass
- Added `snapshotBuilder` helper + tests to capture builder/macros invariants.
- Recorded `scene.edge-macros` fixture and parity test (`buildEdgeMacroScene`) for regression diffing.
- DocumentGateway now covered by phase-0 regression tests (export + apply) using the fixture.
- Prototyped undo middleware reuse: instrumentation wraps builder mutations and undo/redo round-trips cleanly.
- Mutation audit written (`docs/store-migration/phase0-builder-mutation-audit.md`) enumerating all direct builder writes.
- Follow-ups: extend undo instrumentation for `updateElementId` and template resets; start plumbing command gateway for SceneSelection + menu flows.
