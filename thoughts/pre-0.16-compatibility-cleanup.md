# Pre-0.16 compatibility and breaking changes

Status: implementation record, 2026-08-02.

Version 0.16 uses the unreleased compatibility window to establish one current model. Released scene files remain
supported, but intermediate development formats and transitional runtime or SDK APIs are not compatibility surfaces.

## Retained compatibility

- Scene schemas v1–v7 still import. Their flat `elementsOrder`, legacy automation ownership, rotation, MIDI/audio,
  text-bound, asset, and package representations are normalized at the persistence boundary.
- Missing-plugin elements, element IDs, plugin properties, assets, macros, and v7 paint order survive migration.
- The plugin/content transform remains the leaf-content layer beneath host node transforms.
- SDK 2 bundles still load through the `apiVersion` runtime selector. No SDK 1 adapter has been restored.

## Breaking changes batched into 0.16

- The current external document is schema v8. Never-released schemas v8–v13 were collapsed into the final v8 graph,
  structured-target, node-binding, clip/source-time, and text-bound shape. Intermediate development files are not
  supported.
- Current automation channels require a structured `target`; `elementId`, `propertyKey`, ownership-encoded channel
  IDs, tuple channel factories, and tuple automation commands were removed. Channel IDs are opaque. Runtime and undo
  imports no longer decode old channels; that work is confined to persistence migration.
- `sceneStore.order`, current `elementsOrder` snapshots, and current document `elementsOrder` were removed. Graph
  traversal is the only current paint-order projection.
- `zIndex` was removed from the base element contract, default schema, inspector, first-party defaults, and visualizer
  mutation API. Imports discard it and exports do not write it; graph child order preserves released file order.
- Node IDs are the sole mutable selection authority. The mirrored element selection field and mutation signatures
  were removed; inspector element IDs are derived from selected element nodes.
- Macro assignment reverse lookup is one structured owner/property-target index. Element-only assignment DTOs and the
  parallel target index were removed.
- Automation UI selectors and expansion state use owner/target terminology rather than implying every owner is an
  element.
- Portable subtree transfer uses `SceneSubtreeBundle`; importing always allocates fresh node, element, macro, and
  channel IDs and rewrites structured references atomically.

These changes apply to first-party elements, in-development SDK consumers, and the main app. Private integrations
must move from `zIndex`, `setZIndex()`, legacy channel fields/factories, flat store order, mirrored element selection,
and element-only macro assignment views to graph commands and structured property targets.

## Deliberately retained boundaries

- Released schemas v1–v7 and their fields remain migration inputs only. They must not leak back into current store,
  command, selection, or SDK contracts.
- External asset bytes, plugin packages, and timeline tracks remain document-owned. Subtree bundles list references
  but do not yet transfer those payloads between documents.
- SDK 2 remains the only loader contract. Because it has not been publicly announced, further SDK breaks may be
  batched into 0.16, but each removed symbol still needs an explicit replacement in the SDK changelog.
