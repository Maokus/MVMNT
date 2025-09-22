# Store Migration Exposition (v1)

## 1. Purpose & Executive Summary

Your current architecture splits authoritative scene + macro data across (a) in‑memory runtime objects (e.g. `HybridSceneBuilder`, `SceneElement` instances, macro manager singleton) and (b) partial persisted / serializable representations (document gateway + undo snapshots). This divergence increases coupling, complicates feature work (selection, undo/redo enrichment, multi‑tab, collaborative editing, diffing), and makes UI refactors risky because data flows are implicit and side‑effectful.

Goal: converge on a single _authoritative_ source of truth for document/scene state inside a normalized Zustand store slice (or set of slices), while retaining performant render‑time objects and avoiding catastrophic regressions in export / playback.

This document inventories how scene element & macro data are currently referenced, highlights migration risks, and proposes concrete strategies & phased steps to complete the transition.

---

## 2. Current Data Components (High-Level)

| Concern                                             | Current Location                                                           | Notes                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Scene element list & ordering                       | `HybridSceneBuilder.elements` (array) + internal `elementRegistry`         | Primary runtime source; UI queries directly via contexts.                |
| Element identity & config                           | Instance fields + `SceneElement.bindings` map                              | Binding system wraps raw values or macro references.                     |
| Macro definitions / values                          | `globalMacroManager` (singleton `MacroManager`)                            | Not in store; listeners invalidate element caches.                       |
| Macro → element property linkage                    | Each `SceneElement.bindings` entry may be a `MacroBinding`                 | No central index; discovered by scanning elements.                       |
| Scene settings (fps, width, height, tempo fallback) | `HybridSceneBuilder.config`                                                | Only partially authoritative; timeline store overrides tempo/meter.      |
| Timeline musical authority (BPM, tempo map, meter)  | Zustand `timelineStore` slice (`timeline`, `tracks`, tempo map)            | Used by builder to compute max duration.                                 |
| Serialization (save/export/undo)                    | `sceneBuilder.serializeScene()`, `DocumentGateway.build()`                 | Pull pattern; runtime queried on demand.                                 |
| Undo snapshots                                      | Timeline store instrumented; scene pulled ad hoc via gateway               | Scene mutations outside store are opaque to diffing/time travel.         |
| UI selection & editing                              | React contexts (`SceneSelectionContext`, etc.) referencing runtime objects | Direct instance mutation via element setters / builder methods.          |
| Export pipeline                                     | `MIDIVisualizerCore` pulls elements via builder each frame                 | Requires fast, immutable-ish access to element transform + render logic. |

---

## 3. Core Scene Data Structures (From Code)

-   `SceneElement` (base) holds: `type`, `id`, `bindings: Map<string, PropertyBinding>` (wrapping constants or macros). Provides getters (`visible`, `zIndex`, transform suite) whose values are cached + invalidated on binding/macro change.
-   Binding Layer: `ConstantBinding` / `MacroBinding` → serialized as `{ type: 'constant', value }` or `{ type: 'macro', macroId }`.
-   Serialization of element: `getSerializableConfig()` emits id/type plus serialized bindings for _all_ properties (including base transform & visibility). Angles stored in radians internally but UI / serialization presents degrees when constant.
-   `HybridSceneBuilder` functions:
    -   Identity & storage: `elements[]`, `elementRegistry`.
    -   CRUD: `addElementFromRegistry`, `removeElement`, `duplicateElement`, `updateElementId`, `moveElement`.
    -   Bulk ops: `clearElements`, `loadScene`, `serializeScene`.
    -   Macro queries: `getAllMacroAssignments()` scans each element’s bindings.
    -   Duration derivation: `getMaxDuration()` consults timeline store (tracks + tempo map) + each element’s internal midi manager reference.
-   `MIDIVisualizerCore` consumes builder to produce render objects every frame; interaction subsystem queries bounding boxes via element methods.
-   Templates: `scene-templates.ts` rebuilds canonical sets (default, debug, all-elements) by mutating a builder instance.

---

## 4. Workspace / UI Usage Map

