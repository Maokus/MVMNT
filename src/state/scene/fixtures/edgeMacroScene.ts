import { HybridSceneBuilder } from '@core/scene-builder';
import { globalMacroManager } from '@bindings/macro-manager';
import { snapshotBuilder, type SceneBuilderSnapshot } from '@state/scene/snapshotBuilder';

const FIXED_TIMESTAMP = 1700000000000;

type BuilderFactoryResult = {
    builder: HybridSceneBuilder;
    snapshot: SceneBuilderSnapshot;
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

function suppressConsole<T>(fn: () => T): T {
    const originalLog = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = originalLog;
    }
}

export function buildEdgeMacroScene(): BuilderFactoryResult {
    globalMacroManager.clearMacros();
    const builder = new HybridSceneBuilder();
    builder.clearElements();

    withFrozenNow(() => {
        globalMacroManager.createMacro('macro.color.primary', 'color', '#ff3366');
        globalMacroManager.createMacro('macro.fontSize', 'number', 42, { min: 12, max: 96, step: 2 });
        globalMacroManager.createMacro('macro.color.background', 'color', '#0f1114');
        globalMacroManager.createMacro('macro.select.theme', 'select', 'bold', {
            selectOptions: [
                { value: 'bold', label: 'Bold' },
                { value: 'minimal', label: 'Minimal' },
                { value: 'retro', label: 'Retro' },
            ],
        });
        globalMacroManager.createMacro('macro.asset.cover', 'file-image', '', { accept: 'image/*' });
        globalMacroManager.createMacro('macro.midi.track', 'midiTrackRef', [], {});
        suppressConsole(() => {
            globalMacroManager.updateMacroValue('macro.asset.cover', 'assets/covers/default.png');
            globalMacroManager.updateMacroValue('macro.midi.track', ['track-1']);
        });
    });

    const text = builder.addElementFromRegistry('textOverlay', { id: 'title', text: 'Phase 0' });
    if (!text) throw new Error('Failed to create textOverlay element');
    const textEl: any = builder.getElement('title');
    textEl.bindToMacro('color', 'macro.color.primary');
    textEl.bindToMacro('fontSize', 'macro.fontSize');

    const bg = builder.addElementFromRegistry('background', { id: 'background' });
    if (!bg) throw new Error('Failed to create background element');
    const bgEl: any = builder.getElement('background');
    bgEl.bindToMacro('backgroundColor', 'macro.color.background');

    const snapshot = withFrozenNow(() => snapshotBuilder(builder));
    return { builder, snapshot };
}
