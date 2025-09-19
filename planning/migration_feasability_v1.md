## Migration Feasibility & Plan: Moving `MacroManager` + `HybridSceneBuilder` into a Document‑Oriented Zustand Store

You're considering shifting from imperative/runtime singletons to a document-oriented architecture where the entire scene (elements, macros, bindings, timeline linkages) lives inside a unified Zustand store. This is feasible and aligns with how you're already treating the timeline. Below is a structured deep-dive covering responsibilities, feasibility, dependencies, target design, migration strategy, and risks.

---

### 1. Current Responsibilities (What You Have Now)

#### MacroManager

-   Holds a `Map<string, Macro>` plus event listeners.
-   Responsibilities: create/update/delete macros, validate values, serialize/deserialize.
-   Side-effects: listener notifications (UI), console logs.
-   No direct persistence, no undo integration, no time dependencies.

#### HybridSceneBuilder

-   Holds:
    -   `elements: SceneElement[]` in insertion order.
    -   Registry lookup & element factory integration.
    -   CRUD (add/remove/move/duplicate/update), ID management.
    -   Scene settings (fps, width, height, padding, tempo, beatsPerBar) with partial sync to timeline store.
    -   Macros bootstrap & assignment helpers.
    -   Serialization/deserialization including macros.
    -   Computes max duration (walks elements + timeline store).
    -   Debug / test scene factory methods.
-   Side-effects:
    -   Interacts with global macro manager.
    -   Interacts with timeline store for tempo & BPM.
    -   Allocates class instances (SceneElement subclasses) and calls `dispose`.

#### Context Layer

-   `MacroContext`: Thin React wrapper around global singleton.
-   `SceneContext`: Dispatches refresh events, name mgmt, delegates saving/loading to menu actions.
-   `VisualizerContext`: Consumes scene builder indirectly through `visualizer.getSceneBuilder()`.
-   `UndoContext`: Snapshot undo currently only wired to timeline; not yet for scene/macros.

---

### 2. Feasibility Assessment

| Aspect                                                | Feasibility           | Notes                                                                                    |
| ----------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| MacroManager state                                    | Easy                  | Replace Map with plain object in store. Event system replaced by subscription/selectors. |
| Macro value updates                                   | Easy                  | Direct state updates; can add middleware for validation.                                 |
| Scene settings                                        | Easy                  | Already a POJO; unify with export settings or keep logically separate.                   |
| Elements list & config                                | Moderate              | Need to decide: store raw JSON config or live class instances?                           |
| Serialization                                         | Easier post-migration | State snapshot = document; add version metadata.                                         |
| Undo/Redo                                             | Easier/unified        | Use a single history stack (or segmented) with opt-in slices.                            |
| Element class lifecycles (`dispose`, dynamic methods) | Needs adapter         | Best handled via a runtime “instance layer” derived from pure store data.                |
| Macro bindings on elements                            | Straightforward       | Represent as binding descriptors in element config.                                      |
| Performance (frequent updates)                        | Manageable            | Use slice selectors + structural sharing; avoid re-instantiating large arrays.           |
| Timeline coupling (tempo)                             | Clean separation      | Keep timeline in separate slice; cross-selectors derive computed values.                 |

Core decision: Move to a “pure data document” for scene + macros; runtime objects (SceneElement instances, render objects) become a derived cache maintained by the visualizer/renderer, invalidated by store subscriptions.

---

### 3. What Must Change (Dependencies & Touch Points)

You’ll need to update or introduce adapters for:

1. `MacroContext` → Replace with direct selectors from new store slice: `useDocumentStore(state => state.macros)`.
2. `SceneContext` → Scene name + save/load become actions on unified store (or a persistence service using store snapshot).
3. `VisualizerContext`:
    - Replace `visualizer.getSceneBuilder()` usage with either:
        - (a) A facade that implements the old API but internally maps to the store, or
        - (b) Direct consumption of store slices and a new "scene runtime manager" that materializes SceneElement instances.
