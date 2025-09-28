import { describe, beforeEach, it, expect } from 'vitest';
import { dispatchSceneCommand, SceneRuntimeAdapter } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { subscribeToMacroEvents } from '@state/scene/macroSyncService';

function resetState() {
    const store = useSceneStore.getState();
    store.clearScene();
    store.replaceMacros(null);
}

describe('macro runtime integration', () => {
    beforeEach(() => {
        resetState();
    });

    it('propagates macro value changes to instantiated scene elements', () => {
        const macroId = 'macro.test.offset';

        dispatchSceneCommand({
            type: 'createMacro',
            macroId,
            definition: { type: 'number', value: 12 },
        });

        dispatchSceneCommand({
            type: 'addElement',
            elementType: 'textOverlay',
            elementId: 'text-1',
            config: {
                id: 'text-1',
                offsetX: { type: 'macro', macroId },
            },
        });

        const observedEvents: string[] = [];
        const unsubscribe = subscribeToMacroEvents((event) => {
            observedEvents.push(event.type);
        });

        const adapter = new SceneRuntimeAdapter();
        const elementBefore = adapter.getElements().find((el) => el.id === 'text-1');
        expect(elementBefore).toBeDefined();
        expect(elementBefore?.offsetX).toBeCloseTo(12);

        dispatchSceneCommand({ type: 'updateMacroValue', macroId, value: 48 });

        const elementAfter = adapter.getElements().find((el) => el.id === 'text-1');
        expect(observedEvents).toContain('macroValueChanged');
        expect(elementAfter?.offsetX).toBeCloseTo(48);
        expect(useSceneStore.getState().macros.byId[macroId]?.value).toBe(48);

        adapter.dispose();
        unsubscribe();
    });
});
