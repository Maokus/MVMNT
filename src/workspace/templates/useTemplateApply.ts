import { useCallback } from 'react';
import { importScene } from '@persistence/index';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { useUndo } from '@context/UndoContext';
import { useScene } from '@context/SceneContext';
import { useVisualizer } from '@context/VisualizerContext';
import type { LoadedTemplateArtifact, TemplateDefinition } from './types';

export function useTemplateApply() {
    const { refreshSceneUI, isDirty, saveToLocal } = useScene();
    const undo = useUndo();
    const visualizerCtx = useVisualizer() as { visualizer?: { invalidateRender?: () => void } } | undefined;
    const visualizer = visualizerCtx?.visualizer ?? (visualizerCtx as any);
    const startTemplateLoading = useTemplateStatusStore((state) => state.startLoading);
    const finishTemplateLoading = useTemplateStatusStore((state) => state.finishLoading);

    return useCallback(
        async (template: TemplateDefinition): Promise<boolean> => {
            if (isDirty) {
                const ok = window.confirm(
                    `Loading "${template.name}" will replace your current project.\n\nAny unsaved changes will be lost. Continue?`
                );
                if (!ok) return false;
            }

            const templateLabel = template.name.trim() || 'template';
            startTemplateLoading(`Loading ${templateLabel}…`);
            let artifact: LoadedTemplateArtifact;
            try {
                try {
                    artifact = await template.loadArtifact();
                } catch (error) {
                    console.error('Failed to load template content', error);
                    alert('Failed to load template. Please try again.');
                    return false;
                }
                const result = await importScene(artifact.data);
                if (!result.ok) {
                    const message = result.errors.map((error) => error.message).join('\n') || 'Unknown error';
                    alert(`Failed to load template: ${message}`);
                    return false;
                }
                const metadataStore = useSceneMetadataStore.getState();
                const importedName = metadataStore.metadata?.name?.trim();
                if (!importedName) {
                    const fallbackName = artifact.metadata?.name?.trim() || template.name;
                    if (fallbackName) {
                        metadataStore.setName(fallbackName);
                    }
                }
                const importedAuthor = metadataStore.metadata?.author?.trim();
                if (!importedAuthor || importedAuthor.length === 0) {
                    const fallbackAuthor = artifact.metadata?.author?.trim() || template.author || '';
                    metadataStore.setAuthor(fallbackAuthor);
                }
                if (typeof undo?.reset === 'function') {
                    undo.reset();
                }
                refreshSceneUI();
                visualizer?.invalidateRender?.();
                await saveToLocal();
                return true;
            } finally {
                finishTemplateLoading();
            }
        },
        [finishTemplateLoading, isDirty, refreshSceneUI, saveToLocal, startTemplateLoading, undo, visualizer]
    );
}
