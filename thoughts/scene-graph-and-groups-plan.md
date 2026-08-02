# Scene graph, multi-selection, groups, automation, and compositing plan

Status: Phases 1 through 5 are implemented. Current behavior is documented in
[`docs/scene-graph.md`](../docs/scene-graph.md); later sections remain the proposed implementation sequence.

Post-phase cleanup has also removed flat runtime order and `zIndex`, made structured property targets and node-only
selection authoritative, consolidated macro reverse indexing, and introduced atomic portable subtree bundles. The
remaining non-Phase-6/7 work is tracked in
[`scene-graph-remaining-work.md`](./scene-graph-remaining-work.md); compatibility decisions are recorded in
[`pre-0.16-compatibility-cleanup.md`](./pre-0.16-compatibility-cleanup.md).

This is an implementation plan, not documentation of existing behavior. It is grounded in the code at the
revision above and should be re-audited if the affected areas move substantially. The plan deliberately keeps
the host in control of hierarchy. Plugins continue to describe element content; they do not create or own scene
nodes.

## 1. Outcome and non-negotiable decisions

The long-term document is a recursive, host-owned scene graph with one persisted synthetic root. Every plugin
element has a stable element node, and every group is a host-owned container node. Node identity is independent
from the editable element ID shown to users. Graph child order is the only scene stacking order.

The transform contract is:

```text
worldTransform =
  parentWorldTransform
  × parentCompensation
  × userNodeTransform
  × existingElementTransform
```

The three local terms have distinct ownership:

- `parentCompensation` is host-maintained bookkeeping. It preserves world appearance when a node is grouped,
  ungrouped, or reparented. It is normally invisible in the inspector and is not a user animation surface.
- `userNodeTransform` is the host transform edited by canvas handles, the host inspector, and eventually node
  automation and macros. It belongs to both element and group nodes.
- `existingElementTransform` is the current transform synthesized by `SceneElement.buildRenderObjects()` from
  plugin/legacy properties such as `offsetX`, `offsetY`, `elementRotation`, scale, skew, anchor, and perspective
  setup. It remains the final compatibility layer so existing scenes and plugins do not change appearance.

This separation is necessary even in a recursive graph. A recursive parent relationship supplies inherited
motion, but moving an already-positioned child under a transformed parent changes its world transform. The
compensation term records the inverse parent-space adjustment without rewriting plugin properties or the
user-authored node transform. It also makes an initial no-visible-change migration possible.

Initial grouping is deliberately restricted by validation to:

```text
root → element
root → group → element
```

The types, traversal, commands, and resolver must nevertheless be recursive and contain no depth constants.
Phase 4 removes only a validation/product restriction, not an architectural limitation.

Other fixed decisions:

- Each non-root node has exactly one parent. Containers have ordered children; element nodes have none.
- Grouping non-contiguous siblings is allowed. The selected nodes retain their relative order, become one
  contiguous block, and the group is inserted at the frontmost selected sibling position. Their relationship to
  intervening unselected siblings may therefore change. The command preview/help text must say that grouping may
  change stacking.
- Child order is canonical back-to-front paint order. Tree UI may display frontmost-first for usability, but it
  must explicitly reverse the canonical list rather than introduce another order.
- `zIndex` may be projected during compatibility, but it cannot remain a second ordering authority.
- Visibility and locked state are local values whose effective values are inherited through ancestors; inheritance
  never overwrites descendant-local values.
- A transform selection cannot contain both an ancestor and its descendant.
- Deleting a group deletes its entire subtree. Ungroup is the explicit operation that preserves and reparents its
  children.
- Hierarchy disclosure (expanded/collapsed rows) and group-edit mode are transient editor state, not document
  state. Group names, order, transforms, visibility, and lock are document state.

## 2. Current architecture on `dev`

### 2.1 Document state, ordering, and commands

`src/state/sceneStore.ts` stores a flat `elements: Record<string, SceneElementRecord>` and `order: string[]`.
Bindings, automation, inspector interaction state, and most reverse indexes use the editable element ID. The
store's internal `SCENE_SCHEMA_VERSION` is 5, while the external `.mvt` schema is independently versioned at 11.
That naming collision should be removed or made explicit during Phase 1.

`moveElement()` changes the flat array and rewrites every element's `zIndex`. Conversely, `updateBindings()` can
sort the array after a `zIndex` edit. `src/state/scene/runtimeAdapter.ts` then sorts the flat entries by evaluated
`SceneElement.zIndex`, using array position only as a tie-breaker. Today there are therefore two coupled ordering
authorities. The graph migration must not preserve that ambiguity.

`src/state/scene/commandGateway.ts` is the persistent mutation boundary. Its `SceneCommand` union and inverse
patch builder know only flat element operations. Of particular concern, `batch` builds all child inverses against
the same pre-batch state rather than an evolving transaction state. That is unsafe for group/reparent commands
whose later steps depend on earlier structural changes. Phase 1 must introduce graph-native atomic commands or a
transactional draft before grouping is exposed.

`src/state/undo/patch-undo.ts` records command patches and merges repeated interactions through `mergeKey`.
`src/context/UndoContext.tsx` owns the application controller. This is a good foundation once commands capture an
exact persistent before/after graph delta. Selection and other editor state should not be added to every inverse.

### 2.2 Runtime, rendering, geometry, and export

`SceneRuntimeAdapter` caches plugin `SceneElement` instances by element ID and keeps `orderedIds`. Its cache reacts
to element records, bindings, settings, and automation changes, but it has no structural graph cache. Missing
plugin types are instantiated as `MissingPluginElement`, which already gives placeholders the same runtime path as
normal elements and must remain true in the graph.

`src/core/scene/elements/base.ts` builds each element's content and wraps it in an `EmptyRenderObject` or
`PerspectiveElementRoot`. It applies the current offset, anchor, rotation, scale, skew, opacity, visibility, and
perspective properties to that root. That wrapper is the concrete `existingElementTransform` compatibility layer;
do not move those properties wholesale in one migration.

`src/core/visualizer-core.ts` currently obtains render objects through `_buildSceneRenderObjects()`, but
`getElementBoundsAtTime()` independently sorts elements, rebuilds their render objects, and derives bounds again.
Selection overlays and handle generation are single-element paths layered on that second reconstruction.
`src/core/interaction/snapping.ts` calls the bounds method yet again, while
`src/workspace/panels/preview/canvasInteractionUtils.ts` performs flat reverse-order hit-testing and edits the
legacy element transform properties. These separate reconstructions are the most important runtime debt to remove.

`src/core/render/modular-renderer.ts` recognizes `PerspectiveElementRoot` only when it is top-level.
`src/core/render/perspective-compositor.ts` rasterizes its children offscreen and applies the homography. Simply
wrapping perspective elements in ordinary group render objects would silently bypass that compositor. The resolved
scene must preserve perspective leaves as explicit render entries, or the compositor must be taught the resolved
ancestor transform. Preview and export must use the same solution.

Video, AV, and image-sequence export in `src/export/` call the existing visualizer's `renderAtTime()`. That is useful:
once the visualizer consumes resolved-scene records, exports inherit graph behavior without a parallel exporter
resolver. Add parity tests so this remains contractual.

### 2.3 Selection, hierarchy UI, and inspector

