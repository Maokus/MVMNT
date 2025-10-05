import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';

const FIXED_TIMESTAMP = 1700000000000;

type SceneFixtureResult = {
    snapshot: ReturnType<typeof exportSceneSnapshot>;
};

function withFrozenNow<T>(fn: () => T): T {
    const originalNow = Date.now;
    (Date as any).now = () => FIXED_TIMESTAMP;
    try {
        return fn();
    } finally {
        (Date as any).now = originalNow;
    }
}

function exportSceneSnapshot() {
    return useSceneStore.getState().exportSceneDraft();
}

function suppressConsole<T>(fn: () => T): T {
    const originalLog = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = originalLog;
    }
}

export function buildEdgeMacroScene(): SceneFixtureResult {
    const store = useSceneStore.getState();
    store.clearScene();
    store.replaceMacros(null);

    withFrozenNow(() => {
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'macro.color.primary',
            definition: { type: 'color', value: '#ff3366' },
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'macro.fontSize',
            definition: { type: 'number', value: 42, options: { min: 12, max: 96, step: 2 } },
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'macro.color.background',
            definition: { type: 'color', value: '#0f1114' },
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'macro.select.theme',
            definition: {
                type: 'select',
                value: 'bold',
                options: {
                    selectOptions: [
                        { value: 'bold', label: 'Bold' },
                        { value: 'minimal', label: 'Minimal' },
                        { value: 'retro', label: 'Retro' },
                    ],
                },
            },
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'macro.asset.cover',
            definition: { type: 'file-image', value: '', options: { accept: 'image/*' } },
        });
        dispatchSceneCommand({
            type: 'createMacro',
            macroId: 'macro.midi.track',
            definition: { type: 'midiTrackRef', value: [] },
        });
        suppressConsole(() => {
            dispatchSceneCommand({
                type: 'updateMacroValue',
                macroId: 'macro.asset.cover',
                value: 'assets/covers/default.png',
            });
            dispatchSceneCommand({
                type: 'updateMacroValue',
                macroId: 'macro.midi.track',
                value: ['track-1'],
            });
        });
    });

    dispatchSceneCommand({
        type: 'addElement',
        elementType: 'textOverlay',
        elementId: 'title',
        config: {
            id: 'title',
            text: { type: 'constant', value: 'Baseline Scene' },
            color: { type: 'macro', macroId: 'macro.color.primary' },
            fontSize: { type: 'macro', macroId: 'macro.fontSize' },
            offsetX: { type: 'constant', value: 0 },
            offsetY: { type: 'constant', value: 0 },
        },
    });

    dispatchSceneCommand({
        type: 'addElement',
        elementType: 'background',
        elementId: 'background',
        config: {
            id: 'background',
            backgroundColor: { type: 'macro', macroId: 'macro.color.background' },
        },
    });

    const snapshot = withFrozenNow(() => exportSceneSnapshot());
    return { snapshot };
}