| Layer                   | Access Pattern                                                                                                             | Mutation Path                                                                                                                       | Observations                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SceneSelectionContext` | Reads `sceneBuilder.elements` directly; sorts for z‑display                                                                | Calls builder: `updateElementConfig`, `duplicateElement`, `removeElement`, `updateElementId`; also calls element setters indirectly | State is ephemeral & decoupled from persistence. Selection kept in React only, sync'd to visualizer interaction state. |
| `SceneContext`          | Manages `sceneName`, delegates menu actions that ultimately call builder serialization/loading through gateway             | `saveScene`/`loadScene` rely on gateway → builder                                                                                   | Name & document metadata not unified with scene store yet.                                                             |
| `MacroContext`          | Reads global macro manager list                                                                                            | Macro manager methods                                                                                                               | No store involvement; macros can't be time-travelled or diffed natively.                                               |
| Undo system             | Instruments timeline store only; uses `DocumentGateway.build({includeEphemeral})` to embed scene snapshot at snapshot time | Replay uses `DocumentGateway.apply` which calls `sb.loadScene()`                                                                    | Undo must re-hydrate runtime objects; lacks granular diff (always full scene).                                         |
| Export UI / Visualizer  | Uses runtime `visualizer.sceneBuilder` per frame                                                                           | Mutations come from contexts; visualizer observes indirectly by invalidated render                                                  | Frame loop expects object graph; cannot afford expensive store-to-object re-materialization each frame.                |

---

## 5. Macro Flow (Current)

1. Creation: `globalMacroManager.createMacro(name, type, defaultValue)` — stored in manager map.
2. Binding: `SceneElement.bindToMacro(propertyKey, macroId)` swaps a constant binding with `MacroBinding` referencing macro id.
3. Value propagation: Macro manager updates → notifies listeners → each `SceneElement` invalidates caches for macro‑bound properties.
4. Serialization: Elements serialize macro binding metadata; macros serialized separately by `MacroManager.exportMacros()`.
5. Loading: `loadScene` imports macro bundle first, then reconstructs elements which recreate macro bindings.

Pain Points:

-   No inverse index: to find all elements using a macro you must scan every element (O(n \* p)).
-   Macro lifetime external to store; can lead to temporal incoherence if elements commit to store later (ordering / transaction issues).
-   Undo snapshots cannot easily represent macro changes separately from element structure changes without rebuilding full scene state.

---

## 6. Identified Architectural Friction / Anti-Patterns

1. Split Authority: Scene structure lives outside Zustand; timeline and scene diverge conceptually (tempo vs. sceneSettings tempo fallback logic).
2. Pull Serialization: Persistence code _queries_ runtime graph instead of deriving runtime from persisted state; inversion complicates migrating to store-first.
3. Hidden Side Effects: Builder constructor subscribes to timeline store to invalidate duration cache; scene templates re-create macros implicitly.
4. Runtime Mutation via Instances: UI calls `element.setZIndex(...)` etc., bypassing any centralized action log, impeding deterministic replay/testing.
5. Non-Normalized Shape: Element bindings & config live deep in object instances; no O(1) lookup by id without holding entire object.
6. Macro Manager Isolation: Macro changes not integrated into undo or future multi-user scenarios.
7. Selection & Interaction Duplication: Interaction state partly in visualizer (`_interactionState`), partly in React context; synchronization logic is ad hoc.
8. Duration Calculation Temporal Coupling: `getMaxDuration()` recomputes via track + element graph each time; a store-first model could precompute or memoize centrally.
9. Lack of Incremental Diff: Any persistence or undo step currently re-serializes whole scene (performance risk for large scenes).

---

## 7. Migration Challenges (Detailed)

| Challenge                     | Description                                                                                                                                                             | Impact if Mishandled                        | Mitigation Ideas                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity Preservation         | Current element instances hold methods & cached state; replacing with plain objects may break render loop expecting instance methods                                    | Visual glitches, interaction errors         | Introduce adapter layer: plain store models → lightweight ephemeral instances regenerated only when dirty (object pool).                             |
| Performance & GC Pressure     | Reconstructing full element class objects on each store change could cause frame drops                                                                                  | FPS degradation, stutters                   | Structural sharing + diffing: only recreate instance when its binding set or high-level transform changed.                                           |
| Macro Binding Semantics       | Macro binding objects currently carry logic (getValue triggers macro manager). Store model must represent binding in serializable shape without losing lazy resolution. | Wrong values, stale UI, lost bindings       | Store binding = pure data; runtime adapter resolves value each frame using macro map in store.                                                       |
| Undo Granularity              | Transitioning scene into store means undo now needs to snapshot or patch scene slice efficiently                                                                        | Bloated memory, slow undo                   | Use action-based command log + inverse patches; or leverage Zustand middleware for per-element diff patches.                                         |
| Derived Duration & Timing     | Builder caches duration; moving to store requires new memoization strategy integrated with timeline slice updates                                                       | Regressed performance or stale maxima       | Keep a derived selector that hashes track/template relevant keys (like existing signature) & memoizes.                                               |
| Serialization Order           | Load currently: macros → elements. With unified store updates need atomic transaction semantics to avoid elements referencing missing macros mid-apply                  | Transient errors or fallback constants      | Apply document in two-phase store transaction: set macros slice, then scene elements slice, then emit 'scene-ready'.                                 |
| Interaction State Coupling    | Visualizer caches selection & handles computed from runtime objects                                                                                                     | Selection lost or inconsistent hover states | Move interaction state to store slice; visualizer subscribes; derives overlay painting data from ephemeral adapter objects referencing store.        |
| Angle Unit Conversions        | Current code converts degrees ↔ radians asymmetrically depending macro vs constant binding                                                                              | Incorrect transforms                        | Normalize store to canonical internal units (radians) + UI selectors provide conversion; macro values flagged with unit metadata if storing degrees. |
| Template Rebuild Side-Effects | Templates re-create macros and elements blindly (clear + add)                                                                                                           | Duplicate macros, lost references           | Template functions return pure lists (data), not mutate; a store action applies diff (add/update/remove).                                            |
| Mixed Fallback Tempo          | SceneSettings tempo used only when timeline BPM absent; ambiguous source of truth                                                                                       | Inconsistent playback pacing                | Declare timeline BPM authoritative; remove tempo from scene slice or mark deprecated.                                                                |

---

## 8. Target Unified Data Model (Proposed)

```ts
// store.scene slice (normalized)
interface SceneSlice {
    version: number; // schema version
    settings: { fps: number; width: number; height: number }; // visual-only
    elementIds: string[]; // z-order = ascending or store separate ordering[]
    elements: { [id: string]: SceneElementModel };
    macros: { [name: string]: MacroModel };
    // fast inverse index for macro→element bindings
    macroBindingsIndex: { [macroId: string]: Array<{ elementId: string; property: string }> };
    selection: { elementId: string | null; multi?: string[] };
    interaction: { hoverId: string | null; draggingId: string | null; activeHandleId: string | null };
    dirtyFlags: { [id: string]: number }; // incrementing version for each element
}