`src/state/selectionStore.ts` already has `selectedElementIds: string[]`, but it does not deduplicate or validate
ancestry and has no explicit active/primary item. `src/state/scene/hooks.ts` treats the first ID as primary.
`src/context/SceneSelectionContext.tsx`, visualizer interaction state, canvas interactions, `SidePanels.tsx`, and
`src/workspace/panels/scene-element/ElementList.tsx` collapse that array back to one element. Delete, duplicate,
arrow nudging, visibility, handles, and tree reordering are consequently single-element operations. There is no
canvas marquee.

The current element list is a flat reorderable list. It can become the hierarchy tree, but its callbacks, row keys,
drag model, and visibility controls must move from element IDs to node IDs. Parent-first canvas selection should
select a group when its descendant artwork is hit. In group-edit mode, the same hit should select the direct child
of the edited group. Deeper descendants are reached by entering deeper edit scopes after nested groups ship; this
avoids ambiguous click-through behavior.

`src/workspace/panels/properties/PropertiesPanel.tsx` chooses either one `ElementPropertiesPanel` or global scene
properties. `ElementPropertiesPanel.tsx`, `PropertyGroupPanel.tsx`, and `KeyframeControl.tsx` are schema-driven but
take one `elementId`; macro assignment, auto-key, transient overrides, tab state, and collapse state are all keyed
accordingly. Phase 3 should add a host-owned node inspector alongside this panel. Typed mixed-value editing belongs
later, after generic targeting, rather than forcing plugin schemas into the first grouping milestone.

### 2.4 Automation, macros, persistence, and copy

`src/automation/types.ts` defines channels with `elementId` and `propertyKey`, and canonical IDs are constructed as
`${elementId}.${propertyKey}`. `src/state/sceneStore.ts`, `commandGateway.ts`, timeline automation rows, keyframe
selection, overrides, duplication, deletion, and rename logic all depend on that ownership. Macro assignments are
`{ elementId, propertyPath }`, with a reverse index in the scene store and UI in
`src/workspace/panels/properties/MacroConfig.tsx`. Parsing channel IDs is already used to recover ownership. New
generic ownership must be structured data, not another ID convention.

`src/persistence/validate.ts` declares external schema v11. `src/persistence/export.ts` writes a record of elements
plus `elementsOrder`; `src/persistence/document-gateway.ts` normalizes that shape back into an element array before
calling `importScene()`. Import migrations are composed in `src/persistence/import.ts`. Validation currently catches
duplicate order entries but has no graph reachability, cycle, parent/child, or cross-reference validation.

`SceneClipboard` in `sceneStore.ts` currently stores only `elementIds` and is not a complete portable subtree
format. A graph-aware clipboard/import bundle must include enough data to remap node, element, automation, macro,
and asset IDs. Timeline clip clipboard code is a separate domain and should not be conflated with scene copy/paste.

## 3. Target contracts

These names are illustrative but should be adopted consistently rather than translated into several competing
models.

```ts
type SceneNodeId = string;
type SceneElementId = string;

interface SceneNodeBase {
    id: SceneNodeId;
    parentId: SceneNodeId | null; // null only for the synthetic root
    name: string;
    localVisible: boolean;
    localLocked: boolean;
    parentCompensation: Matrix2D;
    userNodeTransform: NodeTransform;
}

interface SceneRootNode extends SceneNodeBase {
    kind: 'root';
    children: SceneNodeId[];
}

interface SceneGroupNode extends SceneNodeBase {
    kind: 'group';
    children: SceneNodeId[];
}

interface SceneElementNode extends SceneNodeBase {
    kind: 'element';
    elementId: SceneElementId;
}

type SceneNode = SceneRootNode | SceneGroupNode | SceneElementNode;

interface SceneGraphState {
    rootId: SceneNodeId;
    nodesById: Record<SceneNodeId, SceneNode>;
    revision: number;
}
```

Use a documented six-value affine matrix or an equivalent immutable math type for persisted compensation. Define
matrix order, point convention, finite-number requirements, and equality tolerance once in a graph math module.
`NodeTransform` should initially contain translation, rotation, uniform scale, and pivot in an inspector-friendly
form; its evaluated matrix is authoritative at runtime. Avoid lossy matrix decomposition in routine reparenting:
store the exact compensation matrix and decompose only when a user operation requires editable components.

The synthetic root is persisted with a stable reserved ID generated/validated by the host. It has identity
transforms, is never user-selectable, and cannot be deleted or reparented. Keeping it persisted makes root ordering
obey the same invariants as every other container and avoids a special `rootOrder` field.

The resolver should expose one frame product to every consumer:

```ts
interface ResolvedSceneRecord {
    nodeId: SceneNodeId;
    elementId?: SceneElementId;
    parentId: SceneNodeId | null;
    depth: number;
    paintIndex: number;
    effectiveVisible: boolean;
    effectiveLocked: boolean;
    parentWorldTransform: Matrix2D;
    nodeWorldTransform: Matrix2D; // through userNodeTransform
    contentWorldTransform?: Matrix2D; // includes existingElementTransform
    artworkBounds?: Bounds;
    artworkHull?: Point[];
    renderPayload?: ResolvedRenderPayload;
}
```

Container records and element records may use specialized discriminated types, but rendering, bounds,
hit-testing, snapping, marquee, outlines, handles, perspective composition, and export must read this same resolved
frame. They may build indexes over it; they may not rebuild transforms or hierarchy independently.

Resolution has two layers:

1. A structurally cached graph snapshot computes validated traversal, ancestry, depth, paint order, parent links,
   subtree ranges, inherited static flags, and element/node lookup maps. It is invalidated only by graph or relevant
   static metadata revision changes.
2. Per-frame evaluation reads automation/macros and plugin content, evaluates local transforms and effective state,
   resolves world matrices parent-first, and derives render payloads and artwork geometry. Cache plugin instances and
   unchanged geometry where existing version signals permit, but never cache time-varying world results as structural
   data.

For large scenes, both layers should be O(nodes + produced artwork) per full frame, with O(1) ID lookup. Structural
updates should invalidate affected subtrees where practical. Bounds should be accumulated bottom-up and spatial
indexes may accelerate hit-testing/snapping after correctness is established. Do not introduce N repeated calls to
`buildRenderObjects()` for N editor subsystems.

## 4. Transform and geometry rules

### 4.1 Reparenting, grouping, and ungrouping

For a static node with old world matrix `Wold` and new parent world matrix `Pnew`, preserve appearance by solving the
new local matrix before the content layer:

```text
desiredNodeLocal = inverse(Pnew) × WoldBeforeExistingElementTransform
parentCompensation' = desiredNodeLocal × inverse(userNodeTransform)
```

Equivalent factorizations are acceptable if the persisted contract stays stable and round-trips exactly. Commands
must use double-precision math and calculate all source world matrices from the pre-command snapshot before changing
any parent. Group creation proceeds as one transaction:

1. Validate that selected nodes are siblings, transform-selectable, unlocked, and ancestor-free.
2. Record their pre-command world transforms and canonical sibling positions.
3. Remove them from the parent list, insert the group at the frontmost selected position, then add the selected
   nodes to the group in their original relative order.
4. Solve each child's compensation against the new group world transform.
5. Validate and commit the entire graph or commit nothing.

Ungroup performs the inverse shape operation: snapshot child world transforms, insert children contiguously at the
group's former sibling position in child order, solve each compensation against the former group parent, and delete
the now-empty group. The group itself is not converted to a plugin element.