4. Exporters (`ImageSequenceGenerator`, `VideoExporter`) → They call into visualizer which expects builder methods like `buildScene`. Provide a compatibility layer:
    - `sceneRuntime.buildRenderObjects(targetTime)` derived from store state.
5. Element Registry:
    - Keep registry as class/type factory for runtime instance creation.
    - On store diff (element added/removed/updated) reconcile runtime instances.
6. Undo system:
    - Extend snapshot controller to include scene/macros slice (with filtering to avoid large MIDI caches if not needed).
7. Persistence (`serializeScene` / `loadScene`):
    - Replace with `exportDocument()` = store JSON (with version), `importDocument(json)`.
8. Macro binding resolution:
    - Right now elements ask their binding objects (imperative). New model: each element’s effective value = selector:
        - `macroBindings: Record<propertyPath, macroName>`
        - Derived config builder resolves macro substitution at render/build time.
9. Tests:
    - Unit tests for builder/macros need refactoring to operate on the store + runtime adapter rather than singletons.

---

### 4. Target Store Shape (Suggested Unified Document Schema)

```ts
type DocumentStore = {
    meta: {
        version: string;
        createdAt: number;
        modifiedAt: number;
        sceneName: string;
        bindingVersion: string;
        dirty: boolean;
    };
    scene: {
        settings: {
            fps: number;
            width: number;
            height: number;
            prePadding: number;
            postPadding: number;
            tempo?: number;
            beatsPerBar?: number;
        };
        elements: Record<string, SceneElementData>;
        elementOrder: string[];
        selection: { elementIds: string[] };
    };
    macros: {
        byName: Record<string, Macro>;
        order: string[]; // optional for stable listing
    };
    // Existing timeline slice stays (or integrated):
    timeline: TimelineState['timeline'];
    tracks: TimelineState['tracks'];
    tracksOrder: TimelineState['tracksOrder'];
    transport: TimelineState['transport'];
    // Resource caches (fonts, loaded media) kept outside pure doc OR in separate non-serializable slice
    runtime: {
        // Non-serializable, ephemeral:
        elementInstances: Record<string, SceneElementRuntime>;
        lastBuildHash?: string;
    };
    actions: {
        // Scene
        addElement(type: string, initial?: Partial<SceneElementConfig>): string;
        updateElement(id: string, patch: Partial<SceneElementConfig>): void;
        removeElement(id: string): void;
        reorderElements(order: string[]): void;
        duplicateElement(id: string, newId?: string): string;
        setSceneSettings(patch: Partial<SceneSettings>): void;
        // Macros
        createMacro(name: string, type: MacroType, defaultValue: any, options?: MacroOptions): void;
        updateMacroValue(name: string, value: any): void;
        deleteMacro(name: string): void;
        importMacros(data: MacroExportData): void;
        // Bindings
        bindMacro(elementId: string, propertyPath: string, macroName: string): void;
        unbindMacro(elementId: string, propertyPath: string): void;
        // Serialization
        exportDocument(): SerializedDocument;
        importDocument(doc: SerializedDocument): void;
        markSaved(): void;
    };
};
```

`SceneElementData` (serializable) example:

```ts
interface SceneElementData {
    id: string;
    type: string;
    zIndex: number;
    visible: boolean;
    config: Record<string, any>; // raw constant values
    macroBindings?: Record<string, string>; // propertyPath -> macroName
}
```

Runtime adapter:

```ts
interface SceneRuntimeManager {
    getInstance(id: string): SceneElement | undefined;
    rebuildNeeded(changedKeys: Set<string>): void;
    ensureInstances(doc: DocumentStore['scene']): void;
    buildRenderObjects(targetTime: number, opts?: any): RenderObject[];
}
```

---

### 5. Migration Strategy (Phased)

