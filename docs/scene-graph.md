# Scene graph runtime

MVMNT persists scene hierarchy separately from plugin element data. The scene graph is host-owned; plugins
continue to own only the content described by their element properties.

## Document model

Schema v12 stores `scene.elements` and `scene.graph`. The graph contains a reserved synthetic root and one stable
element node for every element record. Child order is canonical back-to-front paint order. `elementsOrder` is an
internal compatibility projection derived by depth-first traversal and is not written to v12 scene files.

Each node stores local visibility and lock flags, an exact six-value affine `parentCompensation` matrix, and an
editable host transform containing translation, clockwise rotation in radians, uniform scale, and pivot. Element
IDs remain the ownership keys for plugin properties and automation; node IDs remain stable when an element is
renamed.

The graph validator checks the reserved root, parent/child reciprocity, element ownership, reachability, cycles,
and finite transforms. The current product policy permits root elements and one level of root-owned groups whose
children are elements. Traversal and validation are iterative so imported documents cannot overflow the stack with
deeply nested input.

## Runtime resolution

`SceneRuntimeAdapter.resolveFrame()` is the shared frame source for rendering and editor geometry. It caches a
static `SceneStructureIndex` by graph revision, evaluates each visible element once per frame, and returns paint
records, inherited flags, world transforms, render payloads, bounds, and hulls indexed by node and element ID.

The affine transform order is:

```text
parent world × parent compensation × host node transform × element content transform
```

The existing plugin/content transform remains intact. Perspective elements stay top-level compositor payloads;
their resolved ancestor affine matrix is supplied directly to the perspective root.

## Commands and compatibility

Graph mutations use scene commands. Alongside local node edits, atomic structural commands group, ungroup,
duplicate, delete, reorder, and world-transform node selections. Structural command undo records exact serialized
snapshots. Batches are transactional: if one child command fails, the scene snapshot from before the batch is
restored. Deleting a group cascades through its elements and element-owned automation; ungrouping is the operation
that preserves children.

## Editor behavior

Selection is node-based and transient. It tracks an active node, range anchor, expanded tree rows, and the group
currently being edited; none are persisted. The hierarchy tree displays each canonical child list in reverse so
the frontmost node appears first. Ctrl/Cmd toggles rows, Shift selects a displayed sibling range, and the canvas
uses parent-first selection unless a group has been entered. Left-to-right marquees require containment;
right-to-left marquees select intersections. Locked or hidden inherited state removes descendants from interaction
without changing their local values.

Canvas move, nudge, rotation, and uniform-scale gestures apply a world-space delta to the normalized node
selection. The resolver supplies aggregate bounds and handles, including group bounds from visible descendant
artwork. Selected subtrees are excluded from snapping. The host node inspector edits name, visibility, lock,
translation, rotation, uniform scale, and pivot; mixed multi-selection values are explicit. Plugin properties are
labelled as applying only to the active element.

Grouping non-contiguous siblings retains their relative order but creates a contiguous paint block at the
frontmost selected position, so their stacking relative to intervening unselected siblings can change.