### 4.2 Singular and difficult transforms

Reparent preservation requires `inverse(Pnew)`. A zero or near-zero scale, non-finite matrix, or degenerate
perspective projection makes that undefined or unstable. The graph validator should reject non-finite persisted
matrices. Interactive scale handles must clamp magnitude to a documented epsilon while preserving the sign policy,
so ordinary edits cannot create singular affine parents. Imported singular transforms can remain renderable but
must block preservation operations with a specific recoverable error (for example, reset/fix parent transform
first), never silently jump or write `NaN`.

Phase 3 supports aggregate translation, rotation, and uniform scale around a world-space selection pivot. Applying
one world delta `D` to child `i` requires:

```text
Wi' = D × Wi
Li' = inverse(Pi) × Wi'
```

where `Pi` is that node's parent world matrix. Each result is then represented by the node's host transform terms.
Applying the same local delta to every child is incorrect when parents differ or are transformed.

Non-uniformly scaling a world-space selection containing rotated children generally creates skew in their local
matrices. A translate/rotate/uniform-scale first release avoids pretending otherwise. Phase 6 must choose between
preserving exact matrices with skew, decomposing with a declared convention, or restricting interactions. Negative
scale likewise needs a product policy for flips, rotation discontinuities, and handle orientation.

### 4.3 Bounds and hit-testing

Group bounds are the union/hull of visible descendant artwork in world space, derived from resolved leaf geometry.
They are not an invented rectangular group surface. A group's aggregate rectangle can position outlines and handles,
but clicking empty space inside that rectangle must not automatically count as hitting the group. Hit-test descendant
artwork/hulls in reverse paint order, then map the hit to the selectable owner for the current edit scope.

Default canvas behavior is parent-first: artwork under a closed group selects that group. Entering group-edit mode
(for example by explicit tree action or double-click, subject to the existing text-edit gesture conflict) makes the
group's direct children selectable. Marquee uses artwork intersection/containment and applies the same owner mapping.
Locked effective state removes nodes from interactive selection/handles while keeping them renderable. Invisible
effective state removes artwork from render, hit-test, snapping, marquee, and bounds contributions.

## 5. Phase 1 — scene-graph substrate

**Purpose.** Add the persistent recursive graph, stable node identities, validation, graph operations, schema v12,
and exact transactional undo with no intended visible behavior change.

**Current constraints.** `sceneStore.ts` couples element identity and order; `moveElement()` and `zIndex` sort each
other; `commandGateway.ts` has flat commands and non-transactional batch inverse construction;
`DocumentGateway.normalizeElements()` discards hierarchy because none exists; external validation understands only
`elementsOrder`.

**Data-model changes.** Add `SceneGraphState` and the node types above, ideally in a focused
`src/state/scene-graph/` or `src/core/scene-graph/` package with no React dependency. Generate one stable element node
per existing element. Keep editable `SceneElementRecord.id` unchanged and add indexes `nodeIdByElementId` and
`elementIdByNodeId` as derived data, not duplicated persisted authorities. Persist the synthetic root in
`nodesById`. Initially all node transforms are identity.

Implement one validator returning typed errors for: unique IDs; exactly one valid root; root `parentId === null`;
all other parents present; reciprocal parent/children references; no duplicate child entries; element nodes with no
children; every element referenced by exactly one element node; no node referencing a missing element; no cycles;
all nodes and elements reachable from root; finite transforms; and the Phase 1 depth/kind policy. Use iterative DFS
or guarded recursion so malicious deep documents cannot overflow the stack.

**Runtime/rendering changes.** None intended. Derive a flat compatibility order by depth-first paint traversal of
element nodes and feed it to `SceneRuntimeAdapter`. With only root-level element nodes, this must equal the old
`order`. Add graph revision selectors but do not yet change render transforms.

**Editor and UX changes.** Continue showing the flat element list. Node IDs remain internal. Preserve current
element selection by resolving selected element IDs to their nodes only in compatibility helpers. Hierarchy
disclosure is not added yet.

**Persistence and migration changes.** Define external scene schema v12 with `scene.graph` and the existing
`scene.elements` record. `scene.graph` owns root and child order; v12 must not require `elementsOrder`. The v11→v12
migration creates deterministic or generated stable node IDs, one root, root children matching `elementsOrder`, and
identity transform terms. It should translate v11 `zIndex`-derived effective order exactly as exported, rather than
re-sorting with a new rule. Keep readers for supported v1–v11 via the existing migration pipeline, then migrate to
v12 before `DocumentGateway.apply()`.

Update `CURRENT_SCHEMA_VERSION`, `SCHEMA_TO_MIN_APP_VERSION`, envelope types, `validateSceneEnvelope()`, export,
import, `DocumentGateway`, templates/fixtures, and baseline tests. Clarify or rename the internal store schema version.
For one compatibility window, `DocumentGateway` may expose derived `elementsOrder` to internal services that still
expect flat input, but it must come from graph traversal and be marked deprecated. v12 export has one authority.

**Command and undo implications.** Add graph-native commands such as `insertNode`, `removeSubtree`, `moveNodes`,
`reparentNodes`, and `replaceGraph` with preconditions/revision checks. Prefer a command result containing an exact
persistent before/after delta over expanding hierarchy edits into fragile flat `batch` commands. Patch construction
must evaluate sequentially against a transaction draft, validate once at commit, and roll back fully on failure.
Undo restores node records, child arrays, element records, and bindings exactly. After apply/undo/redo, a separate
editor reconciler removes nonexistent selections and chooses a sensible surviving parent/sibling; it does not make
selection part of persistent inverses.

**Automation and macro implications.** None semantically. Element IDs, channels, and macro assignments remain
unchanged. Graph element nodes reference those elements. Removing an element node through a subtree command must use
the existing element cleanup paths so automation and macro reverse indexes cannot become orphaned.

**Compatibility strategy.** Keep `state.order` only as a derived read model during the transition. Block direct
writes except through graph commands. Assert in development/tests that derived order and any compatibility array
match. Existing plugin APIs remain untouched. Missing-plugin placeholders receive ordinary element nodes.

**Tests and acceptance criteria.** Add unit/property-style tests for traversal, validation, cycle detection,
reachability, reciprocal references, element uniqueness, deterministic v11 migration, v12 round-trip, malformed
graphs, and transactional rollback. Existing rendering snapshots, ordering tests, persistence fixtures, missing
plugin tests, and undo tests must remain unchanged in visible output. Verify undo/redo of add, remove, rename,
duplicate, and reorder restores byte-equivalent persistent scene state.

**Explicitly deferred.** Node transforms affecting output, groups in UI, multi-selection operations, nested groups,
node animation, and compositing.

**Risks and failure modes.** Dual mutable order sources can drift; legacy imports may contain duplicate/missing
order references; ID migration can collide; commands can leave half-applied graphs; recursive code can assume the
temporary depth limit. Mitigate with a single mutation gateway, validation at boundaries, derived-only compatibility
state, and depth-independent tests.

**Definition of done.** Every live scene has a validated persisted graph; all flat consumers receive graph-derived
order; v1–v11 documents migrate to v12 without visual changes; v12 round-trips; persistent graph commands are
atomic and undoable; no grouping UI exists.

