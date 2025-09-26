# Store Migration Briefing for Legacy Scene Builder Veterans

This note is meant for folks who lived and breathed the pre-store scene builder. It walks through every chunk of migration work we have shipped so far and frames the new architecture in terms of the legacy concepts you already know. If you remember how the builder held state but have not yet read the Zustand code, this is your map.

## 0. Legacy Baseline (Why We Moved)

The old pipeline centered on `HybridSceneBuilder`. It owned element arrays, macro bindings, and serialization logic. UI panels poked the builder directly and undo/redo wrapped its mutation methods. Persistence (`DocumentGateway`) grabbed data from the builder, and the runtime stitched together renderable objects from builder state.

That design gave us:

- **Mutable singleton state**: every panel mutated the same instance, so accidental writes were common.
- **Implicit bindings**: macro/property links were buried inside builder element classes; asking "who consumes macro X" required iterating live objects.
- **Tight coupling to rendering**: the visualizer and command menus all assumed the builder existed and was current.
- **Difficult testing**: unit tests had to spin up the builder (and sometimes a WebAudio mock) to exercise even basic flows.

The store migration replaces the builder as the source of truth with a normalized Zustand store while we keep the builder around only as a compatibility shim.

## 1. Phase 0 – Audit & Guard Rails

- Catalogued every direct builder mutation and introduced a lint script (`scripts/check-scene-builder-usage.mjs`) so new code can no longer call into builder mutators unchecked.
- Added `snapshotBuilder` utilities and regression fixtures (`scene.edge-macros.json`) so we can diff serialized scenes before/after store updates.

**Old-world translation**: think of this as putting a logger in front of every `HybridSceneBuilder` call so we can observe and eventually replace them.

## 2. Phase 1 – Store Scaffolding

- Built `sceneStore.ts` which normalizes element metadata, binding maps, macro dictionaries, and interaction state.
- Shipped selector factories (`createSceneSelectors`) and hooks (`useSceneElements`, `useSceneSelection`) to replace direct `builder.elements` and `builder.getElement` reads.
- Acceptance coverage now confirms we can import/export fixtures entirely through the store without touching the builder.

**Legacy mapping**: where you previously grabbed `builder.elements`, you now call `useSceneElements()` and get stable projections with bindings unpacked.

## 3. Phase 2 – Command Gateway Dual-Write

- Introduced `dispatchSceneCommand` as the single entry point for scene mutations.
- The gateway still invokes builder mutators (for compatibility) but mirrors the result into the store and enforces parity checks.
- Undo middleware wraps gateway commands so history replay stays in lockstep with the store.

**Legacy mapping**: anything that used to call `builder.addElement` now sends `{ type: 'addElement', ... }` into the gateway. The builder still runs, but only so that older UI pieces do not crash.

## 4. Phase 3 – UI Hook Migration

- Layer panel, selection context, and macro panels were wired to selectors/hooks instead of reading builder state directly.
- Store-backed selection (`setInteractionState`) became the canonical source for which element is highlighted.

**Legacy mapping**: the UI still needs builder objects for schema lookups, but the *identity* of the selection comes from the store.

## 5. Phase 4 – Runtime Adapter

- `SceneRuntimeAdapter` hydrates lightweight render models directly from store bindings, with revision tracking for partial invalidation.
- Visualizer uses the adapter first and only falls back to the builder if hydration fails.

**Legacy mapping**: instead of instantiating render nodes off `builder.serializeScene()`, the runtime reads normalized state from Zustand and caches hydrated nodes.

## 6. Phase 5 – Macro Consolidation

- Macro definitions live inside the store; hooks expose macro lists and inverse indices.
- A fuzz test (`macroIndex.fuzz.test.ts`) pounds the binding index to guarantee referential integrity.
- Macro context now dispatches gateway commands so undo/redo and parity checks apply to macros as well.

**Legacy mapping**: `globalMacroManager` still exists but acts as a thin facade that mirrors store state into the legacy binding layer.

## 7. Phase 6 – Persistence & Templates

- `DocumentGateway` reads/writes store payloads and then syncs the builder as an optional compatibility step.
- Scene templates hydrate the store and then optionally run commands to keep the builder in sync.
- Regression coverage ensures we can apply documents even when the builder is absent.

**Legacy mapping**: exports no longer serialize live builder element instances; they serialize the normalized store data directly.

## 8. Phase 7 – Deprecation & Cleanup (In Flight)

Completed so far:

- The store-backed UI and macro pathways are now the only code paths. The feature flags that used to guard them have been removed, and the panels always read from selectors instead of falling back to builder state.
- Macro tooling (property panels, macro config dialog, macro context) relies exclusively on the store for listings and assignment lookups while still updating the legacy macro manager for runtime compatibility.
- Selection context always drives interaction state through the store, eliminating the "legacy selection" shadow state.

Next steps:

- Collapse `dispatchSceneCommand` dual-write once we introduce store-native element creation (defaults, schema-driven config) so builder mutations become optional.
- Provide store-backed schema lookup helpers so property panels no longer need builder instances.
- Remove the builder dependency from undo middleware and the visualizer, then delete the builder entirely after parity soak.

## Where Element Properties Live Now

In the builder days, element properties were scattered across per-element instances with getter/setter wrappers. In the store world:

- Each element has an entry in `state.bindings.byElement[elementId]` containing property bindings.
    - A constant property is stored as `{ type: 'constant', value: <primitive|object> }`.
    - A macro-bound property is `{ type: 'macro', macroId: 'macro.name' }`.
- The inverse map `state.bindings.byMacro[macroId]` lists every `{ elementId, propertyPath }` pair that consumes a macro.
- Raw element metadata (id, type, creation info) lives in `state.elements[elementId]`, while ordering is tracked by `state.order`.
- Derived selectors (e.g., `useSceneElements`) combine the metadata and bindings to produce view models for panels.

When UI panels mutate a property, they still call the command gateway so that the store updates first. The gateway mirrors the change into `globalMacroManager` and the legacy builder (for now) to keep runtime adapters and undo stacks happy. In short: the store holds the canonical property data; legacy structures are updated as consumers transition off of them.

---

If you need a mental model: treat Zustand as the new authoritative database, the command gateway as the transaction layer, and the builder/macro manager as temporary read replicas that we will retire once every consumer points at the database.
