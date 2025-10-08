import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVisualizer } from '@context/VisualizerContext';
import { useScene } from '@context/SceneContext';
import { useUndo } from '@context/UndoContext';
import { importScene } from '@persistence/index';
import { dispatchSceneCommand } from '@state/scene';
import { loadDefaultScene } from '@core/default-scene-loader';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useSceneStore } from '@state/sceneStore';
import { clearStoredImportPayload, readStoredImportPayload } from '@utils/importPayloadStorage';
import { useTemplateStatusStore } from '@state/templateStatusStore';

const EasyModeTemplateInitializer: React.FC = () => {
    const { visualizer } = useVisualizer() as any;
    const { refreshSceneUI } = useScene();
    const setSceneAuthor = useSceneMetadataStore((state) => state.setAuthor);
    const undo = (() => {
        try {
            return useUndo();
        } catch {
            return null;
        }
    })();
    const location = useLocation();
    const navigate = useNavigate();
    const startTemplateLoading = useTemplateStatusStore((state) => state.startLoading);
    const finishTemplateLoading = useTemplateStatusStore((state) => state.finishLoading);

    useEffect(() => {
        if (!visualizer) return;
        const state: any = location.state || {};
        const sceneStoreState = (() => {
            try {
                return useSceneStore.getState();
            } catch {
                return null;
            }
        })();
        const hasScene = sceneStoreState ? sceneStoreState.order.length > 0 : false;
        const hasInitializedScene = sceneStoreState?.runtimeMeta?.hasInitializedScene ?? false;

        const shouldImport = Boolean(state.importScene);
        const shouldLoadTemplate = Boolean(state.template);
        const shouldLoadDefault = !shouldImport && !shouldLoadTemplate && !hasScene && !hasInitializedScene;
        const shouldShowIndicator = shouldImport || shouldLoadTemplate || shouldLoadDefault;
        const message = shouldImport
            ? 'Importing scene…'
            : shouldLoadTemplate
                ? 'Loading template…'
                : 'Preparing default scene…';

        let finished = false;
        let unsubscribeHydration: (() => void) | null = null;
        const finish = () => {
            if (finished || !shouldShowIndicator) return;
            finished = true;
            unsubscribeHydration?.();
            unsubscribeHydration = null;
            finishTemplateLoading();
        };

        if (shouldShowIndicator) {
            startTemplateLoading(message);
            try {
                const initialHydration = useSceneStore.getState().runtimeMeta?.lastHydratedAt ?? 0;
                unsubscribeHydration = useSceneStore.subscribe((state, previousState) => {
                    if (finished) return;
                    const nextHydration = state.runtimeMeta?.lastHydratedAt ?? 0;
                    const prevHydration = previousState.runtimeMeta?.lastHydratedAt ?? 0;
                    if (!nextHydration || nextHydration === prevHydration) return;
                    if (prevHydration !== initialHydration) return;
                    finish();
                });
            } catch {
                /* ignore */
            }
        }

        const run = async () => {
            let didChange = false;
            try {
                if (shouldImport) {
                    const payload = readStoredImportPayload();
                    if (payload) {
                        try {
                            const result = await importScene(payload);
                            if (!result.ok) {
                                console.warn('[HomePage Import] Failed:', result.errors.map((e) => e.message).join('\n'));
                            } else {
                                const metadataStore = useSceneMetadataStore.getState();
                                const currentAuthor = metadataStore.metadata?.author?.trim();
                                if (!currentAuthor) {
                                    setSceneAuthor('');
                                }
                                undo?.reset();
                                refreshSceneUI();
                                didChange = true;
                            }
                        } catch (err) {
                            console.error('Failed to import scene payload from HomePage', err);
                        }
                        clearStoredImportPayload();
                    }
                } else if (shouldLoadTemplate) {
                    const tpl = state.template as string;
                    dispatchSceneCommand({ type: 'clearScene', clearMacros: true }, { source: 'EasyModeTemplateInitializer.template' });
                    switch (tpl) {
                        case 'blank':
                            break;
                        case 'default':
                            await loadDefaultScene('EasyModeTemplateInitializer.default');
                            break;
                        case 'debug':
                            console.warn('Debug template is no longer available; loading default scene instead.');
                            await loadDefaultScene('EasyModeTemplateInitializer.debugFallback');
                            break;
                        default:
                            await loadDefaultScene('EasyModeTemplateInitializer.fallback');
                    }
                    setSceneAuthor('');
                    refreshSceneUI();
                    didChange = true;
                } else if (shouldLoadDefault) {
                    const loaded = await loadDefaultScene('EasyModeTemplateInitializer.initialDefault');
                    if (loaded) {
                        refreshSceneUI();
                        didChange = true;
                    }
                }

                if (didChange) {
                    visualizer.invalidateRender?.();
                    navigate('/easymode', { replace: true });
                }
            } catch (error) {
                console.error('Template initialization error', error);
            } finally {
                finish();
            }
        };

        run();

        return finish;
    }, [
        visualizer,
        location.state,
        navigate,
        refreshSceneUI,
        setSceneAuthor,
        undo,
        startTemplateLoading,
        finishTemplateLoading,
    ]);

    return null;
};

export default EasyModeTemplateInitializer;
