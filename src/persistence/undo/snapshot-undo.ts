import { SERIALIZATION_V1_ENABLED } from '../flags';

export interface UndoController {
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
    reset(): void;
}

class DisabledUndoController implements UndoController {
    canUndo() {
        return false;
    }
    canRedo() {
        return false;
    }
    undo() {
        /* no-op */
    }
    redo() {
        /* no-op */
    }
    reset() {
        /* no-op */
    }
}

class PlaceholderUndoController extends DisabledUndoController {
    // Phase 1 will implement snapshot ring mechanics.
}

export interface CreateSnapshotUndoOptions {
    maxDepth?: number; // Accepted in Phase 1
}

/**
 * Phase 0: returns disabled controller if flag off, else placeholder controller with no behavior.
 */
export function createSnapshotUndoController(_store: unknown, _opts: CreateSnapshotUndoOptions = {}): UndoController {
    if (!SERIALIZATION_V1_ENABLED()) {
        return new DisabledUndoController();
    }
    return new PlaceholderUndoController();
}
