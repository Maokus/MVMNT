import { dispatchSceneCommand, registerSceneCommandListener, type SceneCommandPatch } from '@state/scene';
import type { SceneCommandTelemetryEvent } from '@state/scene/sceneTelemetry';

export interface UndoController {
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
    reset(): void;
}

export interface CreatePatchUndoOptions {
    maxDepth?: number;
}

interface UndoStackEntry {
    scene?: SceneCommandPatch;
    source?: string;
    timestamp: number;
}

class PatchUndoController implements UndoController {
    private stack: UndoStackEntry[] = [];
    private index: number = -1;
    private readonly maxDepth: number;
    private restoring = false;
    private unsubscribeScene?: () => void;

    constructor(options: CreatePatchUndoOptions = {}) {
        this.maxDepth = Math.max(1, Math.min(options.maxDepth ?? 100, 200));
        this.unsubscribeScene = registerSceneCommandListener((event) => this.onSceneCommand(event));
        this.exposeGlobals();
    }

    private onSceneCommand(event: SceneCommandTelemetryEvent) {
        if (this.restoring) return;
        if (!event.success) return;
        if (!event.patch) return;
        const { undo, redo } = event.patch;
        if (!Array.isArray(undo) || !Array.isArray(redo) || undo.length === 0 || redo.length === 0) return;
        const entry: UndoStackEntry = {
            scene: { undo, redo },
            source: event.source,
            timestamp: Date.now(),
        };
        this.pushEntry(entry);
    }

    private pushEntry(entry: UndoStackEntry) {
        if (this.index < this.stack.length - 1) {
            this.stack.splice(this.index + 1);
        }
        this.stack.push(entry);
        if (this.stack.length > this.maxDepth) {
            this.stack.shift();
        }
        this.index = this.stack.length - 1;
    }

    private applyCommands(commands: SceneCommandPatch['undo']): void {
        for (const command of commands) {
            const result = dispatchSceneCommand(command, { source: 'undo' });
            if (!result.success) {
                console.error('[undo] Failed to apply command during undo/redo', result.error);
            }
        }
    }

    private exposeGlobals() {
        if (typeof window === 'undefined') return;
        try {
            (window as any).__mvmntUndo = this;
            if (!(window as any).getUndoStack) {
                (window as any).getUndoStack = () => this.debugStack();
            }
            if (!(window as any).dumpUndo) {
                (window as any).dumpUndo = (index?: number) => this.dump(index);
            }
        } catch {
            /* non-fatal */
        }
    }

    canUndo(): boolean {
        return this.index >= 0 && this.index < this.stack.length;
    }

    canRedo(): boolean {
        return this.index < this.stack.length - 1;
    }

    undo(): void {
        if (!this.canUndo()) return;
        const entry = this.stack[this.index];
        if (!entry.scene) {
            this.index -= 1;
            return;
        }
        this.restoring = true;
        try {
            this.applyCommands(entry.scene.undo);
        } finally {
            this.restoring = false;
            this.index -= 1;
        }
    }

    redo(): void {
        if (!this.canRedo()) return;
        const entry = this.stack[this.index + 1];
        if (!entry.scene) {
            this.index += 1;
            return;
        }
        this.restoring = true;
        try {
            this.applyCommands(entry.scene.redo);
        } finally {
            this.restoring = false;
            this.index += 1;
        }
    }

    reset(): void {
        this.stack = [];
        this.index = -1;
    }

    dispose(): void {
        this.reset();
        this.unsubscribeScene?.();
        this.unsubscribeScene = undefined;
        if (typeof window !== 'undefined') {
            try {
                if ((window as any).__mvmntUndo === this) {
                    delete (window as any).__mvmntUndo;
                }
            } catch {
                /* noop */
            }
        }
    }

    debugStack() {
        return {
            index: this.index,
            size: this.stack.length,
            entries: this.stack.map((entry, idx) => ({
                index: idx,
                hasScenePatch: !!entry.scene,
                source: entry.source,
                ageMs: Date.now() - entry.timestamp,
            })),
        };
    }

    dump(index: number = this.index) {
        const entry = this.stack[index];
        if (!entry) return null;
        return { ...entry.scene };
    }

    markDirty(): void {
        // Patch-based undo applies changes eagerly; markDirty is retained for legacy integrations.
    }

    isRestoring(): boolean {
        return this.restoring;
    }
}

export function createPatchUndoController(
    _store: unknown,
    options: CreatePatchUndoOptions = {}
): PatchUndoController {
    return new PatchUndoController(options);
}
