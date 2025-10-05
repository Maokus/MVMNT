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

const EasyModeTemplateInitializer: React.FC = () => {
    const { visualizer } = useVisualizer() as any;
    const { setSceneName, refreshSceneUI } = useScene();
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
                    const payload = sessionStorage.getItem('mvmnt_import_scene_payload');
                    if (payload) {
                        try {
                            const result = await importScene(payload);
                        if (!result.ok) {
                            console.warn('[HomePage Import] Failed:', result.errors.map((e) => e.message).join('\n'));
                        } else {
                            try {
                                const parsed = JSON.parse(payload);
                                if (parsed?.metadata?.name) setSceneName(parsed.metadata.name);
                                if (parsed?.metadata?.author) {
                                    setSceneAuthor(parsed.metadata.author);
                                } else {
                                    setSceneAuthor('');
                                }
                            } catch {
                                /* ignore parse errors */
                            }
                            undo?.reset();
                            refreshSceneUI();
                            didChange = true;
                        }
                        } catch (err) {
                            console.error('Failed to import scene payload from HomePage', err);
                        }
                        sessionStorage.removeItem('mvmnt_import_scene_payload');
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
    }, [visualizer, location.state, navigate, refreshSceneUI, setSceneAuthor, setSceneName, undo]);

    return null;
};

export default EasyModeTemplateInitializer;
