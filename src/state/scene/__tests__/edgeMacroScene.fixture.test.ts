import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEdgeMacroScene } from '@state/scene/fixtures/edgeMacroScene';
import fixture from '@persistence/__fixtures__/phase0/scene.edge-macros.json';

describe('edge macro scene fixture parity', () => {
    it('reproduces the stored fixture snapshot', () => {
        const { snapshot } = buildEdgeMacroScene();
        expect(snapshot).toEqual(fixture);
    });
});
