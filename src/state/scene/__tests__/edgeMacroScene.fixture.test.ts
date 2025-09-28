import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEdgeMacroScene } from '@state/scene/fixtures/edgeMacroScene';
import fixture from '@persistence/__fixtures__/phase0/scene.edge-macros.json';
import { globalMacroManager } from '@bindings/macro-manager';

describe('edge macro scene fixture parity', () => {
    beforeEach(() => {
        globalMacroManager.clearMacros();
    });

    afterEach(() => {
        globalMacroManager.clearMacros();
    });

    it('reproduces the stored fixture snapshot', () => {
        const { snapshot } = buildEdgeMacroScene();
        expect(snapshot).toEqual(fixture);
    });
});
