import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { createSnapshotUndoController, instrumentSceneBuilderForUndo } from '@persistence/undo/snapshot-undo';
import { globalMacroManager } from '@bindings/macro-manager';

class DragSceneBuilder {
    elements: any[] = [];
    settings: any = { fps: 60, width: 100, height: 100 };
    serializeScene() {
        return {
            elements: this.elements.map((e, i) => ({ ...e, index: i })),
            sceneSettings: { ...this.settings },
            macros: globalMacroManager.exportMacros(),
        };
    }
    loadScene(d: any) {
        this.elements = d.elements ? d.elements.map((e: any) => ({ ...e })) : [];
        if (d.sceneSettings) this.settings = { ...d.sceneSettings };
        return true;
    }
    addElement(type: string, id: string, cfg: any = {}) {
        this.elements.push({ id, type, zIndex: this.elements.length, offsetX: 0, offsetY: 0, ...cfg });
        return true;
    }
    updateElementConfig(id: string, cfg: any) {
        const el = this.elements.find((e) => e.id === id);
        if (!el) return false;
        Object.assign(el, cfg);
        return true;
    }
    moveElement(id: string, newIndex: number) {
        const idx = this.elements.findIndex((e) => e.id === id);
        if (idx === -1) return false;
        const [el] = this.elements.splice(idx, 1);
        this.elements.splice(Math.max(0, Math.min(newIndex, this.elements.length)), 0, el);
        return true;
    }
    updateSceneSettings(partial: any) {
        this.settings = { ...this.settings, ...partial };
        return this.settings;
    }
}

declare global {
    interface Window {
        vis?: any;
    }
}

describe('Undo - drag pushes snapshot; scrub does not', () => {
    beforeEach(() => {
        globalMacroManager.clearMacros();
        const sb = new DragSceneBuilder();
        sb.addElement('textOverlay', 'el1', { offsetX: 10, offsetY: 20 });
        (globalThis as any).window = (globalThis as any).window || {};
        (window as any).vis = { getSceneBuilder: () => sb };
        instrumentSceneBuilderForUndo(sb);
        createSnapshotUndoController(useTimelineStore, { debounceMs: 5, maxDepth: 10 });
    });

    it('element position drag creates undo snapshot', async () => {
        const undo: any = (window as any).__mvmntUndo;
        const sb = (window as any).vis.getSceneBuilder();
        const initial = sb.serializeScene().elements[0];
        sb.updateElementConfig('el1', { offsetX: 100, offsetY: 200 });
        // mark dirty like finalizeDrag would
        undo.markDirty();
        await new Promise((r) => setTimeout(r, 15));
        expect(undo.canUndo()).toBe(true);
        undo.undo();
        await new Promise((r) => setTimeout(r, 10));
        const after = sb.serializeScene().elements[0];
        expect(after.offsetX).toBe(initial.offsetX);
        expect(after.offsetY).toBe(initial.offsetY);
    });

    it('scrubbing playhead does not create extra snapshots', async () => {
        const undo: any = (window as any).__mvmntUndo;
        const startLen = undo.debugStack().length;
        // perform a series of scrubs
        const api = useTimelineStore.getState();
        for (let i = 0; i < 10; i++) {
            api.setCurrentTick(i * 120, 'user');
        }
        await new Promise((r) => setTimeout(r, 30));
        const endLen = undo.debugStack().length;
        // Expect no new snapshots purely from scrubbing
        expect(endLen).toBe(startLen); // unchanged because currentTick filtered & stripped
    });
});