**Implementation size.** Split into at least two Codex sessions/PRs: (1A) types, validator, traversal, store and
transaction foundation; (1B) v12 persistence/migration plus conversion of flat commands to graph-backed commands.

## 6. Phase 2 — unified resolved scene and node transforms

**Purpose.** Make one recursive resolver the source for render, geometry, interactions, perspective, and export;
introduce host node transforms and inherited state without requiring groups in the product yet.

**Current constraints.** `SceneRuntimeAdapter.buildScene()` produces flat render objects; `visualizer-core.ts`
rebuilds objects for bounds; snapping and hit-testing consume separate approximations; overlays know one element;
`SceneElement.buildRenderObjects()` owns all current transforms; perspective dispatch is top-level-only.

**Data-model changes.** Activate persisted `parentCompensation` and `userNodeTransform` on all nodes. Add local
visibility and lock to nodes while leaving plugin `visible` as part of existing element content during compatibility.
Define whether element-node local visibility initially mirrors or gates the plugin property; the recommended bridge
is an effective AND gate, with the existing plugin property preserved and the tree eye control migrated to node
visibility once inspector compatibility is ready.

**Runtime/rendering changes.** Introduce `SceneStructureIndex` and a `ResolvedSceneFrame` service. Structural cache
keys include graph revision, element-node mapping, static local flags, and plugin/runtime structural versions.
Per-frame evaluation resolves macros/automation, calls each element's content builder once, reads its existing root
transform, composes the declared matrix chain, and produces resolved render and geometry records.

Refactor `MIDIVisualizerCore.renderAtTime()`, `getElementBoundsAtTime()`, interaction overlays, selection handles,
`elementHitTest`, `buildSnapTargets`, marquee infrastructure, and exporters to use that frame or indexes derived from
it. Remove independent z sorting and render-object rebuilding. The runtime adapter should cache instances and
provide element content to the resolver, not decide scene hierarchy.

Perspective must remain a first-class resolved render payload. Recommended approach: keep each perspective element
as a paint-order leaf, pass its resolved ancestor affine transform into `PerspectiveElementRoot`/
`PerspectiveCompositor`, and rasterize only the element's content as today. Do not place it beneath an ordinary
render-object wrapper that hides its type. Add preview/export parity tests for perspective under transformed nodes
before groups are enabled.

**Editor and UX changes.** Keep single selection, but migrate move/rotate/uniform-scale handles and a new host
Transform inspector section to `userNodeTransform`. Provide a temporary explicit “Content transform (legacy/plugin)”
section or labels so users understand why both node and plugin transforms can exist. Anchor/perspective controls may
remain content controls initially. Tree visibility and future lock controls read effective inherited state from the
resolver.

**Persistence and migration changes.** v12 already carries identity transforms. Export finite normalized values and
reject corrupt matrices. No new schema version should be required if Phase 1 reserves the complete shape. Flat
compatibility exports, if temporarily needed internally, omit node transforms only when the consumer is explicitly
legacy and therefore cannot be used for rendering.

**Command and undo implications.** Add `updateNodeTransform`, `setNodeVisibility`, and `setNodeLocked` commands with
merge keys for drag sessions. Capture exact old transform structures, including compensation, rather than inverse
floating-point operations. Keep transient drag events mergeable into one undo entry. Editor hover/drag state is
reconciled if a command locks, hides, or deletes its target.

**Automation and macro implications.** Do not introduce generic targets. Static `userNodeTransform` is persisted.
For element nodes only, an optional compatibility adapter may drive node transform fields from the existing
element-owned base bindings, but there must be one declared authority per field. Recommended migration: new canvas
edits write node transforms while old element bindings remain the content layer; do not silently copy animated
legacy channels into nodes yet. Group node transforms remain static in Phase 3.

**Compatibility strategy.** Preserve `existingElementTransform` last in the chain. Existing plugins continue to
receive unchanged props and return their existing root. Provide old `getElementBoundsAtTime()` return shape as a
thin projection of resolved records until callers migrate. Keep a development assertion that all rendering and
geometry APIs share the same frame revision/time.

**Tests and acceptance criteria.** Matrix-chain tests cover translation, pivot, rotation, scale, skew content,
inherited visibility/lock, singular imports, and deep synthetic graphs despite the product depth validator. Golden
tests prove identity node transforms match current scenes pixel-for-pixel. Interaction bounds, hit order, snapping,
selection hulls, transparent export, video/image frame parity, and perspective compositor diagnostics use the same
resolved frame. Instrument a scene with hundreds/thousands of nodes and assert one content build per visible element
per frame, not one per subsystem.

**Explicitly deferred.** User-created groups, aggregate selection transforms, nested hierarchy, node automation,
non-uniform aggregate scale, animated reparenting, and group compositing.

**Risks and failure modes.** Matrix convention mismatches can mirror/order transforms; content roots may have
element-specific bounds behavior; perspective can regress; duplicated visibility authorities can confuse users;
frame caches can leak stale geometry. Use explicit fixtures, resolver revision diagnostics, and eliminate legacy
reconstruction instead of retaining silent fallbacks.

**Definition of done.** One resolved frame drives preview, geometry, interaction overlays, snapping/hit-test inputs,
and export; element nodes have editable host transforms; identity migration preserves appearance; perspective output
is intact; inherited state is computed recursively.

**Implementation size.** Split into at least three sessions/PRs: (2A) transform math/resolver/cache; (2B) render and
perspective integration; (2C) geometry, interaction, inspector, and export convergence.

## 7. Phase 3 — multi-selection and static one-level groups

**Purpose.** Deliver the first useful grouping product: robust node-based multi-selection, static one-level groups,
aggregate transforms, tree organization, and atomic multi-node editing.

**Current constraints.** The selection store has an array but lacks active-node semantics; nearly all context/UI
APIs are singular. Canvas gestures mutate legacy element properties. The element list is flat. The inspector accepts
one plugin schema. Delete/duplicate/reorder and keyboard nudge affect one element.

**Data-model changes.** Replace or bridge `selectedElementIds` with transient `selectedNodeIds` plus
`activeNodeId`/`anchorNodeId`; active means the selection whose inspector values and alignment reference are primary,
not simply array index zero. Add transient `editingContainerId` (root by default) and tree disclosure keyed by node
ID. Keep both outside persistence. Enforce the initial graph validator policy: root groups may contain element nodes,
and groups cannot contain groups.

**Runtime/rendering changes.** Resolve group transforms recursively exactly as the final system will. Compute group
artwork bounds bottom-up from visible descendants. Build selection records for each selected node plus an aggregate
world hull/AABB and pivot. Apply translate, rotate, and uniform scale as a world delta converted back through each
selected node's parent matrix. Reject/normalize any selection containing ancestor and descendant before a transform.

**Editor and UX changes.** Add Ctrl/Cmd toggle, Shift range selection within the same displayed sibling list, click
replacement, and marquee. Define marquee direction/containment consistently and test it. Handles show the aggregate
selection box for multiple nodes and individual/group bounds for one node. Initial aggregate operations are move,
rotate, uniform scale, nudge, duplicate, delete, reorder, group, and ungroup. Snapping excludes every selected
subtree, not one element ID.

Replace `ElementList` with a node tree supporting group rows, disclosure, node visibility/lock, multi-row selection,
keyboard navigation, and canonical reorder actions. If the tree displays frontmost at top, its row list is a reversed
view of each container's back-to-front children. Dragging/reorder commands always speak canonical child indexes.

