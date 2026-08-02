# Pre-0.16 compatibility and breaking changes

Status: implementation record, 2026-08-02.

Version 0.16 uses the unreleased compatibility window to establish one current model. Released scene files remain
supported, but intermediate development formats and transitional runtime APIs are not compatibility surfaces.

## Retained compatibility

- Scene schemas v1–v7 still import. Their flat `elementsOrder`, legacy automation ownership, rotation, MIDI/audio,
  text-bound, asset, and package representations are normalized at the import boundary.
- Missing-plugin elements, element IDs, plugin properties, assets, macros, and v7 paint order survive migration.
- The plugin/content transform remains the leaf-content layer beneath host node transforms.
- SDK 2 bundles still load through the `apiVersion` runtime selector. No SDK 1 adapter has been restored.

## Breaking changes batched into 0.16

- The current external document is schema v8. Never-released schemas v8–v13 have been collapsed into the final v8
  graph, structured-target, node-binding, clip/source-time, and text-bound shape. Development files emitted by those
  intermediate schemas are not supported.
- Current automation channels require a structured `target`; `elementId`, `propertyKey`, ownership-encoded channel
  IDs, tuple channel factories, and tuple automation commands were removed. Channel IDs are opaque.
- `sceneStore.order`, current `elementsOrder` snapshots, and current document `elementsOrder` were removed. Graph
  traversal is the only current paint-order projection.
- `zIndex` was removed from the base element contract, default schema, inspector, first-party defaults, and visualizer
  mutation API. Imports discard it and exports do not write it; graph child order preserves the released file order.
- Selection keyframe ownership now resolves the selected channel's target. Element renames no longer rewrite channel
  IDs, and element deletion cleans selected keyframes by target ownership.

These changes also apply to first-party elements and in-development SDK consumers. Any private element that used
`zIndex`, `setZIndex()`, legacy channel fields/factories, or flat store order must move to graph commands and
structured property targets before rebasing on 0.16.

## Still transitional

- Macro reverse lookup still has element-only and structured indexes.
- Scene selection still mirrors node selection into element IDs for existing inspector callers.
- The package version remains SDK 2.1.0 because this pass did not alter an exported SDK package symbol. If a later
  cleanup removes a published SDK 2 symbol, bump the SDK major and record the exact replacement in its changelog.
