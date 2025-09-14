## Preamble

Let’s lay out a comprehensive, forward‑compatible plan to overhaul scene serialization/deserialization so save/load becomes robust, versioned, and lossless across evolving scene + timeline state.

## 1. Current State Summary (Findings)

Key components:

-   `HybridSceneBuilder.serializeScene()` outputs: `{ version, elements[], macros, serializedAt, bindingSystemVersion, sceneSettings, timeline? }`.
-   Elements: each is a `SceneElement` subclass with a bindings map; serialization stores each property as `{ type: 'constant'|'macro', ... }`.
-   Timeline: only a minimal ad‑hoc `timeline.tracks[]` stub (id, name, type, offsetTicks) optionally embedded.
-   Macro system serialized wholesale via `globalMacroManager.exportMacros()`.
-   No explicit schema versioning (single implicit `version` + `bindingSystemVersion`).
-   No validation: load just trusts the data, catches broad exceptions.
-   Angle units: internal radians vs serialized binding constant storing raw value (currently logs and returns raw; potential unit mismatch).
-   No resource (fonts, images, external MIDI) reference abstraction—elements embed raw `imageSource` etc.
-   Missing: dependency graph, diffing, incremental updates, migrations, robust error surface, partial recovery, deterministic ordering, referential integrity checks.

Pain points/gaps:

-   Coupled to runtime constructors; no decoupled DTO schema layer.
-   Lack of explicit schema versions per sub-domain (scene, timeline, bindings, macro).
-   Mixed responsibilities: `scene-builder` both orchestrates domain logic and handles persistence.
-   Potential future circular references (e.g., if elements reference tracks by id, tracks referencing elements/macros).
-   No validation or sanitization; could introduce corrupted state.
-   Lacks forward/backward migration path, or partial load semantics (e.g., skip unknown element types but report).
-   Entire state saved monolithically; impossible to stream or patch.
-   Timeline integration inconsistent (seed logic duplicated in `visualizer-core.importSceneConfig`).

## 2. Target Objectives

1. Deterministic, versioned, self-describing save format.
2. Safe load with validation, granular error reporting, and recoverable partial successes.
3. Clear separation between persisted base state vs derived/transient (caches, computed bounds, macro runtime listeners).
4. Migration pipeline enabling incremental schema evolution.
5. Resource abstraction: stable IDs for fonts, images, MIDI sources, macro references.
6. Extensibility: plugin/registry-based serialization of new element types without central code changes.
7. Testable: round-trip fidelity tests, regression snapshots per schema version.
8. Performance: O(n) serialization (n = elements + macros + tracks) with optional compression and incremental diff capability later.

## 3. Proposed Versioned Schema (Top-Level)

Top-level envelope (JSON):
{
"format": "mvmnt-scene",
"schemaVersion": 3, // global envelope version
"createdWith": { "appVersion": "x.y.z", "bindingVersion": "b" },
"meta": { "name": "My Scene", "description": "...", "savedAt": "ISO", "id": "uuid" },
"scene": {
"version": 2, // scene sub-schema version
"settings": { fps, width, height, prePadding, postPadding, tempo, beatsPerBar },
"elements": [ SceneElementDTO ],
"ordering": ["elementId1","elementId2", ...] // explicit stable ordering
},
"timeline": {
"version": 2,
"global": { "bpm": number, "beatsPerBar": number, "tempoMap": TempoMapDTO? },
"tracks": [ TrackDTO ],
"selection": { "activeTrackId": "id"? }
},
"macros": {
"version": 1,
"items": [ MacroDTO ]
},
"resources": {
"version": 1,
"fonts": [ FontRefDTO ],
"images": [ ImageRefDTO ],
"midi": [ MidiRefDTO ]
},
"bindings": {
"version": 1,
"model": "property-binding-v1", // strategy marker
"propertiesEmbedded": true // indicates element properties already carry binding objects
},
"compat": { "migratedFrom": [1,2], "warnings": [] },
"integrity": {
"hash": "sha256:...", // optional hash of canonicalized payload sections
"sections": { "scene": "hash...", "timeline": "hash..." }
}
}

