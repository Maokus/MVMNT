import { createWithEqualityFn } from 'zustand/traditional';

const STORAGE_KEY = 'mvmnt.scene-view.open-groups-collapsed';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
interface SceneViewPreferences {
    openGroupsCollapsed: boolean;
    setOpenGroupsCollapsed(value: boolean): void;
}

function browserStorage(): PreferenceStorage | undefined {
    try {
        return typeof localStorage === 'undefined' ? undefined : localStorage;
    } catch {
        return undefined;
    }
}

export function createSceneViewPreferencesStore(storage: PreferenceStorage | undefined = browserStorage()) {
    let openGroupsCollapsed = true;
    try {
        const saved = storage?.getItem(STORAGE_KEY);
        if (saved === 'false') openGroupsCollapsed = false;
    } catch {
        /* The preference still works for this session when storage is unavailable. */
    }
    return createWithEqualityFn<SceneViewPreferences>((set) => ({
        openGroupsCollapsed,
        setOpenGroupsCollapsed(value) {
            set({ openGroupsCollapsed: value });
            try {
                storage?.setItem(STORAGE_KEY, String(value));
            } catch {
                /* Keep the session preference. */
            }
        },
    }));
}

export const useSceneViewPreferencesStore = createSceneViewPreferencesStore();
