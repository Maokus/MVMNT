import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HybridSceneBuilder } from '@core/scene-builder';
import { snapshotBuilder } from '@state/scene/snapshotBuilder';
import { globalMacroManager } from '@bindings/macro-manager';

describe('snapshotBuilder', () => {
    beforeEach(() => {
        globalMacroManager.clearMacros();
    });

    afterEach(() => {
        globalMacroManager.clearMacros();
    });

    it('captures scene state, macros, and assignments', () => {
        const sb = new HybridSceneBuilder();
        globalMacroManager.createMacro('macro.color.primary', 'color', '#ff3366');
        globalMacroManager.createMacro('macro.fontSize', 'number', 42, { min: 12, max: 96, step: 2 });

        const created = sb.addElementFromRegistry('textOverlay', { id: 'title', text: 'Phase 0' });
        expect(created).toBeTruthy();

        const el: any = sb.getElement('title');
        expect(el).toBeTruthy();
        el.bindToMacro('color', 'macro.color.primary');
        el.bindToMacro('fontSize', 'macro.fontSize');

        const snapshot = snapshotBuilder(sb);

        expect(snapshot.scene.sceneSettings.fps).toBeGreaterThan(0);
        expect(snapshot.scene.elements).toHaveLength(1);
        expect(snapshot.scene.elements[0].id).toBe('title');
        expect(snapshot.scene.macros?.macros?.['macro.color.primary']).toBeDefined();
        expect(snapshot.scene.macros?.macros?.['macro.fontSize']).toBeDefined();

        expect(snapshot.assignments).toEqual(
            expect.arrayContaining([
                { elementId: 'title', propertyPath: 'color', macroId: 'macro.color.primary' },
                { elementId: 'title', propertyPath: 'fontSize', macroId: 'macro.fontSize' },
            ])
        );

        expect(snapshot.registry.serializedElementIds).toEqual(['title']);
        expect(snapshot.registry.registryKeys).toEqual(['title']);
        expect(snapshot.registry.missingIds).toHaveLength(0);
        expect(snapshot.registry.orphanRegistryIds).toHaveLength(0);
        expect(snapshot.registry.duplicateElementIds).toHaveLength(0);
        expect(typeof snapshot.meta.capturedAt).toBe('string');
    });
});