SceneElementDTO (example):
{
"id": "textElement1",
"type": "textOverlay",
"bindings": {
"visible": { "t":"c", "v": true }, // short form for space efficiency
"zIndex": { "t":"c", "v": 50 },
"text": { "t":"c", "v": "Song Title" },
"fontFamily": { "t":"c", "v": { "fontId": "font:inter-regular" } },
"midiTrackId": { "t":"m", "macro":"midiTrack" }
},
"ext": { // element-specific extension (non-binding metadata)
"revision": 1
}
}

TrackDTO:
{
"id": "trk1",
"name": "Piano",
"type": "midi",
"region": { "startTick": 0, "endTick": 12340 },
"offsetTicks": 0,
"midiRef": "midi:piano-intro",
"enabled": true
}

Binding encoding:

-   Short keys: t = type, v = value, macro = macro id
-   Binding types: 'c' (constant), 'm' (macro)
-   Keep expanded form accepted for backward compatibility.

## 4. Component Contracts

Interfaces (TypeScript):
interface SceneSerializer {
serialize(ctx: SerializationContext): SerializedSceneEnvelope;
deserialize(envelope: unknown, opts?: { strict?: boolean }): LoadResult;
}

interface SerializationContext {
registry: ElementRegistry;
macroManager: MacroManager;
resourceIndex: ResourceIndex;
timelineStore: TimelineStore;
version: number;
}

interface ElementSerializer {
type: string;
serialize(el: SceneElement): SceneElementDTO;
deserialize(dto: SceneElementDTO, helpers: DeserializeHelpers): SceneElement;
migrate?(dto: any, fromVersion: number, toVersion: number): SceneElementDTO;
}

Registry pattern:

-   `elementSerializerRegistry.register(ElementSerializer)`
-   During serialize: scene builder enumerates elements, asks registry for serializer by type, fallback generic binding dump if no custom serializer (with warning).
-   During deserialize: unknown types => recorded warning and skipped.

Macro serialization:

-   Macros described by: { id, controlType, value, meta }.
-   Validate macro id uniqueness pre-import; collision policy: either override or rename (configurable).

Resource indexing:

-   Pre-pass gathers all resource references from elements (e.g., imageSource, fontFamily, midiTrackId).
-   Replace direct inline heavy data with stable refs; heavy payloads (e.g., raw MIDI bytes) optionally inlined or external:
    Option A: `midi` array items: { id, data: base64, length, sha256 }.
    Option B (future): detach large binary to separate file `.mvmnt.assets`.

## 5. Serialization Workflow (Forward Path)

Serialize:

1. Collect raw runtime state (elements, macros, timeline, settings).
2. Normalize + canonical order (sort elements by ordering, macros by id, tracks by id).
3. Extract resource references -> build `resources` manifest with dedup & assign stable IDs (`font:family-weight`, `img:<hash|slug>`, `midi:<uuid>`).
4. Convert properties -> binding DTO (short form for constants/macros).
5. Compose envelope; compute section hashes (stable JSON stringify with sorted keys).
6. (Optional) Compress (e.g., JSON -> string -> gzip -> base64 for export).
7. Return envelope or streaming writer.

Deserialize:

1. Detect/validate `format`.
2. Parse & identify `schemaVersion`.
3. Run migration pipeline (while currentVersion < latest):
    - For each section, apply sequential migration steps.
4. Validate with Zod (strict or permissive).
5. Rehydrate macros first (so macro bindings can resolve value requests lazily).
6. Load resources into resource index (pre-register fonts, image placeholders).
7. Build elements using element serializer registry.
8. Insert into `HybridSceneBuilder` (clear existing first) preserving ordering.
9. Apply scene settings, timeline tracks (via timeline store API).
10. Emit structured load result: { success, warnings[], errors[], migratedFromVersion?, envelopeVersion }.

