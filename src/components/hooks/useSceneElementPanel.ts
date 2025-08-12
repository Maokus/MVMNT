// DEPRECATED: useSceneElementPanel has been removed. Logic migrated into SceneSelectionContext.
// This file remains as a temporary shim. Remove imports of this hook and use useSceneSelection instead.
export function useSceneElementPanel() {
    if (process.env.NODE_ENV !== 'production') {
        console.warn('useSceneElementPanel is deprecated. Use useSceneSelection context instead.');
    }
    return {} as any;
}
