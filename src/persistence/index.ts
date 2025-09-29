/**
 * Persistence / Serialization Public API
 * -------------------------------------------------
 * Unified entry points for scene export/import and snapshot undo management.
 * Documentation reflects the live implementation: deterministic export/import and the
 * snapshot-based undo ring described in the docs.
 *
 * Current Guarantees:
 *  - `exportScene()` returns a deterministic envelope (inline JSON or packaged ZIP) wrapped in a Promise.
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
