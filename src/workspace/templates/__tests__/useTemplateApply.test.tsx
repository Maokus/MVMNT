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
    capture: vi.fn(),
}));

vi.mock('@persistence/index', () => ({ importScene: mocks.importScene }));
vi.mock('@context/SceneContext', () => ({ useScene: mocks.useScene }));
vi.mock('@context/UndoContext', () => ({ useUndo: mocks.useUndo }));
vi.mock('@context/VisualizerContext', () => ({ useVisualizer: mocks.useVisualizer }));
vi.mock('@app/analytics', () => ({ analytics: { capture: mocks.capture } }));

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
            useSceneMetadataStore.getState().hydrate({
                name: 'Template Scene',
                author: 'Template Author',
                createdAt: '2000-01-01T00:00:00.000Z',
                modifiedAt: '2000-01-01T00:00:00.000Z',
            });
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
        expect(useSceneMetadataStore.getState().metadata.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
        expect(useSceneMetadataStore.getState().metadata.modifiedAt).toBe(
            useSceneMetadataStore.getState().metadata.createdAt
        );
        expect(localStorage.getItem('mvmnt.desktop.recovery-state')).toBe('dirty');
        expect(resetUndo).toHaveBeenCalledOnce();
        expect(refreshSceneUI).toHaveBeenCalledOnce();
        expect(invalidateRender).toHaveBeenCalledOnce();
        expect(markDirty).toHaveBeenCalledOnce();
        expect(mocks.capture).toHaveBeenCalledWith('independent_project_started', { source: 'template' });
    });

    it('does not classify the tutorial template as independent work', async () => {
        const { result } = renderHook(() => useTemplateApply());
        await act(async () => {
            expect(
                await result.current(
                    {
                        id: 'tutorial',
                        name: 'Tutorial',
                        description: '',
                        loadArtifact: async () => ({ data: new Uint8Array([1]) }),
                    },
                    'tutorial'
                )
            ).toBe(true);
        });
        expect(mocks.capture).toHaveBeenCalledWith('template_applied', { entry_point: 'workspace' });
        expect(mocks.capture).not.toHaveBeenCalledWith('independent_project_started', expect.anything());
    });

    it('preserves the current document when replacing dirty work is cancelled', async () => {
        mocks.useScene.mockReturnValue({ isDirty: true, markDirty, refreshSceneUI });
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const loadArtifact = vi.fn();
        const { result } = renderHook(() => useTemplateApply());
        await act(async () => {
            expect(await result.current({ id: 'default', name: 'Demo', description: '', loadArtifact })).toBe(false);
        });
        expect(loadArtifact).not.toHaveBeenCalled();
        expect(clearActivePath).not.toHaveBeenCalled();
        expect(mocks.importScene).not.toHaveBeenCalled();
    });

    it('keeps a loaded template usable when local storage is unavailable', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('Storage unavailable');
        });
        const { result } = renderHook(() => useTemplateApply());
        await act(async () => {
            expect(
                await result.current({
                    id: 'default',
                    name: 'Demo',
                    description: '',
                    loadArtifact: async () => ({ data: new Uint8Array([1]) }),
                })
            ).toBe(true);
        });
        expect(markDirty).toHaveBeenCalledOnce();
    });
});
