# Scene graph runtime

MVMNT persists scene hierarchy separately from plugin element data. The scene graph is host-owned; plugins
continue to own only the content described by their element properties.

## Document model

Schema v8 stores `scene.elements` and `scene.graph`. The graph contains a reserved synthetic root and one stable
element node for every element record. Child order is canonical back-to-front paint order. Flat `elementsOrder`
exists only on released migration inputs and is not part of current documents or runtime state.

Each node stores local visibility and lock flags, an exact six-value affine `parentCompensation` matrix, and an
editable host transform containing translation, clockwise rotation in radians, uniform scale, and pivot. Element
Element IDs remain the ownership keys for plugin properties, while automation and macros use structured targets
that distinguish element content from host nodes. Node IDs remain stable when an element is renamed.

The graph validator checks the reserved root, parent/child reciprocity, element ownership, reachability, cycles,
and finite transforms. Groups may contain elements or other groups to arbitrary useful depth. Traversal,
validation, ancestry checks, and subtree lookup are iterative; a defensive traversal budget rejects hostile files
without imposing a product nesting limit.

## Runtime resolution

`SceneRuntimeAdapter.resolveFrame()` is the shared frame source for rendering and editor geometry. It caches a
static `SceneStructureIndex` by graph revision, evaluates each visible element once per frame, and returns paint
records, inherited flags, world transforms, render payloads, bounds, and hulls indexed by node and element ID.
Host-node bindings are evaluated parent-first before world matrices are composed, so animated group transforms and
visibility flow through ordinary descendant resolution without invalidating the structural index.

The affine transform order is:

```text
parent world × parent compensation × host node transform × element content transform
```

The existing plugin/content transform remains intact. Perspective elements stay top-level compositor payloads;
their resolved ancestor affine matrix is supplied directly to the perspective root.

## Commands and compatibility

Graph mutations use scene commands. Alongside local node edits, atomic structural commands group, ungroup,
duplicate, delete, reorder, reparent, and world-transform node selections. Cross-parent moves snapshot world
matrices before editing the graph and write exact compensation in the destination parent space. Moves into the
selected subtree are rejected before mutation. Structural command undo records exact serialized snapshots. Batches
are transactional: if one child command fails, the scene snapshot from before the batch is restored. Deleting a
group cascades through its elements and element-owned automation; ungrouping is the operation that preserves
children. Reparenting through animated ancestry is rejected until explicit preservation and baking modes are
implemented.

Portable copy/paste and cross-document structure transfer use `SceneSubtreeBundle`. A bundle contains detached
recursive nodes, their element records and node bindings, referenced macros, and referenced automation channels.
Import allocates every node, element, macro, and channel ID before rewriting references, validates the complete graph,
and attaches it through one rollback-safe scene command. Document-owned asset bytes, plugin packages, and timeline
tracks are reported as dependencies; transferring those payloads is a separate document-level concern.

## Editor behavior

Selection is node-based and transient. It tracks an active node, range anchor, expanded tree rows, and the group
currently being edited; none are persisted. The recursive hierarchy tree displays each canonical child list in
reverse so the frontmost node appears first. Ctrl/Cmd toggles rows, Shift selects only within a displayed sibling
list, and keyboard navigation follows visible tree rows. Breadcrumbs scope editing at any depth. Drag targets move
whole subtrees before, inside, or after another row; self and descendant targets are invalid. The canvas uses
parent-first selection unless a group has been entered, where only that container's direct children become
selectable. Left-to-right marquees require containment; right-to-left marquees select intersections against actual
descendant artwork rather than empty space inside aggregate group bounds. Locked inherited state removes
descendants from interaction without changing their local values.

Canvas move, nudge, rotation, and uniform-scale gestures apply a world-space delta to the normalized node
selection. The resolver supplies aggregate bounds and handles, including group bounds from visible descendant
artwork. Selected subtrees are excluded from snapping. The host node inspector edits name, visibility, lock,
translation, rotation, uniform scale, and pivot; transform and visibility fields expose keyframe and macro controls
for a single active node. Mixed multi-selection values are explicit. Plugin properties are labelled as applying only
to the active element.

Grouping non-contiguous siblings retains their relative order but creates a contiguous paint block at the
frontmost selected position, so their stacking relative to intervening unselected siblings can change.
