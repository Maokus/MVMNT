import { describe, it, expect, beforeEach } from 'vitest';
import { exportScene, importScene } from '@persistence/index';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { globalMacroManager } from '@bindings/macro-manager';

// Minimal fake scene builder injection
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
    loadScene(data: any) {
        this.elements = data.elements ? data.elements.map((e: any) => ({ ...e })) : [];
        if (data.sceneSettings) this.settings = { ...data.sceneSettings };
        return true;
    }
    addElementFromRegistry(type: string, cfg: any) {
        this.elements.push({ ...cfg, type });
        return true;
    }
    clearElements() {
        this.elements = [];
    }
}

declare global {
    interface Window {
        vis?: any;
    }
}

describe('Scene element + macro persistence', () => {
    beforeEach(() => {
        // reset store
        useTimelineStore.setState((s: any) => ({ ...s, tracks: {}, tracksOrder: [], midiCache: {} }));
        globalMacroManager.clearMacros();
        const instance = new FakeSceneBuilder();
        const fake = { getSceneBuilder: () => instance };
        // Each test new instance
        (globalThis as any).window = (globalThis as any).window || {};
        (window as any).vis = fake;
        // seed macros
        globalMacroManager.createMacro('m1', 'number', 5, {});
    });

    it('exports elements and macros', () => {
        const sb = (window as any).vis.getSceneBuilder();
        sb.addElementFromRegistry('textOverlay', { id: 'el1', type: 'textOverlay', text: 'Hello', zIndex: 1 });
        const res = exportScene();
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.envelope.scene.elements.length).toBe(1);
            expect(res.envelope.scene.macros?.macros?.m1?.value).toBe(5);
        }
    });

    it('imports elements and macros', () => {
        const sb = (window as any).vis.getSceneBuilder();
        sb.addElementFromRegistry('textOverlay', { id: 'el1', type: 'textOverlay', text: 'Hello', zIndex: 1 });
        const exp = exportScene();
        expect(exp.ok).toBe(true);
        // mutate before import to ensure restoration
        sb.clearElements();
        globalMacroManager.updateMacroValue('m1', 10);
        const json = (exp as any).json;
        const imp = importScene(json);
        expect(imp.ok).toBe(true);
        const exported = useSceneStore.getState().exportSceneDraft();
        expect(exported.elements.length).toBe(1);
        // macro value restored to export snapshot
        expect(globalMacroManager.getMacro('m1')?.value).toBe(5);
    });
});
