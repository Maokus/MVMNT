const env = (import.meta as any)?.env ?? {};
const sceneStoreUiRaw = env.VITE_ENABLE_SCENE_STORE_UI ?? env.VITE_SCENE_STORE_UI ?? env.SCENE_STORE_UI;

export const enableSceneStoreUI = sceneStoreUiRaw === true || sceneStoreUiRaw === 'true' || sceneStoreUiRaw === '1';
