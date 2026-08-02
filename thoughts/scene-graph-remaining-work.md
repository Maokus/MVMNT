# Scene graph remaining work

Status: post-cleanup follow-up, 2026-08-02. Phases 1–5 are implemented; Phase 6 and Phase 7 are intentionally excluded
from the current pass.

## Remaining Phase 5 and cross-cutting work

- Make node selection the sole mutable scene selection. Derive inspector element IDs instead of synchronizing
  `selectedNodeIds` and `selectedElementIds`, and normalize ancestor/descendant selections at every entry point.
- Consolidate macro reverse lookup into one structured-target index and remove compatibility element/path fields from
  assignment views. Rename element-centric automation UI state and selectors to owner/target terminology.
- Improve editor reconciliation with command hints, nearest surviving ancestor/sibling fallback, editing-scope
  recovery, and consistent effective hidden/locked handling.
- Add target-aware acceptance coverage for timeline focus, auto-key/overrides, rename/delete, mixed node/element
  selection, duplication, and preview/export sampling of an animated group.
- Implement portable `SceneSubtreeBundle` copy/paste and cross-document import with two-pass ID allocation/remapping,
  detached validation, atomic attach, exact undo, and explicit plugin/asset/macro/track-reference policy.
- Replace the synthetic v7 migration inputs with a golden fixture exported by 0.15.4 and verify visual order and timing.

## Deferred by request

- Phase 6: affine policy, robust compose/decompose, pivot behavior, animated reparent modes, and cancellable baking.
- Phase 7: folders, masks, composites/effects, layout containers, components, typed multi-editing, and any hierarchy
  surface in the plugin API.

Recommended next step: finish the single-authority selection and macro cleanup, then implement the portable subtree
bundle. After those land, Phase 6 can start with the affine-policy decisions listed in the main plan.
