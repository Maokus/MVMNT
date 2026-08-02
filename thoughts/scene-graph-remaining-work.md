# Scene graph remaining work

Status: post-cleanup follow-up, 2026-08-02. Phases 1–5 are implemented; Phase 6 and Phase 7 are intentionally excluded
from the current pass.

## Completed post-phase cleanup

- Node IDs are the sole mutable scene selection. Element IDs are derived for inspector consumers, selections are
  ancestry-normalized, and reconciliation can recover the nearest surviving ancestor.
- Macro reverse lookup is one structured-target index. Automation UI state and selectors use owner/target names.
- `SceneSubtreeBundle` exports detached recursive subtrees and imports them atomically with two-pass node, element,
  macro, and channel ID remapping. Structured bindings and targets are rewritten, validation runs before attach, and
  command undo restores the exact prior snapshot.
- Runtime scene imports accept only structured automation. Pre-v13 automation decoding remains in the persistence
  migration, not in the store's undo/import path.

## Remaining Phase 5 and cross-cutting work

- Add explicit structural-command selection hints; finish consistent effective hidden/locked handling in every
  inspector and timeline entry point. General reconciliation now falls back to a surviving sibling, ancestor, or root
  editing scope.
- Complete the target-aware acceptance matrix for timeline focus, auto-key/transient overrides, mixed-owner
  selection, and preview/export parity for animated groups. Structural duplication, deletion, exact undo, selection
  reconciliation, and portable import now have focused coverage.
- Add document-level transfer for external asset bytes, plugin packages, and timeline-track references. The current
  subtree bundle records those references as dependencies but deliberately does not copy document-owned payloads.
- Replace synthetic v7 migration inputs with a golden fixture exported by 0.15.4 and verify visual order and timing.

## Deferred by request

- Phase 6: affine policy, robust compose/decompose, pivot behavior, animated reparent modes, and cancellable baking.
- Phase 7: folders, masks, composites/effects, layout containers, components, typed multi-editing, and any hierarchy
  surface in the plugin API.

Recommended next step: obtain the 0.15.4 golden fixture, close the remaining target-aware editor/export acceptance
matrix, and decide the cross-document policy for document-owned dependencies. Phase 6 can then start separately.
