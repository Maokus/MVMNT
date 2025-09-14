/**
 * Persistence / Serialization Public API – Phase 0 Skeleton
 * ---------------------------------------------------------------------------
 * This module exposes the future API surface for scene export/import and undo management.
 * During Phase 0 all functions are inert placeholders whose behavior is:
 *  - If feature flag `VITE_FEATURE_SERIALIZATION_V1` (SERIALIZATION_V1) is disabled:
 *      * `exportScene()` => `{ ok:false, disabled:true }` (non-throwing)
 *      * `importScene(json)` => disabled result with explanatory error.
 *      * `createSnapshotUndoController(store)` => no-op controller (all methods safe no-ops).
 *  - If the flag is enabled (internal experimentation), functions return placeholder structures but perform no real state logic yet.
 *
 * CONTRACT (Phase 0 placeholder):
 *  exportScene(): ExportSceneResult
 *    - Never throws.
 *    - When enabled returns minimal envelope { schemaVersion, format, metadata, scene, timeline, compatibility }.
 *  importScene(json: string): ImportSceneResult
 *    - Attempts JSON.parse when flag enabled; returns ok=false for invalid JSON.
 *    - Never mutates application state in Phase 0.
 *  createSnapshotUndoController(store, opts?): UndoController
 *    - Returns controller whose methods are stable no-ops in Phase 0.
 *
 * PLANNED EVOLUTION (Later Phases):
 *  Phase 1: Deterministic export/import, snapshot undo ring, validation (fatal subset).
 *  Phase 2: Expanded validation & error codes.
 *  Phase 3: Instrumentation (performance & memory) under profiling flag.
 *  Phase 4: (Conditional) Patch-based undo alternative.
 *  Phase 5: Resource deduplication section.
 *  Phase 6: Advisory validation & unknown element handling.
 *
 * ERROR MODES (Future intent):
 *  - Import returns structured error objects; throwing is reserved for programmer faults.
 *  - Export expected to succeed deterministically; snapshot undo capture will handle memory caps gracefully.
 *
 * USAGE GUIDANCE (Phase 0):
 *  - Gate UI elements on `SERIALIZATION_V1_ENABLED()` or inspect `result.disabled` field.
 *  - Do not rely on envelope shape stability yet beyond existing keys.
 *
 * NOTE: Keeping this surface stable early allows incremental implementation without widespread churn.
 */

export { exportScene } from './export';
export { importScene } from './import';
export { createSnapshotUndoController } from './undo/snapshot-undo';

export { isFeatureEnabled, SERIALIZATION_V1_ENABLED } from './flags';

// Re-export placeholder types to stabilize import paths for early adopters & tests.
export type { ExportSceneResult } from './export';
export type { ImportSceneResult } from './import';
export type { UndoController, CreateSnapshotUndoOptions } from './undo/snapshot-undo';
