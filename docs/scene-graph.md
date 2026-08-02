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
finite transforms, and the currently supported root-to-element hierarchy policy. Traversal and validation are
iterative so imported documents cannot overflow the stack with deeply nested input.

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

Graph mutations use scene commands (`replaceGraph`, `updateNodeTransform`, `setNodeVisibility`, and
`setNodeLocked`). Structural command undo records exact serialized snapshots. Batches are transactional: if one
child command fails, the scene snapshot from before the batch is restored.

The element list and selection APIs still expose element IDs. Canvas move, rotate, and scale gestures update the
host node transform, while legacy/plugin properties remain available under the content-properties inspector.