Canvas selection is parent-first outside group-edit mode. Entering a group makes its direct children selectable and
visually scopes the tree/canvas; clicking outside or an explicit breadcrumb exits. Resolve the existing text-element
double-click behavior before assigning double-click to group entry; a breadcrumb/button plus Enter key is a safe
initial mechanism. Locked ancestors disable descendant interaction. Hidden/locked descendants retain local values
when the ancestor toggles back.

Add a host node inspector for name, local visible/locked, translation, rotation, uniform scale, and pivot. A
multi-selection inspector initially shows only safe common host actions and mixed values; plugin property editing may
remain active-element-only with a clear label. Do not imply that editing one plugin panel affects all selected nodes.

**Persistence and migration changes.** No schema change beyond v12. Persist groups and node transforms, but not
selection, hover, disclosure, or edit scope. On load, default disclosure sensibly and reconcile selection to root.
Document that grouping non-contiguous siblings creates a contiguous paint block at the frontmost selected position
and can change stacking relative to intervening siblings.

**Command and undo implications.** Add atomic `groupNodes`, `ungroupNode`, `duplicateSubtrees`, `deleteSubtrees`,
`reorderNodes`, and multi-node transform commands. Commands snapshot source world matrices before structural edits.
One user action creates one undo entry. Delete group cascades through descendants, their element records, automation,
macro assignments, and runtime instances. Ungroup is the only preserve-children deletion behavior. After undo/redo,
the editor reconciler should prefer restored nodes, the created group, surviving siblings, or parent as appropriate;
it need not reproduce the exact prior hover/edit scope.

**Automation and macro implications.** Keep ownership element-specific. Static group transforms are not bindable.
Element-node transforms may use the Phase 2 compatibility bridge, but group node fields display no keyframe/macro
controls. Existing element automation continues through `existingElementTransform`, so grouping an animated element
inherits a static group parent without changing its animation. This is a deliberate milestone boundary.

**Compatibility strategy.** Flat services consume depth-first element order and ignore group records only through a
named compatibility projection. Existing element IDs remain editable; node IDs remain stable through element rename.
Missing-plugin placeholders can be selected, grouped, transformed, duplicated, and deleted like any element node.

**Tests and acceptance criteria.** Cover toggle/range/marquee/active selection, ancestry exclusion, group-edit owner
mapping, hidden/locked inheritance, non-contiguous sibling grouping and exact resulting order, world-preserving
group/ungroup under transformed parents, cascading delete versus ungroup, aggregate world transforms across
different parent spaces, snapping exclusion, and atomic undo/redo. Add visual tests for perspective elements inside
groups. Verify duplicate generates new group/node/element/channel references without aliasing originals.

**Explicitly deferred.** Nested groups, drag-to-arbitrary-parent, group automation/macros, non-uniform aggregate
scale, skew editing, group opacity/blending, clipping, folders, and animated reparenting.

**Risks and failure modes.** Users may be surprised by stacking changes; parent-first selection may feel sticky;
selection arrays may contain stale or conflicting nodes; zero-scale parents can block grouping; tree display order can
invert paint semantics; duplicate/delete can orphan bindings. Use explicit command errors, UI messaging, normalized
selectors, and invariant tests at every mutation.

**Definition of done.** Users can multi-select elements, group/ungroup them, transform static groups and aggregate
selections, manage them in a tree, and undo each action atomically. Rendering/export and all geometry agree. Only the
one-level product restriction remains.

**Implementation size.** Too large for one pass. Split into (3A) node selection and marquee; (3B) aggregate
transform interactions; (3C) group/ungroup/delete/duplicate commands; (3D) hierarchy tree and edit mode; (3E) host
inspector, lock/visibility polish, and end-to-end acceptance tests.

## 8. Phase 4 — general recursive hierarchy

**Purpose.** Remove the temporary depth restriction and make arbitrary nesting fully usable.

**Current constraints.** Phase 3's underlying graph/resolver is recursive, but validation and UX permit only one
group level. Range selection, edit scopes, duplication, and drag targets must be proven at arbitrary depth.

**Data-model changes.** Remove only the kind/depth validation rule. Retain one parent, container-only children,
stable IDs, and synthetic root. Add cached ancestor/subtree indexes and explicit cycle checks for proposed moves.

**Runtime/rendering changes.** No new transform model. Exercise arbitrary-depth world resolution, inherited
visibility/lock, descendant bounds, paint ordering, and perspective ancestry. Incremental invalidation should mark a
moved subtree and affected ancestor bounds rather than clearing unrelated plugin instances.

**Editor and UX changes.** Support nested tree disclosure, breadcrumbs, enter/exit container, recursive keyboard
navigation, subtree selection, and drag-to-reparent with before/inside/after targets. Canvas parent-first behavior
selects the nearest selectable owner at the current edit scope; group-edit exposes direct children, never arbitrary
deep click-through. Prevent dropping into self/descendants and prevent transform selections containing ancestor and
descendant. Define range selection within one sibling list; cross-parent shift ranges should either be disallowed or
use visible tree row order as a clearly separate command.

**Persistence and migration changes.** Still schema v12. Validator accepts arbitrary valid depth with a defensive
maximum traversal budget for hostile files, not a product depth constant. Disclosure/edit scope remain transient.

**Command and undo implications.** Generalize reparent, reorder, duplicate, delete, and ungroup to subtrees. Compute
all affected world transforms from one pre-command frame. Preserve static world appearance using compensation and
restore exact graph deltas on undo. Multi-node drag must remove nodes in a stable order before calculating insertion
indexes.

**Automation and macro implications.** Still element-owned. Animated element content behaves under static ancestor
groups. Animated parents are still unavailable, so reparent preservation remains well-defined for the complete
visible animation only when ancestor transforms are static.

**Compatibility strategy.** Flat consumers get a depth-first element projection. Because groups create contiguous
subtree paint blocks, no flat service may reorder that projection. Continue compatibility warnings/assertions for
any attempted `zIndex` mutation.

**Tests and acceptance criteria.** Deep-tree traversal, cycle attempts, subtree reachability, inherited flags,
recursive bounds, nested perspective, nested group edit, drag target semantics, subtree duplicate/delete/ungroup,
world-preserving cross-parent moves, and undo/redo all pass. Include randomized graph-command sequences checked
against validator invariants and large/deep scene performance tests.

**Explicitly deferred.** Animated groups, generic property ownership, animation-preserving reparent/bake, group
compositing, folders/layout/components.

**Risks and failure modes.** Accidental recursion limits, quadratic ancestry checks, stale ancestor caches, cycles,
ambiguous UI targeting, and stack overflow on corrupt imports. Prefer iterative traversal, cached intervals/ancestor
sets where justified, and command preflight.

**Definition of done.** Nesting is enabled by removing a validator/UX gate; all graph operations and interactions
work at arbitrary depth without a model rewrite.

**Implementation size.** One large Codex pass is plausible only if Phase 3 APIs are genuinely recursive. Prefer two
PRs: core recursive command/performance hardening, then nested hierarchy UX and acceptance tests.

## 9. Phase 5 — generic automation and macro ownership

**Purpose.** Make node properties first-class automation and macro targets, then enable animated groups without
encoding ownership in IDs.