interface SceneElementModel {
    id: string;
    type: string;
    bindings: { [prop: string]: BindingData }; // purely serializable
    // optional cached layout metrics (store or derived?) likely keep out of store unless needed for time-travel
}

interface BindingData {
    kind: 'constant' | 'macro';
    value?: any; // constant value (internal canonical units)
    macroId?: string; // ref
    // meta: optional { unit: 'deg' | 'rad' } if storing degrees for UI macros
}

interface MacroModel {
    id: string; // name for compatibility
    type: MacroType;
    value: any;
    defaultValue: any;
    options: any;
    createdAt: number;
    lastModified: number;
}
```

Key Principles:

-   All authoritative values are plain serializable JSON.
-   Runtime render objects are derived (adapter pattern) and never mutate store directly; they dispatch actions.
-   Macro resolution performed by selectors or by adapter that merges macro value into computed property set.
-   Inverse index maintained incrementally on binding mutations for O(1) macro re-bind queries.

---

## 9. Migration Strategies (Alternative Approaches)

### Strategy A: Big-Bang Store Rewrite (NOT RECOMMENDED)

Re-implement builder & macro manager entirely as a set of store actions/selectors, then rewrite visualizer to consume store. High risk: long freeze, large regression surface.

### Strategy B: Shadow Store (Dual-Write → Cutover)

1. Introduce new scene slice that mirrors builder state (write-through adapter).
2. Wrap all builder mutators (`addElement`, `updateElementConfig`, etc.) so they also update store models.
3. Build new UI components that read only from store (selection panel, property editors) while legacy visualizer still uses builder.
4. Add consistency assertions (dev mode) diffing builder vs store snapshots.
5. Once parity achieved, invert responsibility: builder becomes ephemeral facade that _reads_ from store to materialize instances (read-only). Remove dual-write.
   Pros: Incremental, testable. Cons: Temporary duplication overhead.

### Strategy C: Builder as Pure Adapter over Store (Phased Refactor)

1. Freeze public API of `HybridSceneBuilder` and reimplement its internal storage as thin wrappers around store selectors & dispatches (maintain method signatures).
2. Replace direct array mutations with computed selectors (`getAllElements()` maps store models to ephemeral SceneElementAdapters).
3. Gradually delete old fields (`elements`, `elementRegistry`).
   Pros: Cleaner, avoids dual source. Cons: Big internal change early; risk to existing runtime consumers.

### Strategy D: Command/Event Sourcing Layer

Introduce a central `dispatchSceneCommand(cmd)` that both updates store and optionally mutates builder until builder fully removed. Enables logging, undo via inverse commands, remote collaboration later.
Pros: Scales to collaboration & replay. Cons: Larger upfront complexity.

Recommended Blend: Start with Strategy B (shadow dual-write) to gain safety, then transition into Strategy C + D (commands) for long-term extensibility.

---

## 10. Phased Plan (Actionable)

| Phase                      | Goals                        | Key Tasks                                                                                                                                           | Exit Criteria                                                                                    |
| -------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 Prep                     | Safety nets                  | Add dev assertion util comparing builder snapshot vs prospective store model; add test fixtures for serialize/deserialize roundtrip                 | CI passes with baseline snapshot tests                                                           |
| 1 Shadow Slice             | Introduce `sceneStore` slice | Define normalized types; add actions: addElement, updateBindings, moveElement, duplicateElement, deleteElement, updateSettings, macros CRUD         | Store slice mirrors builder after any UI action (dev assertion: deepEqual sans transient fields) |
| 2 Dual-Write Wrappers      | Centralize mutations         | Wrap builder mutators to call store actions; prohibit direct element instance setter use in UI (lint rule / codemod)                                | No UI code calls element setter directly (except through sanctioned adapter)                     |
| 3 Store-First UI           | Refactor panels              | Scene element list, selection, properties read from store selectors (builder access removed)                                                        | Disabling builder access does not break UI; tests updated                                        |
| 4 Adapterized Visualizer   | Runtime consumption          | Implement `SceneRuntimeAdapter` that maps store models → ephemeral cached SceneElementRuntime objects with lazy property resolution & macro merging | Visualizer switched to adapter; builder methods internally delegate to store; old arrays removed |
| 5 Undo & Macro Integration | Full cohesion                | Move macro manager into store slice (`macros`); macro updates dispatch actions & patch inverse index; integrate with existing undo middleware       | Undo/redo covers macro value change & element structural changes                                 |
| 6 Deprecation & Cleanup    | Remove legacy                | Delete legacy builder fields; remove serialization via builder (gateway reads store); add migration script for old saved docs if schema changed     | All tests green; bundle size diff acceptable; profiling shows no FPS regression                  |

---

## 11. Detailed Design Elements

### 11.1 Runtime Adapter Caching

Maintain map `runtimeCache: Map<string, SceneElementRuntime>` keyed by element id. Each runtime object stores `version` (from store `dirtyFlags[id]`). When store `dirtyFlags[id]` increments → rebuild object. This avoids reallocation every frame.

### 11.2 Macro Resolution

Selector `selectResolvedElementProperties(id)` returns merged property map:

1. Read element bindings
2. For each binding: if macro kind → pull macro value
3. Apply unit conversion (degrees→radians) at the final resolved stage only.

### 11.3 Inverse Macro Index Maintenance

Actions that set a binding:

-   Remove old mapping if changed from macro to constant (update index list: splice out entry)
-   Add new mapping if macro binding → push to index
-   Provide dev-only validation pass to ensure index matches a recomputed scan.

### 11.4 Undo Implementation Shift

Use patch recording middleware (capture diff of `sceneSlice.elements`, `sceneSlice.macros`, `sceneSlice.elementIds`). Each scene action emits patch + inverse patch. Undo stack integrates with existing snapshot controller or replaces part of it. Optionally unify timeline + scene into a multi-slice patch transaction per command.

### 11.5 Serialization Gateway Refactor

`DocumentGateway.build()` becomes pure store read (no builder). Shape:

```ts
scene: {
  version: sceneSlice.version,
  settings: sceneSlice.settings,
  elements: elementIds.map(id => ({ id, type, bindings })),
  macros: macrosExportObject,
}
```

`apply()` dispatches batch action: `importScene({ settings, elements, macros })` which populates slices; runtime adapter warms cache lazily.

### 11.6 Template Purification

Return `SceneTemplateData`:

```ts
interface SceneTemplateData {
    settings: Partial<Settings>;
    elements: Array<{ id: string; type: string; bindings: Record<string, BindingData> }>;
    macros: Record<string, MacroModel>;
}
```

Apply via single import action (atomic). Avoid direct builder mutation.

### 11.7 Selection & Interaction Consolidation

Move `_interactionState` fields into store slice (hover, selected, dragging, activeHandle). Visualizer subscribes and draws overlays; user interactions dispatch store actions (`hoverElement(id)`, `startDrag(id, handleId)`, `commitTransform(id, delta)`).

---

## 12. Risk Matrix & Mitigations

| Risk                                        | Likelihood       | Impact | Mitigation                                                                                                          | Rollback Plan                                                                 |
| ------------------------------------------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FPS regression due to adapter overhead      | Medium           | High   | Profiling during Phase 4; micro-bench runtime adapter; lazy rebuild only on dirty                                   | Keep builder-based path behind feature flag until performance parity measured |
| Inconsistent state due to missed dual-write | High (Phase 1-2) | Medium | Central mutation API + ESLint rule forbidding direct element setter usage                                           | Run diff assertion each action; if mismatch, log & throw in dev               |
| Macro index drift                           | Medium           | Medium | Dev invariant: recompute index on interval & compare; production fallback: recover by rescan when mismatch detected | Rebuild index on load or mismatch detection                                   |
| Undo stack bloat                            | Medium           | Medium | Patch compression (coalesce rapid successive property changes), limit depth                                         | Provide config to revert to snapshot-based undo temporarily                   |
| Serialization version skew                  | Low              | High   | Include `scene.version`; add migration transforms; test old docs ingestion                                          | Keep legacy loader for one version post-migration                             |

---

## 13. Incremental Validation Checklist

| Item                            | Method                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Store slice parity with builder | Dev assertion diff after each scene mutation                                                                   |
| Macro binding correctness       | Unit test: create macro, bind property, change macro, ensure resolved property updates & inverse index updates |
| Undo patch coherence            | Unit test: sequence of element moves & macro edits undone/redone with identical serialization hash             |
| Performance                     | Benchmark: 100 elements, 10 macro-bound props each; measure frame time before & after adapter swap             |
| Export determinism              | Snapshot test serialized scene → adapter render pipeline produces same render object count & ordering          |

---

## 14. Implementation Notes / Edge Cases

-   Angle Units: Standardize stored numeric to radians. Add `uiUnit: 'deg'` metadata if you want to reflect degree entry fields; convert at selector boundary.
-   Unknown Element Types on Load: Keep registry creation; if registry lacks type, store placeholder element with `type: 'unknown'` and raw binding data for roundtrip fidelity; UI can highlight missing plugin.
-   Macro Deletion: When macro removed, convert all macro bindings referencing it to constants with last known value _via store action_ (ensures single transaction & atomic index update).
-   High-Frequency Transform Drags: Avoid dispatch spam; accumulate pointer deltas locally and dispatch throttled (e.g., animation frame) updates or end-of-drag commit + interim optimistic local overlay state.
-   Large Scenes: Consider keeping frequently accessed numeric transform fields denormalized on element model root (duplicated with binding) for ultra-hot path reads (micro-optimization after profiling).
-   Crash Resilience: Because authoritative state becomes plain JSON, can autosave debounced serialized doc directly from store without querying runtime objects.

---

## 15. Suggested Store API (Draft)

```ts
// Actions (command-style)
addSceneElement(type: string, initial?: Partial<SceneElementModel>): { id: string }
updateElementBindings(id: string, changes: Record<string, BindingData | { kind: 'constant'; value: any }>)
moveSceneElement(id: string, toIndex: number)
duplicateSceneElement(id: string): { newId: string }
removeSceneElement(id: string)
updateSceneSettings(partial: Partial<SceneSlice['settings']>)
createMacro(def: Omit<MacroModel, 'createdAt'|'lastModified'>)
updateMacroValue(id: string, value: any)
deleteMacro(id: string)
bindElementPropertyToMacro(id: string, property: string, macroId: string)
unbindElementProperty(id: string, property: string)
selectElement(id: string | null)
setInteractionState(p: Partial<SceneSlice['interaction']>)
importScene(payload: SceneImportData)
```

Include derived selectors: `selectElementListSorted`, `selectResolvedElement(id)`, `selectMacroAssignments(macroId)`.

---

## 16. Testing Strategy

1. Unit Tests: binding reducers, macro operations, inverse index updates, element duplication (ensures deep copy semantics of bindings).
2. Integration Tests: load old document → store import → re-serialize → deep-equal original (ignoring ordering differences & deprecated keys).
3. Performance Tests: measure time to adapt store → runtime objects for 1k elements (target < 5ms per full rebuild; typical diff rebuild O(changed elements)).
4. Visual Regression Hook: Export a deterministic frame hash (stringify render object tree) before & after migration for representative scenes.
5. Undo / Redo: rapid property drags captured; ensure patch compression prevents > N snapshots per second.

---

## 17. Step-by-Step First Implementation Slice (Concrete)

1. Create `sceneStore.ts` with minimal slice: settings + elements + macros (no inverse index yet).
2. Add a dev util `snapshotBuilder()` returning `{ settings, elements[], macros }` from current builder + macro manager.
3. After any scene mutation (wrap builder methods), dispatch `syncSceneFromBuilder(builderSnapshot)` (temporary) and assert diff is empty.
4. Build new selector-driven `SceneElementPanel` variant that reads store (behind feature flag `SCENE_STORE_UI`).
5. Add unit tests for slice reducers (jest + vitest environment you already use) verifying basic operations.
6. Introduce inverse macro index & update binding actions to maintain it; adapt macro panel to read assignment counts per macro.
7. Remove direct element setter usages in UI; replace with slice actions (tool-assisted grep replacement guided by pattern `element.set` in contexts).

---

## 18. Decommission Plan

When adapter fully trusted:

-   Replace `HybridSceneBuilder` with facade class delegating every method to store actions/selectors (keep public API to avoid bulk refactors).
-   Mark old methods & fields with `@deprecated` JSDoc and schedule removal.
-   Remove builder subscription to timeline store; instead, derived duration selector sits near timeline logic.
-   Delete legacy serialization logic; gateway reads store slice directly.
-   Update persistence tests to reference new shape.

---

## 19. Summary & Recommendation

Adopt a shadow store (Phase 1-2) to de-risk, then shift authority to normalized Zustand scene slice with a runtime adapter pattern ensuring render performance. Integrate macros & bindings into the same transactional model, enabling robust undo, deterministic serialization, and future multi-user or plugin expansion. Resist big-bang rewrites; instead, iterate with assertive parity checks and performance benchmarks. The outlined phases and API draft provide a clear runway to gradually eliminate the current hybrid object/store split while preserving functionality.

---

## 20. Quick Reference Checklist

-   [ ] Scene slice scaffolded
-   [ ] Dual-write wrapper installed
-   [ ] Parity assertion green for core CRUD
-   [ ] Store-driven element list UI shipped behind flag
-   [ ] Inverse macro index implemented
-   [ ] Adapter powering visualizer (performance benchmark passed)
-   [ ] Undo integrated for scene + macros
-   [ ] Builder deprecated & removed
-   [ ] Gateway serialization/store import refactored
-   [ ] Old docs migration path tested

---

End of Document.
