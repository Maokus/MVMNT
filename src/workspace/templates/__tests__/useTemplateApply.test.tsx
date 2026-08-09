import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useTemplateApply } from '../useTemplateApply';

const mocks = vi.hoisted(() => ({
    importScene: vi.fn(),
    useScene: vi.fn(),
    useUndo: vi.fn(),
    useVisualizer: vi.fn(),
}));

vi.mock('@persistence/index', () => ({ importScene: mocks.importScene }));
vi.mock('@context/SceneContext', () => ({ useScene: mocks.useScene }));
vi.mock('@context/UndoContext', () => ({ useUndo: mocks.useUndo }));
vi.mock('@context/VisualizerContext', () => ({ useVisualizer: mocks.useVisualizer }));

describe('useTemplateApply', () => {
    const clearActivePath = vi.fn().mockResolvedValue(undefined);
    const markDirty = vi.fn();
    const refreshSceneUI = vi.fn();
    const resetUndo = vi.fn();
    const invalidateRender = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        clearActivePath.mockResolvedValue(undefined);
        mocks.useScene.mockReturnValue({
            isDirty: false,
            markDirty,
            refreshSceneUI,
            sceneName: 'Opened Project',
        });
        mocks.useUndo.mockReturnValue({ reset: resetUndo });
        mocks.useVisualizer.mockReturnValue({ visualizer: { invalidateRender } });
        mocks.importScene.mockImplementation(async () => {
            useSceneMetadataStore.getState().hydrate({ name: 'Template Scene', author: 'Template Author' });
            return { ok: true };
        });
        useSceneMetadataStore.getState().setMetadata({
            name: 'Opened Project',
            author: 'Project Author',
            attribution: '',
        });
        localStorage.clear();
        Object.defineProperty(window, 'mvmntDesktop', {
            configurable: true,
            value: { documents: { clearActivePath } },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Object.defineProperty(window, 'mvmntDesktop', { configurable: true, value: undefined });
    });

    it('starts a new untitled document before importing a workspace template', async () => {
        vi.spyOn(SceneNameGenerator, 'generate').mockReturnValue('fresh-scene');
        const artifact = { data: new Uint8Array([1, 2, 3]) };
        const { result } = renderHook(() => useTemplateApply());

        let applied = false;
        await act(async () => {
            applied = await result.current({
                id: 'template-id',
                name: 'Template Scene',
                description: 'Test template',
                author: 'Template Author',
                loadArtifact: async () => artifact,
            });
        });

        expect(applied).toBe(true);
        expect(clearActivePath).toHaveBeenCalledOnce();
        expect(clearActivePath.mock.invocationCallOrder[0]).toBeLessThan(mocks.importScene.mock.invocationCallOrder[0]);
        expect(mocks.importScene).toHaveBeenCalledWith(artifact.data);
        expect(useSceneMetadataStore.getState().metadata).toMatchObject({
            name: 'fresh-scene',
            author: '',
            attribution: 'Based on "Template Scene" by Template Author',
        });
        expect(localStorage.getItem('mvmnt.desktop.recovery-state')).toBe('dirty');
        expect(resetUndo).toHaveBeenCalledOnce();
        expect(refreshSceneUI).toHaveBeenCalledOnce();
        expect(invalidateRender).toHaveBeenCalledOnce();
        expect(markDirty).toHaveBeenCalledOnce();
    });
});