1. Foundation (Dual Mode)

    - Create new `useDocumentStore` with only `macros` + bridging actions that proxy to current `globalMacroManager`.
    - Add feature flag: `DOC_MODE=true` enabling store-driven macro usage in UI while scene builder still imperative.

2. Macro Cut-over

    - Replace `MacroContext` internals to read from store slice.
    - Deprecate `globalMacroManager` by turning methods into thin wrappers calling store.

3. Scene Data Extraction

    - Extend store with `scene.elements` & `scene.settings`.
    - Add actions that internally call existing `HybridSceneBuilder` so both remain consistent (write-through bridging).
    - Provide a `selector` to get serialized scene purely from store.

4. Runtime Layer Introduction

    - Implement `SceneRuntimeManager` that listens to store changes and syncs element instances (create/dispose).
    - Refactor `visualizer.getSceneBuilder()` to optionally supply a facade implementing prior methods by delegating to store + runtime manager.

5. Replace Direct Builder Usage

    - Swap calls in UI & exporters to use new facade.
    - Mark old `HybridSceneBuilder` as legacy; shrink responsibilities to only compatibility methods until retired.

6. Undo Integration

    - Expand snapshot controller to include `macros` + `scene` slices.
    - Provide granular filters (exclude `runtime` slice).

7. Finalize
    - Remove legacy builder; flatten exports.
    - Update persistence: `exportDocument()` / `importDocument()`.
    - Version bump & migration notes (handle older scene files by converting into new store schema).

---

### 6. Validation & Edge Cases

Edge cases to plan for:

-   Macro deletion with active bindings (elements must gracefully fallback to last resolved constant value or remove property).
-   Large element counts: ensure selectors memoize (e.g., derive per-element decorated config).
-   Real-time macro updates during playback (should trigger minimal invalidation: mark affected element instances dirty, not full rebuild).
-   Undo/Redo consistency: macro change + element binding change rolled back atomically.
-   Scene import while playback active: safely pause runtime manager rebuild.
-   Race between timeline tempo changes and scene settings tempo override → define single source of truth (recommend: timeline wins; scene settings tempo field becomes a convenience setter that forwards to timeline).

---

### 7. Risks & Mitigations

| Risk                                           | Mitigation                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Performance regressions from large state diffs | Use normalized maps + shallow compare selectors; avoid recreating big arrays (retain `elementOrder`).     |
| Runtime object lifecycle leaks                 | Centralize creation/disposal in `SceneRuntimeManager.ensureInstances()`.                                  |
| Coupled tempo logic duplication                | Keep authoritative tempo only in timeline slice; scene stores display copy only if needed.                |
| Undo memory footprint                          | Limit history depth; compress with structural hashing; exclude non-serializable runtime slice.            |
| Binding resolution complexity                  | Precompute resolved config per element with memoization keyed by (element.version, macro.version subset). |
| Developer confusion during transition          | Add `DOC_MODE` flag and logging warnings for legacy API access.                                           |

---

### 8. Recommended Tooling & Patterns

-   Use `zustand` middleware:
    -   `subscribeWithSelector` for efficient granular subscriptions.
    -   Optionally `immer` for ergonomic immutable updates (macro/element maps).
-   Add a small hashing utility (e.g., Murmur or djb2) to produce a `sceneHash` for quick change detection in exporters.
-   Provide selectors:
    -   `selectResolvedElement(id)`
    -   `selectAllResolvedElementsMemo`
    -   `selectMacro(name)`
    -   `selectElementsAffectingMacro(name)` (reverse index maintained on writes).
-   Persist with version stamping:
    -   `doc.version` (semantic)
    -   `schemaVersion` (for migrations)
-   Add a `migration.ts` with `applyMigrations(doc: any): SerializedDocument`.

---

### 9. Concrete Next Steps (Suggested Order)

