// Phase 6: legacy snapshot-based undo removed.
// This file is intentionally left as a stub to avoid breaking imports in downstream branches.
// Do not use. Document undo/redo is provided by the patch-based documentStore and actions.

export interface CreateSnapshotUndoOptions {
    // no-op
}

export type UndoController =
    | {
          canUndo(): boolean;
          canRedo(): boolean;
          undo(): void;
          redo(): void;
          reset(): void;
      }
    | undefined;

export function createSnapshotUndoController(): UndoController {
    if (import.meta.env?.DEV) {
        console.warn('[snapshot-undo] Legacy API removed. Use documentStore undo/redo via actions.');
    }
    return undefined;
}

export function instrumentSceneBuilderForUndo(_sb: any): void {
    if (import.meta.env?.DEV) {
        console.warn('[snapshot-undo] Legacy instrumentation removed.');
    }
}
