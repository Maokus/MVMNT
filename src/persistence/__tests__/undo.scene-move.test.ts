import { describe, it, expect, beforeEach } from 'vitest';
import { createSnapshotUndoController } from '@persistence/undo/snapshot-undo';
import { useTimelineStore } from '@state/timelineStore';
import { globalMacroManager } from '@bindings/macro-manager';
import { instrumentSceneBuilderForUndo } from '@persistence/undo/snapshot-undo';

class FakeSceneBuilder {
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
    addElement(type: string, id: string) {
        this.elements.push({ id, type, zIndex: this.elements.length });
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

describe('Undo - element move retains macros & elements', () => {
    beforeEach(() => {
        globalMacroManager.clearMacros();
        globalMacroManager.createMacro('m1', 'number', 5, {});
        const sb = new FakeSceneBuilder();
        sb.addElement('textOverlay', 'a');
        sb.addElement('textOverlay', 'b');
        (globalThis as any).window = (globalThis as any).window || {};
        (window as any).vis = { getSceneBuilder: () => sb };
        instrumentSceneBuilderForUndo(sb);
        createSnapshotUndoController(useTimelineStore, { maxDepth: 20, debounceMs: 5 });
    });

    it('undo restores ordering and macros', async () => {
        const undo: any = (window as any).__mvmntUndo;
        const sb = (window as any).vis.getSceneBuilder();
        // move element b to front
        sb.moveElement('b', 0);
        // manually mark dirty because scene mutation doesn't touch timeline store
        try {
            (window as any).__mvmntUndo.markDirty();
        } catch {}
        await new Promise((r) => setTimeout(r, 15));
        expect(sb.serializeScene().elements[0].id).toBe('b');
        expect(undo.canUndo()).toBe(true);
        undo.undo();
        await new Promise((r) => setTimeout(r, 5));
        const els = sb.serializeScene().elements;
        expect(els[0].id).toBe('a');
        // macro still present
        expect(globalMacroManager.getMacro('m1')?.value).toBe(5);
    });
});