## 6. Migration Strategy

-   Migration modules: `/src/persistence/migrations/<section>/<from>_to_<to>.ts`
-   Each exports `migrate(data: any): any`.
-   Central orchestrator loads chain based on `schemaVersion`.
-   Maintain changelog mapping: `SCENE_SCHEMA_LATEST = 2`, etc.
-   Provide CLI/dev script to run migrations on archived fixtures for regression.

Common migration examples:

-   v1 → v2: Move element property `fontFamily` raw string to object `{ fontId }`.
-   v2 → v3: Introduce resource manifest; replace inline base64 images with refs.

## 7. Validation

Use Zod (or similar) per section:

-   Fail-fast on structural corruption (return error).
-   Collect non-critical issues (unknown element type, obsolete property) into warnings.

Example:
const ElementBindingSchema = z.object({
t: z.enum(['c','m']),
v: z.any().optional(),
macro: z.string().optional()
}).refine(data => (data.t === 'c') === ('v' in data) || (data.t === 'm') === ('macro' in data), 'Binding mismatch');

## 8. Error Handling & Partial Recovery

Classes of errors:

-   Structural: abort entire load.
-   Per-element deserialization failures (unknown type): skip element, add warning.
-   Macro collisions: rename or adopt user policy; record warning.
-   Missing resource: stub placeholder, mark warning (e.g., missing image==display placeholder).

Return structure:
interface LoadResult {
success: boolean;
loadedElements: number;
skippedElements: number;
warnings: string[];
errors: string[];
migrated?: boolean;
originalVersion?: number;
finalVersion: number;
}

## 9. Persistence & Storage Modes

Initial:

-   Manual export/import JSON.
-   Local autosave (debounced) to `localStorage` key `mvmnt.autosave.scene.v<schemaVersion>` (strip large MIDI bodies; maybe separate key).
    Phase 2:
-   Compression (pako) for large scenes.
-   Shareable link generation (base64 compressed payload or remote short link service).
    Phase 3:
-   Incremental diff log for undo/redo & autosave (CRDT potential later).
    Incremental potential format: operations list (addElement, updateBinding, removeElement).

## 10. Performance Considerations

-   Avoid deep cloning large structures repeatedly: reuse stable ordering arrays, map->array only once.
-   Lazy resource load: register image refs, load actual image sources post-deserialize asynchronously, trigger re-render on completion.
-   Hash computation: only on export; skip for autosave to reduce CPU.

## 11. Security / Safety

-   Sanitize text properties (limit length).
-   Validate numeric ranges (fps sane 1..480).
-   Reject extremely large inline payloads (> N MB) unless explicitly allowed.

## 12. Testing Strategy

Test layers:

1. Unit tests:
    - Binding serialization round-trip for constants, macros.
    - Element serializer (each registered element).
2. Scene round-trip:
    - Construct default scene -> serialize -> deserialize -> reserialize -> deep compare (allow list of ignored transient fields).
3. Migration tests:
    - Fixture JSON for each historical version passes through pipeline and matches expected current shape snapshot.
4. Fuzz:
    - Generate random elements/properties within schema range; ensure no crash.
5. Performance benchmark:
    - 1000 elements serialization under threshold (< X ms).
6. Integrity:
    - Modify payload underlying section; ensure hash mismatch detection (if enabled).
7. Error injection:
    - Unknown element type, missing macros, truncated bindings.

Automation:

-   Place tests in `src/persistence/__tests__/`.
-   Add fixtures in `src/persistence/fixtures/v1/*.json`.

## 13. Implementation Phases

Phase 1 (Foundation):

-   Add `/src/persistence/` module:
    -   `schema.ts` (Zod schemas + constants)
    -   `serializers/element-serializer-registry.ts`
    -   `serializers/default-element-serializer.ts`
    -   `scene-serializer.ts`
    -   `timeline-serializer.ts`
    -   `macro-serializer.ts`
    -   `resource-extractor.ts`
    -   index.ts
