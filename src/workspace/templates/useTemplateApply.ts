import { useCallback } from 'react';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { importScene } from '@persistence/index';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { useUndo } from '@context/UndoContext';
import { useScene } from '@context/SceneContext';
import { useVisualizer } from '@context/VisualizerContext';
import { analytics } from '@app/analytics';
import type { LoadedTemplateArtifact, TemplateDefinition } from './types';

export function useTemplateApply() {
    const { refreshSceneUI, isDirty, markDirty } = useScene();
    const undo = useUndo();
    const visualizerCtx = useVisualizer() as { visualizer?: { invalidateRender?: () => void } } | undefined;
    const visualizer = visualizerCtx?.visualizer ?? (visualizerCtx as any);
    const startTemplateLoading = useTemplateStatusStore((state) => state.startLoading);
    const finishTemplateLoading = useTemplateStatusStore((state) => state.finishLoading);

    return useCallback(
        async (template: TemplateDefinition): Promise<boolean> => {
            if (isDirty) {
                const ok = window.confirm(
                    `Use template "${template.name}"?\n\nYou have unsaved changes that will be lost. Continue?`
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

                // Templates start a new document just like Cmd+N. Detach the
                // previous native file before hydrating new content so Save
                // must choose a new path instead of overwriting that file.
                await window.mvmntDesktop?.documents.clearActivePath();
                const result = await importScene(artifact.data);
                if (!result.ok) {
                    const message = result.errors.map((error) => error.message).join('\n') || 'Unknown error';
                    alert(`Failed to load template: ${message}`);
                    return false;
                }

                // Read the imported template's identity for attribution (hydrate() has already set these).
                const metadataStore = useSceneMetadataStore.getState();
                const importedName =
                    metadataStore.metadata?.name?.trim() || artifact.metadata?.name?.trim() || template.name;
                const importedAuthor =
                    metadataStore.metadata?.author?.trim() ||
                    artifact.metadata?.author?.trim() ||
                    template.author ||
                    '';

                const attribution = importedAuthor
                    ? `Based on "${importedName}" by ${importedAuthor}`
                    : `Based on "${importedName}"`;

                metadataStore.setName(SceneNameGenerator.generate());
                metadataStore.setAuthor('');
                metadataStore.setAttribution(attribution);

                if (typeof undo?.reset === 'function') {
                    undo.reset();
                }
                refreshSceneUI();
                visualizer?.invalidateRender?.();
                // Don't persist to IDB — this is a new unsaved remix, not a saved file.
                localStorage.setItem('mvmnt.desktop.recovery-state', 'dirty');
                markDirty();
                void analytics.capture('template_applied', { entry_point: 'workspace' });
                return true;
            } finally {
                finishTemplateLoading();
            }
        },
        [finishTemplateLoading, isDirty, markDirty, refreshSceneUI, startTemplateLoading, undo, visualizer]
    );
}