**Current constraints.** `AutomationChannel` carries `elementId`/`propertyKey`; `makeChannelId()` concatenates them;
bindings live `byElement`; macro assignments and reverse indexes use element IDs; timeline rows, selected keyframes,
auto-key, overrides, duplication, deletion, rename, and inspector controls all assume element ownership.

**Data-model changes.** Introduce structured ownership:

```ts
interface PropertyTarget {
    owner: {
        kind: 'node' | 'element';
        id: string;
    };
    propertyPath: string;
}
```

Give channels independent opaque IDs and store `target: PropertyTarget`; do not derive or parse ownership from a
channel ID. Macro assignments use the same target structure. Add typed target keys only as internal map keys through
a canonical encoder that is not the source of truth. Define host node property schemas for transform, visibility,
opacity when supported, and later effects.

**Runtime/rendering changes.** Per-frame resolution evaluates node targets before composing world matrices. Build
reverse indexes from structured targets for efficient invalidation. A group animation affects descendants through
ordinary recursive resolution. Structural cache remains valid when only evaluated property values change.

**Editor and UX changes.** Generalize `KeyframeControl`, `ElementPropertiesPanel`, node inspector, automation lanes,
timeline labels, curve panes, keyframe selection, transient overrides, auto-key, and macro assignment dialogs to
accept `PropertyTarget`. Labels should disambiguate node transform from element content property. Group rows can now
expose keyframe and macro controls. Active-node semantics decide the initial timeline focus without discarding a
multi-selection.

**Persistence and migration changes.** Use a new external schema version (likely v13) because channel and macro
ownership changes. Migrate every old channel to an opaque channel ID plus `{ owner: { kind: 'element', id:
elementId }, propertyPath: propertyKey }`; rewrite keyframe bindings and selected persistent references, if any.
Migrate macro assignments/reverse indexes by structure. Preserve import support for old concatenated channel IDs but
never emit them in the new schema.

**Command and undo implications.** Generalize automation commands (`enable`, `disable`, keyframe CRUD, overrides),
macro assign/unassign, rename, duplicate, and delete cleanup to targets. Node rename does not affect target IDs;
element editable-ID rename updates structured element ownership transactionally until editable IDs themselves are
decoupled further. Deleting a subtree deletes node targets and descendant element targets atomically. Undo restores
channels, assignments, bindings, and indexes exactly.

**Automation and macro implications.** This phase is the migration. Audit `src/automation/`, scene store/gateway,
timeline automation components, `SceneSelectionContext` auto-key flow, `ElementPropertiesPanel`,
`PropertyGroupPanel`, `KeyframeControl`, `MacroConfig`, evaluator caches, and persistence together. Do not leave one
path inferring owner from `channelId`.

**Compatibility strategy.** Provide adapters accepting `(elementId, propertyKey)` for frozen plugin-facing and
internal call sites during migration, immediately constructing a structured target. The plugin SDK need not expose
scene nodes. Existing element animation remains byte-equivalent after migration. Gate group animation until all
reverse indexes and cleanup paths are target-aware.

**Tests and acceptance criteria.** Migration tests cover IDs containing dots, target round-trip, old channel
bindings, macros, reverse indexes, timeline rows, auto-key, overrides, copy/duplicate, rename/delete, undo, and mixed
node/element targets. Animate a group transform and prove descendants, bounds, hit-testing, snapping, overlays, and
export agree at multiple times.

**Explicitly deferred.** Animated reparent baking, advanced decomposition/skew policy, group opacity/compositing,
typed multi-property editing, and plugin hierarchy APIs.

**Risks and failure modes.** Partial migration can orphan channels or animate the wrong layer; ID parsing can linger
in selectors/tests; target keys can collide; animated parents make old reparent assumptions invalid. Use repository-
wide searches, schema fixtures, target constructors, and disable animated reparent until Phase 6 semantics ship.

**Definition of done.** Automation/macros use structured node-or-element ownership end-to-end, no production code
parses ownership from channel IDs, static and animated group node properties work in preview and export, and legacy
documents migrate without motion changes.

**Implementation size.** Split into at least three PRs: (5A) target/channel schema plus evaluator/store migration;
(5B) commands, timeline, auto-key, inspector, and macros; (5C) persistence migration, group animation enablement,
copy/delete/duplicate hardening.

## 10. Phase 6 — advanced transform and animation behavior

**Purpose.** Make difficult affine editing and animated hierarchy changes explicit, predictable, and reversible.

**Current constraints.** Static compensation cannot preserve an entire world-space animation when either old or new
parent varies over time. Existing element transforms include rotation, separate X/Y scales, skew, anchors, and
perspective controls; naive decomposition will lose or discontinuously rewrite them.

**Data-model changes.** Finalize transform component and matrix policies: pivot representation, rotation wrapping,
negative scale, non-uniform scale, skew axis/order, determinant epsilon, and exact compensation storage. Add baking
metadata only if needed for provenance; baked keyframes themselves remain ordinary node-target automation.

**Runtime/rendering changes.** Extend robust matrix compose/decompose utilities with error results, not silent
fallbacks. Perspective remains a post-affine element compositor; document which affine terms participate before
homography. Ensure pivot editing changes transform representation while preserving world appearance. Transform reset
must clearly choose node-only reset, content-only reset, or both.

**Editor and UX changes.** On reparent with animated old/new ancestry, offer explicit operations:

- **Preserve appearance at current playhead:** solve one static compensation at the current time; world motion may
  differ elsewhere.
- **Preserve local animation:** retain local channels/values and accept changed world motion.
- **Bake previous world-space motion:** sample/evaluate the old world motion and create new local node keyframes under
  the new parent within a chosen time range/tolerance.

Never imply that the first option preserves the whole animation. Add pivot editing, non-uniform scale/skew tools only
after their consequences are represented faithfully. Distinguish host node transform controls from plugin/content
transform controls in inspector and reset commands.

**Persistence and migration changes.** Schema changes only if transform representation changes incompatibly. Baking
uses generic target persistence. Persist enough precision for stable repeated group/ungroup operations.

**Command and undo implications.** Reparent commands include an explicit preservation mode and playhead/range
parameters. Bake is one atomic command that can add/replace many channels/keyframes and must be cancellable before
commit for large ranges. Undo restores old hierarchy and exact old channels rather than attempting a reverse bake.

**Automation and macro implications.** Define precedence when macro and automation both affect node transform
components, matching the existing binding contract where possible. Baking samples fully evaluated world motion but
must state whether transient overrides and macros are included. Recommended: bake the rendered/evaluated value with
an explicit dialog summary, then create direct keyframes and report any macro detachment required.

**Compatibility strategy.** Legacy content transform tools remain available. Default new interactions operate on
node transforms. Non-decomposable matrices stay representable through compensation even if some component fields are
temporarily read-only.

**Tests and acceptance criteria.** Cover animated old/new parents, each reparent mode, bake tolerance and time range,
round-trip decomposition, negative determinant, near-singular matrices, rotated-child non-uniform world scale,
skew, pivot preservation, reset variants, macros/overrides, perspective, undo, and export sampling parity.

**Explicitly deferred.** Clipping/group compositing, constraints/layout, reusable instances, and plugin hierarchy
extensions.

