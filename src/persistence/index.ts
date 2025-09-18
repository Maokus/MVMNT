/**
 * Persistence / Serialization Public API – Phase 0 Skeleton
 * ---------------------------------------------------------------------------
 * This module exposes the future API surface for scene export/import and undo management.
 * During Phase 0 all functions are inert placeholders whose behavior is deterministic and non-throwing.
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
 *  Phase 1 (IMPLEMENTED): Deterministic export/import, snapshot undo ring, validation (fatal subset).
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
 *  - Do not rely on envelope shape stability yet beyond existing keys.
 *
 * NOTE: Keeping this surface stable early allows incremental implementation without widespread churn.
 */

export { exportScene, exportDocument } from './export';
export { importScene, importDocument } from './import';
export { createSnapshotUndoController } from './undo/snapshot-undo';

// Re-export placeholder types to stabilize import paths for early adopters & tests.
export type { ExportSceneResult } from './export';
export type { ImportSceneResult } from './import';
export type { ExportDocumentResult } from './export';
export type { ImportDocumentResult } from './import';
export type { UndoController, CreateSnapshotUndoOptions } from './undo/snapshot-undo';