1. Introduce new store slice `macros` with same schema; proxy old manager.
2. Create `documentStore.ts` with skeleton of unified store (just macros first).
3. Refactor `MacroContext` to use store; mark `globalMacroManager` deprecated.
4. Add `scene` slice (elements/settings) but keep builder bridging.
5. Build `SceneRuntimeManager` (reconcile instances on change).
6. Update `VisualizerContext` to consume runtime manager instead of direct builder (keep facade).
7. Extend undo to new slices.
8. Add persistence functions + migration tests.
9. Remove builder singleton code after parity tests.

---

### 10. Sample Skeleton (Illustrative)

```ts
// documentStore.ts
import create from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export const useDocumentStore = create<DocumentStore>()(
    subscribeWithSelector((set, get) => ({
        meta: {
            version: '0.13.0',
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            sceneName: 'Untitled',
            bindingVersion: '1',
            dirty: false,
        },
        macros: { byName: {}, order: [] },
        scene: {
            settings: { fps: 60, width: 1500, height: 1500, prePadding: 0, postPadding: 0 },
            elements: {},
            elementOrder: [],
            selection: { elementIds: [] },
        },
        // timeline slices could be spread here or imported
        runtime: { elementInstances: {} },
        actions: {
            createMacro: (name, type, defaultValue, options) =>
                set((s) => {
                    if (s.macros.byName[name]) return s;
                    return {
                        macros: {
                            byName: {
                                ...s.macros.byName,
                                [name]: {
                                    name,
                                    type,
                                    value: defaultValue,
                                    defaultValue,
                                    options,
                                    createdAt: Date.now(),
                                    lastModified: Date.now(),
                                },
                            },
                            order: [...s.macros.order, name],
                        },
                        meta: { ...s.meta, dirty: true, modifiedAt: Date.now() },
                    };
                }),
            updateMacroValue: (name, value) =>
                set((s) => {
                    const m = s.macros.byName[name];
                    if (!m) return s;
                    return {
                        macros: {
                            ...s.macros,
                            byName: { ...s.macros.byName, [name]: { ...m, value, lastModified: Date.now() } },
                        },
                        meta: { ...s.meta, dirty: true, modifiedAt: Date.now() },
                    };
                }),
            // ... other actions ...
            exportDocument: () => {
                const s = get();
                return {
                    version: s.meta.version,
                    scene: { settings: s.scene.settings, elements: s.scene.elements, order: s.scene.elementOrder },
                    macros: s.macros.byName,
                    timeline: {
                        /* optionally copy */
                    },
                    bindingVersion: s.meta.bindingVersion,
                    exportedAt: new Date().toISOString(),
                };
            },
        },
    }))
);
```

---

### 11. When NOT to Migrate Certain Pieces

Keep some logic outside the pure doc:

-   Heavy derived caches (render objects, large precomputed note layout).
-   Playback clock (temporal side-effects).
-   Non-serializable resources (images, fonts, WebGL contexts).

---

### 12. Summary / Recommendation

A fully document-oriented approach is highly feasible and will simplify persistence, undo/redo, and deterministic testing. The key is to separate:

-   Pure, serializable, normalized scene + macro state (Zustand).
-   Runtime derivations (instances, rendering, playback clock) as a reactive layer.

Adopt a phased dual-mode migration to avoid blocking feature development. Target a small compatibility facade so you can gradually refactor consumers without a large-bang rewrite.

---

### 13. Quick Read Cheat Sheet

Move into store:

-   Macros, scene settings, element config, macro bindings, selection, serialization metadata.

Keep runtime:

-   SceneElement class instances, disposal, render object assembly, playback clock.

Refactor:

-   MacroContext → selectors
-   SceneBuilder → facade + runtime manager
-   Undo → include new slices
-   Export/import → store snapshots

---

If you’d like, next step I can scaffold `documentStore.ts` and a minimal runtime manager shim to start dual-running. Just let me know and I’ll implement the initial slice.

Let me know if you want code scaffolding next, or deeper detail on binding resolution strategy / performance.