**Risks and failure modes.** Keyframe explosion, lossy decomposition, discontinuous flips/rotation, near-singular
instability, unexpected macro baking, and expensive sampling. Make policies visible, provide estimates/tolerances,
and preserve exact pre-command data for undo.

**Definition of done.** All hierarchy changes involving animation require an explicit semantic choice; difficult
affine transforms are either faithfully editable or explicitly restricted; bake produces reproducible preview/export
motion; transform reset and node/content ownership are unambiguous.

**Implementation size.** Definitely split: transform math/policies; advanced handles/inspector; animated reparent
choices; baking/performance and acceptance tests.

## 11. Phase 7 — advanced scene-graph features

**Purpose.** Extend the stable hierarchy with organization, compositing, layout, reuse, typed bulk editing, and safe
future plugin surfaces without conflating their semantics with ordinary transform groups.

**Current constraints.** Existing `ClipLayer` and `CompositeLayer` are render-object implementation details, not
host scene containers. Perspective has a specialized offscreen compositor. Ordinary groups merely inherit
transforms/state and create a contiguous paint subtree; they do not automatically define a bitmap/compositing
boundary.

**Data-model changes.** Add distinct container capabilities or kinds rather than boolean soup:

- **Transform group:** hierarchy, inherited transform/visibility/lock, contiguous ordering; no offscreen surface.
- **Folder:** organization-only tree container; either forbidden from changing paint contiguity or explicitly
  documented to do so. Recommended: folders still own ordered contiguous children but have identity transform and
  no canvas selection/automation.
- **Clip/mask group:** identifies clip source/mask and clipped children with precise paint and hit-test rules.
- **Composite group:** opacity, blend mode/isolation, filters/effects, and an explicit offscreen surface boundary.
- **Layout/constraint container:** owns solver inputs and generated child transforms separately from user transforms.
- **Component/sub-scene definition and instance:** stable definition IDs, override maps, asset/plugin dependencies,
  and cycle-safe instance expansion.

Capabilities may share `SceneContainerNode`, but persistence and resolver payloads must remain discriminated so a
plain group never accidentally incurs compositing/layout semantics.

**Runtime/rendering changes.** Build a render-plan layer from the resolved scene: direct paint runs for transform
groups, offscreen passes for composite/clip/effect boundaries, and explicit perspective leaf passes. Group opacity
without offscreen composition is not equivalent when children overlap; therefore true group opacity requires one
isolated surface. Blend isolation, masks, effects, and nested perspective require a render-pass graph, pooled
surfaces, size limits, color/alpha policy, and export parity. Layout/constraints evaluate before world resolution and
must expose generated versus authored transforms.

**Editor and UX changes.** Provide distinct create actions/icons and inspectors for folder, group, mask, composite,
layout, component, and instance. Add typed multi-selection property editing by intersecting compatible host/plugin
property descriptors, showing mixed/unavailable states, validating units/ranges, and issuing atomic target-aware
commands. Do not bulk-edit properties merely because paths share a string.

**Persistence and migration changes.** Version each new discriminated node/capability as introduced, not all at
once. Copy/paste and cross-document import use a portable `SceneSubtreeBundle` containing node/element records,
property targets/channels, macro assignments or references, plugin dependencies, and referenced visual/font/audio/
MIDI assets. Import performs a two-pass remap:

1. Allocate collision-free node, element, channel, macro (when copied), component, and asset IDs.
2. Rewrite every parent/child, element-node, target, binding, macro, mask, component, track, and asset reference,
   validate the detached bundle, then attach atomically.

Define whether macros/assets are shared by content hash, linked by existing ID, or duplicated; never guess by parsing
IDs. Cross-document import should report unresolved plugin and track references while retaining placeholder nodes.

**Command and undo implications.** Each feature needs graph-native atomic commands and exact persistent inverses.
Offscreen/effect edits do not belong in renderer-local state. Component propagation and constraint solving need
explicit document mutations or deterministic derived results so undo remains understandable.

**Automation and macro implications.** Generic `PropertyTarget` extends naturally to composite opacity/effects,
layout parameters, and instance overrides. Define which derived/generated values are bindable. Component definition
animation versus instance override animation requires separate target kinds rather than overloaded node IDs.

**Compatibility strategy.** Plugins continue to return element content and cannot mutate graph ownership. A future
plugin API may read a limited immutable hierarchy context (node ID, effective transform/state, container capability)
or register typed host-managed properties/effects. It must not let plugins create parents, reorder siblings, retain
mutable node references, or bypass command/validation/persistence. Older plugins remain ordinary element leaves.

**Tests and acceptance criteria.** Each capability gets schema, command, resolver, interaction, undo, preview/export,
copy/import, missing-plugin, and performance tests. Pixel tests cover overlapping child opacity, blend isolation,
nested masks, effect bounds expansion, nested perspective/offscreen passes, and transparent export. Component tests
cover reference cycles and override remapping; layout tests cover determinism and conflict handling.

**Explicitly deferred.** Ship these as separate product projects. Do not bundle all advanced capabilities into one
release or make Phase 3 groups wait for them.

**Risks and failure modes.** Offscreen memory/GPU pressure, ambiguous folder ordering, mask/effect bounds errors,
component cycles, nondeterministic constraints, plugin privilege creep, and enormous cross-document bundles. Use
typed capabilities, render-pass diagnostics/budgets, cycle validation, deterministic solvers, and transactional
imports.

**Definition of done.** The architecture can add each advanced feature without changing the fundamental graph,
target, resolver, command, or undo contracts; ordinary groups remain cheap and semantically simple; compositing and
layout features are explicit.

**Implementation size.** Not one phase-sized pass. Treat folders, clipping/masks, composite groups/effects,
layout/constraints, components, typed bulk editing, and plugin API exposure as independent epics, each split into
model/runtime, UX, and persistence/test PRs.

## 12. Ordering and `zIndex` retirement

Use graph children in back-to-front order and assign a monotonically increasing `paintIndex` during depth-first
traversal. A container subtree is a contiguous paint interval. This invariant enables fast ancestry-aware ordering,
hit-testing, and subtree moves.

Migration path:

1. In Phase 1, derive root child order from the current effective flat order and continue projecting sequential
   `zIndex` bindings for legacy consumers if necessary.
2. Stop sorting graph traversal from evaluated `zIndex`. Any legacy `zIndex` edit is translated into a graph reorder
   command, with a warning/deprecation marker; it never directly overrides traversal.
3. Move first-party UI reorder actions entirely to graph commands and remove `zIndex` from the common host inspector.
4. Deprecate scene-level `zIndex` in built-in/plugin base schema. Keep reading it for old documents/plugins as a
   migration hint, but ignore it after node order exists.
5. In a later plugin API version, remove `zIndex` as a host scene-order property. Plugin-internal render-object order
   remains valid inside an element.

Tree rendered order is a view choice. If product design wants frontmost rows at top while persisted children are
back-to-front, selectors provide `getDisplayChildren(containerId)` and translate drop positions. Never persist both.

## 13. Document-state and editor-state reconciliation

Persistent document state includes nodes, local flags, transforms, group names, child order, elements, bindings,
automation, macros, and referenced assets. Transient editor state includes selection, hover, active handles, marquee,
group-edit scope, tree disclosure, property tab/collapse state, search, and clipboard residency. Disclosure could be
remembered in local workspace preferences keyed by document/node, but should not travel in `.mvt` files or undo.

