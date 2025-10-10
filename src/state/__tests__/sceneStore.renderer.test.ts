import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore, DEFAULT_SCENE_SETTINGS } from '@state/sceneStore';
import { setCanvasRendererOverride } from '@utils/renderEnvironment';

describe('scene renderer preference gating', () => {
    beforeEach(() => {
        setCanvasRendererOverride('disable');
        useSceneStore.setState({ settings: { ...DEFAULT_SCENE_SETTINGS } });
    });

    afterEach(() => {
        setCanvasRendererOverride(null);
        useSceneStore.setState({ settings: { ...DEFAULT_SCENE_SETTINGS } });
    });

    it('coerces legacy canvas preferences to WebGL when the fallback is disabled', () => {
        useSceneStore.getState().updateSettings({ renderer: 'canvas2d' });
        expect(useSceneStore.getState().settings.renderer).toBe('webgl');
    });

    it('retains canvas preferences when the development override is enabled', () => {
        setCanvasRendererOverride('enable');
        useSceneStore.getState().updateSettings({ renderer: 'canvas2d' });
        expect(useSceneStore.getState().settings.renderer).toBe('canvas2d');
    });
});