-   Integrate new unified `exportScene()` & `importScene()` methods (wrapping old builder).

Phase 2 (Adoption):

-   Deprecate direct calls to `sceneBuilder.serializeScene()`; route through `PersistenceFacade`.
-   Modify UI save/load to use new envelope.
-   Add autosave.

Phase 3 (Migration & Backward Compatibility):

-   Implement v1→v2 migration layer to parse legacy current format into new envelope.
-   Provide export option: "Export (Legacy)" if needed.

Phase 4 (Optimizations & Diffs):

-   Introduce change operation log (subscribe to builder & timeline events).
-   Optional compressed export.

Phase 5 (Advanced):

-   Remote persistence API integration, share token.

## 14. Minimal Initial Code Tasks (Concrete)

1. Create `schema.ts` with Zod definitions for envelope + sections (scene v2).
2. Build `ElementSerializer` generic using existing `getSerializableConfig()` and adding binder adaptation to short form.
3. Implement `ScenePersistence` facade:
    - `exportCurrent(): SerializedSceneEnvelope`
    - `import(envelope: unknown, options?): LoadResult`
4. Wrap existing menu bar `saveScene`, `loadScene` to call facade.
5. Add default migration adapter from legacy format (detect absence of `format` key).
6. Add round-trip test for default scene + test scene.

## 15. Risk Mitigation

-   Start with side-by-side dual serialization (legacy + new) hidden behind a feature flag to validate equivalence before cutover.
-   Keep migration pure/functional—no side effects until final application stage.
-   Extensive logging behind verbose flag.

## 16. Example Migration (Legacy → v2 Pseudocode)

function migrateLegacyToV2(legacy: any): SerializedSceneEnvelope {
const sceneSettings = legacy.sceneSettings ?? {};
return {
format: 'mvmnt-scene',
schemaVersion: 3,
createdWith: { appVersion: legacy.version ?? 'unknown', bindingVersion: legacy.bindingSystemVersion ?? 'unknown' },
meta: { name: 'Untitled', savedAt: legacy.serializedAt || new Date().toISOString(), id: uuid() },
scene: {
version: 2,
settings: sceneSettings,
elements: legacy.elements.map(e => ({
id: e.id,
type: e.type,
bindings: transformLegacyElementBindings(e),
ext: {}
})),
ordering: legacy.elements.sort((a,b)=> (a.index||0)-(b.index||0)).map(e => e.id)
},
timeline: legacy.timeline ? adaptTimeline(legacy.timeline) : defaultTimeline(),
macros: { version: 1, items: adaptMacros(legacy.macros) },
resources: buildResourceManifest(legacy),
bindings: { version: 1, model: 'property-binding-v1', propertiesEmbedded: true },
compat: { migratedFrom: [1], warnings: [] },
integrity: null
};
}

## 17. Tooling & Developer Experience

-   Add `scripts/validate-scene.ts` CLI (dev) to validate a saved file.
-   Add a VSCode task for `npm run test:persistence`.
-   Optional JSON schema generation from Zod for external docs.

## 18. Follow-Up Enhancements (Deferred)

-   Binary container format (.mvmnt bundle) with JSON + binary asset pack.
-   Streaming incremental loader for very large MIDI sets.
-   CRDT collaboration layer.

---

## Summary / Next Steps

This plan introduces a structured, versioned envelope with modular serializers, validation, and migration. Immediate next actionable coding steps (Phase 1) will establish schemas, serializers, facade, and legacy migration adapter, then wire the UI through it and add round-trip tests.

If you’d like, I can proceed to scaffold the `persistence/` module and an initial schema + facade next. Let me know and I’ll implement Phase 1 code.

## Requirements Coverage

-   Examine current system: Done (sections 1–2).
-   Provide rework plan: Done (sections 3–18).
-   Full save/load workflow including versioning, migrations, resources, testing: Covered.

Let me know if you want me to start implementing Phase 1 now.
