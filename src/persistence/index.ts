/**
 * Persistence / Serialization Public API
 * -------------------------------------------------
 * Unified entry points for scene export/import and snapshot undo management.
 * The historical phased roadmap comments have been removed; current behavior reflects the
 * implemented deterministic export/import plus snapshot-based undo ring.
 *
 * Current Guarantees:
 *  - `exportScene()` returns a deterministic JSON envelope (never throws on well-formed state).
 *  - `importScene()` performs parsing + structural validation; returns structured result (error paths do not throw).
 *  - `createSnapshotUndoController()` provides debounced state capture with size & depth limits.
 *
 * Evolution (documented, not encoded in comments):
 *  - Additional validation tiers, resource dedup, and patch-based undo may be layered without breaking this surface.
 */

export { exportScene } from './export';
export { importScene } from './import';
export { createSnapshotUndoController } from '../state/undo/snapshot-undo';

// Feature flags removed; persistence always enabled.

// Re-export placeholder types to stabilize import paths for early adopters & tests.
export type { ExportSceneResult } from './export';
export type { ImportSceneResult } from './import';
export type { UndoController, CreateSnapshotUndoOptions } from '../state/undo/snapshot-undo';
