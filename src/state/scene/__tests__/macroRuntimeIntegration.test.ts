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

    it('propagates migrated position macros through host node transforms', () => {
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
        const nodeId = useSceneStore.getState().nodeIdByElementId['text-1'];
        expect(adapter.resolveFrame({}, 0).byNodeId.get(nodeId)?.nodeWorldTransform[4]).toBeCloseTo(12);

        dispatchSceneCommand({ type: 'updateMacroValue', macroId, value: 48 });

        expect(observedEvents).toContain('macroValueChanged');
        expect(adapter.resolveFrame({}, 0).byNodeId.get(nodeId)?.nodeWorldTransform[4]).toBeCloseTo(48);
        expect(useSceneStore.getState().macros.byId[macroId]?.value).toBe(48);

        adapter.dispose();
        unsubscribe();
    });
});