After every persistent command and undo/redo, run a pure reconciliation step:

- Remove selected/hovered/editing IDs that are absent, unreachable, effectively hidden/locked where relevant, or
  invalid for the active edit scope.
- Remove descendant selections when an ancestor is selected; prefer the explicit active node or the shallowest
  selected owner according to the initiating gesture.
- If the edit container vanished, walk its captured ancestor chain to the nearest surviving container, else root.
- If active selection vanished, prefer a command result hint (new group/duplicate), then nearest surviving sibling,
  then parent, else clear.

This produces sensible UX while keeping undo concerned with exact document restoration. Command results can provide
non-persistent `editorHints`; those hints must not be required to replay the persistent patch correctly.

## 14. Copy/paste and cross-document import contract

Phase 3 needs in-document subtree duplication; portable copy/paste can ship late in Phase 3 or Phase 4, but its data
shape should be designed before duplication code hardens. A bundle should include selected top-level subtrees only
(drop selected descendants whose ancestor is also selected), preserve relative paint order, and capture referenced
elements, channels/bindings, macro assignments, plugin dependencies, and assets.

Within the same document, duplicate node and element IDs and duplicate owned automation channels. Macro definitions
can normally remain shared while assignments point to the new targets; offer “duplicate macros” only as an explicit
future option. Across documents, reconcile macros by stable ID plus content/type or allocate new IDs on conflict.
Assets should deduplicate by content hash when supported, otherwise allocate and rewrite. Track references require an
explicit unresolved/reference mapping policy. Missing plugins do not block paste: preserve the element record and
create the normal placeholder leaf.

Paste/import validates the detached remapped graph before one atomic attach command. Failure must leave graph,
elements, automation, macros, and asset registries unchanged. Undo removes the imported subtree and any newly created
unreferenced assets/macros according to ownership/reference-count policy.

## 15. Recommended implementation pull requests or Codex sessions

1. **1A — Graph core:** types, matrix serialization, synthetic root, recursive traversal/indexes, validator, and
   invariant tests.
2. **1B — Graph-backed document commands:** transactional draft/patch mechanism, add/remove/reorder/rename/duplicate
   conversion, editor reconciliation, and exact undo tests.
3. **1C — Schema v12:** v11 migration, import/export/validation/`DocumentGateway`, templates and fixtures, derived flat
   compatibility order.
4. **2A — Resolver foundation:** structural cache, per-frame records, plugin instance/content integration, transform
   math, inherited state.
5. **2B — Rendering and perspective:** renderer consumes resolved paint entries; perspective ancestry and export
   parity.
6. **2C — Unified geometry:** bounds, hulls, hit-testing, snapping, overlays, and handles consume the same frame;
   remove independent reconstruction.
7. **2D — Host node transform UI:** single-node handles/inspector commands, compatibility labels, singular guards.
8. **3A — Node multi-selection:** active node, toggle/range/marquee, ancestry normalization, multi-outline UX.
9. **3B — Aggregate transforms:** world-space move/rotate/uniform scale, pivot, snapping, keyboard nudges, undo merge.
10. **3C — One-level group commands:** group/ungroup/reorder/delete/duplicate with compensation and stacking warnings.
11. **3D — Hierarchy UX:** tree, visibility/lock, disclosure, breadcrumbs, parent-first selection and group-edit mode.
12. **3E — Product hardening:** portable subtree clipboard/import groundwork, missing plugins, perspective, large-scene
    performance, and end-to-end tests.
13. **4A/4B — Recursive release:** remove depth restriction, harden arbitrary-depth commands/cache, then nested drag,
    navigation, and subtree UX.
14. **5A–5C — Generic targets:** schema/evaluator/store; UI/commands/macros; persistence/copy/group animation.
15. **6A–6D — Advanced transforms:** policies/math; tools; animated reparent semantics; bake/performance.
16. **7.x — Independent advanced epics:** folders, masks, composite/effects, layout, components, typed bulk editing,
    then constrained plugin hierarchy APIs.

Phases 1–3 should use feature flags or internal compatibility adapters between PRs, but no merged PR should leave
two writable ordering authorities or a renderer and geometry resolver that knowingly disagree.

## 16. Smallest useful product milestone

The smallest useful release is the completion of Phase 3: schema-v12 graph documents, a single resolved-scene
pipeline, node multi-selection, aggregate move/rotate/uniform scale, static one-level groups, hierarchy tree,
group-edit mode, inherited lock/visibility, atomic undo, and preview/export parity. Shipping only Phase 1 is valuable
infrastructure but not a user-facing grouping feature; shipping grouping before Phase 2 would multiply transform and
geometry bugs.

## 17. Ideal final architecture

The ideal system has one validated persisted graph and one command gateway for document mutation. A structural index
turns that graph into cached ancestry, paint, and lookup data. A per-frame evaluator resolves structured node/element
property targets, recursively composes transforms/state, asks each plugin leaf for content once, and emits one
`ResolvedSceneFrame`. Render planning, perspective/offscreen composition, bounds, hit-testing, snapping, selection,
handles, preview, and export are consumers of that frame. Editor state is transient and reconciled after exact
document undo/redo. Plugins own leaf content and typed properties; the host exclusively owns hierarchy, ordering,
selection semantics, transforms around content, compositing boundaries, and persistence.

## 18. Unresolved product decisions requiring human judgment

1. Should the hierarchy tree display frontmost-first (common layer-panel convention) or canonical back-to-front?
2. What exact gestures enter/exit group-edit mode, given double-click currently enters text property editing?
3. Should marquee select by full containment, intersection, or direction-dependent behavior?
4. When Shift-range endpoints have different parents, should the action be blocked or follow visible tree rows?
5. Should clicking effectively locked artwork select the nearest unlocked ancestor, or pass through entirely?
6. Should element-node visibility replace the existing plugin `visible` control in UI, or should both remain exposed
   as “node visibility” and “content visibility”?
7. What pivot is used for new groups: selection bounds center, active node pivot, canvas point, or a user preference?
8. Should grouping across different parents be prohibited until explicit reparent UX, or first normalize them to a
   common ancestor? This plan recommends same-parent grouping initially.
9. For non-uniform aggregate scaling, should MVMNT allow generated skew, preserve an opaque exact matrix, or restrict
   the operation?
10. Are negative node scales supported as first-class flips, and how should rotation/handle orientation display?
11. What time range, sample rate, simplification tolerance, and macro/override inclusion should animated reparent
    baking default to?
12. Should folders create contiguous stacking blocks, or be a non-ordering organizational overlay? The latter would
    require a second non-scene hierarchy and is intentionally not assumed here.
13. On cross-document paste, are macros/assets shared, deduplicated, or always cloned, and how are unresolved timeline
    track references presented?
14. Which group compositing semantics ship first: opacity/isolation, masks, blend modes, or effects, and what
    offscreen memory limit is acceptable?
15. How much immutable hierarchy context, if any, should a future plugin SDK expose?

## 19. Verification required after every phase

Run the repository-mandated commands after each implementation phase or PR and do not accept a phase with failures:

```sh
npx prettier --write .
npm run test
npm run build
npm run compile
```

In addition, each phase should run its focused graph, persistence, resolver, interaction, perspective, undo, and
export tests during development. If tests fail because the optional Rollup native dependency is missing, run
`npm install` and rerun `npm run test` as directed by the repository instructions.
