import { describe, expect, it, vi } from 'vitest';
import { createSceneViewPreferencesStore } from '@state/sceneViewPreferencesStore';

describe('scene view preferences', () => {
    it('defaults to collapsed groups and remembers an explicit choice', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                values.set(key, value);
            },
        };
        const first = createSceneViewPreferencesStore(storage);
        expect(first.getState().openGroupsCollapsed).toBe(true);
        first.getState().setOpenGroupsCollapsed(false);
        expect(createSceneViewPreferencesStore(storage).getState().openGroupsCollapsed).toBe(false);
        first.getState().setOpenGroupsCollapsed(true);
        expect(createSceneViewPreferencesStore(storage).getState().openGroupsCollapsed).toBe(true);
    });

    it('keeps working when local storage is unavailable', () => {
        const storage = {
            getItem: vi.fn(() => {
                throw new Error('unavailable');
            }),
            setItem: vi.fn(() => {
                throw new Error('unavailable');
            }),
        };
        const store = createSceneViewPreferencesStore(storage);
        expect(store.getState().openGroupsCollapsed).toBe(true);
        store.getState().setOpenGroupsCollapsed(false);
        expect(store.getState().openGroupsCollapsed).toBe(false);
    });
});
