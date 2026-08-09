# Scene format and persistence

## Current document contract

`.mvt` is a ZIP package containing a JSON scene envelope plus binary assets. The current exported
and validated scene schema is `9`, defined by `CURRENT_SCHEMA_VERSION` in
`src/persistence/validate.ts`. Internal migration helper names may use later historical numbers;
those identifiers are implementation details and are not additional public export versions.

The envelope contains metadata, scene state, timeline state, optional plugin dependencies, asset
indexes, and compatibility warnings. Current scene elements are keyed records. Paint hierarchy is
stored in `scene.graph`; `elementsOrder` belongs only to older migration inputs.

## Export

`DocumentGateway.build()` takes canonical snapshots from the scene and timeline stores. The export
pipeline collects referenced MIDI, audio, visual, font, analysis-cache, and optional plugin
payloads, hashes content-addressed assets, writes the envelope, and packages the result.

Original audio bytes are preferred. If they are unavailable but decoded PCM exists, export can
generate a float32 WAV. Large analysis caches may be omitted and marked stale because they can be
regenerated.

## Import

Import follows a guarded sequence:

1. Parse the package or supported legacy representation and validate archive paths.
2. Prepare required migration resources and run supported scene migrations.
3. Validate the resulting schema before mutating stores.
4. Assess and optionally hydrate embedded plugin dependencies.
5. Restore MIDI, audio, visual, and font assets.
6. Apply the complete document and then preload runtime resources.

Cancellation is checked between expensive stages. Fatal validation errors return structured codes
and leave the current document unchanged. Recoverable asset and dependency problems are warnings or
placeholders.

## Scene graph validation

The graph contains a reserved synthetic root, stable group nodes, and one stable element node per
element record. Validation checks root identity, parent/child reciprocity, ownership, reachability,
cycles, and finite transforms. Traversal is iterative and budgeted for hostile input.

Nodes store visibility, opacity, lock state, an authored transform, and structural parent
compensation. Element properties remain owned by the element record; node bindings and automation
targets use structured node or element owners.

## Migration policy

MVMNT 0.16 is pre-release, but fixture-tested scene migrations are retained while their maintenance
cost remains reasonable. A persisted-field change requires export/import coverage and, where
applicable, an undo or rollback test. If a scene version is intentionally dropped, remove its
migration, fixture, tests, and documentation together.

The baseline fixture and migration suites under `src/persistence/__fixtures__/` and
`src/persistence/__tests__/` are the compatibility authority.
