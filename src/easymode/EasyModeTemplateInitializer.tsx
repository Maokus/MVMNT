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

    useEffect(() => {
        if (!visualizer) return;
        const state: any = location.state || {};
        let didChange = false;

        const run = async () => {
            try {
                if (state.importScene) {
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
                } else if (state.template) {
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
                } else {
                    const hasScene = (() => {
                        try {
                            return useSceneStore.getState().order.length > 0;
                        } catch {
                            return false;
                        }
                    })();
                    if (!hasScene) {
                        const loaded = await loadDefaultScene('EasyModeTemplateInitializer.initialDefault');
                        if (loaded) {
                            refreshSceneUI();
                            didChange = true;
                        }
                    }
                }

                if (didChange) {
                    visualizer.invalidateRender?.();
                    navigate('/easymode', { replace: true });
                }
            } catch (error) {
                console.error('Template initialization error', error);
            }
        };

        run();
    }, [visualizer, location.state, navigate, refreshSceneUI, setSceneAuthor, undo]);

    return null;
};

export default EasyModeTemplateInitializer;
