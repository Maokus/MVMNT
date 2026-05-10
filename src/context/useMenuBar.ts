import { loadDefaultScene, resetToDefaultScene } from '@core/default-scene-loader';
import { dispatchSceneCommand } from '@state/scene';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { exportScene, importScene } from '@persistence/index';
import { extractSceneMetadataFromArtifact } from '@persistence/scene-package';
import { LocalSaveService } from '@persistence/local-save-service';
import type { ImportError } from '@persistence/import';

function humanReadableImportError(error: ImportError): string {
    switch (error.code) {
        case 'ERR_SCHEMA_VERSION':
            return "This file was created with a newer version of MVMNT and can't be opened here. Update MVMNT to the latest version and try again.";
        default:
            return error.message;
    }
}
import { useUndo } from './UndoContext';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    const buffer = view.buffer as ArrayBuffer;
    if (view.byteOffset === 0 && view.byteLength === buffer.byteLength) {
        return buffer;
    }
    if (typeof buffer.slice === 'function') {
        return buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    }
    return view.slice().buffer as ArrayBuffer;
}

interface UseMenuBarProps {
    visualizer: any;
    sceneName: string;
    onSceneNameChange: (name: string) => void;
    onSceneRefresh?: () => void;
    isDirty: boolean;
    markSaveClean: () => void;
    markDirty: () => void;
}

interface MenuBarActions {
    saveScene: (projectName?: string, options?: { embedPlugins?: boolean }) => Promise<void>;
    loadScene: () => void;
    clearScene: () => void;
    createNewDefaultScene: () => void;
}

export const useMenuBar = ({
    visualizer,
    sceneName,
    onSceneNameChange,
    onSceneRefresh,
    isDirty,
    markSaveClean,
    markDirty: _markDirty,
}: UseMenuBarProps): MenuBarActions => {
    // Access undo (optional if provider disabled)
    let undo: ReturnType<typeof useUndo> | null = null;
    try {
        undo = useUndo();
    } catch {
        /* provider may not exist in some tests */
    }

    const saveScene = async (projectName?: string, options?: { embedPlugins?: boolean }) => {
        try {
            const nameToUse = projectName?.trim() ? projectName.trim() : sceneName;
            const res = await exportScene(nameToUse, { embedPlugins: options?.embedPlugins });
            if (!res.ok) {
                alert(res.errors?.map((e) => e.message).join('\n') || 'Export failed.');
                return;
            }
            if (res.warnings?.length) {
                const elementWarnings = res.warnings.filter((w) => w.includes('could not be exported'));
                if (elementWarnings.length) {
                    console.warn('[saveScene] Some elements were skipped during export:', elementWarnings);
                    alert(
                        `Scene exported with warnings — ${elementWarnings.length} element(s) could not be exported and were skipped:\n\n` +
                            elementWarnings.join('\n')
                    );
                }
            }
            const safeName = nameToUse.replace(/[^a-zA-Z0-9]/g, '_') || 'scene';
            const { blob, mode } = res;
            const exportBlob =
                blob ||
                (mode === 'zip-package'
                    ? new Blob([toArrayBuffer(res.zip)], { type: 'application/zip' })
                    : new Blob([res.json], { type: 'application/json' }));
            const extension = mode === 'zip-package' ? '.mvt' : '.json';
            const url = URL.createObjectURL(exportBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeName}${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log('Scene exported.');
        } catch (e) {
            console.error('Export error:', e);
            alert('Error exporting scene. See console.');
        }
    };

    const loadScene = () => {
        if (isDirty) {
            const ok = window.confirm('Open a scene file?\n\nYou have unsaved changes that will be lost. Continue?');
            if (!ok) return;
        }
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        // Accept packaged .mvt exports, inline .json, and legacy .mvmntpkg files
        fileInput.accept = '.mvt,.json,.mvmntpkg';
        fileInput.style.display = 'none';
        fileInput.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) {
                document.body.removeChild(fileInput);
                return;
            }
            try {
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const result = await importScene(bytes);
                if (!result.ok) {
                    alert(
                        'Import failed: ' + (result.errors.map(humanReadableImportError).join('\n') || 'Unknown error')
                    );
                } else {
                    const metadata = extractSceneMetadataFromArtifact(bytes);
                    if (metadata?.name?.trim()) {
                        onSceneNameChange(metadata.name.trim());
                    } else if (file.name) {
                        // Fallback: derive scene name from filename (strip extension)
                        const base = file.name.replace(/\.(mvt|json)$/i, '');
                        if (base) onSceneNameChange(base);
                    }
                    undo?.reset();
                    if (onSceneRefresh) onSceneRefresh();
                    // Persist the loaded scene to IDB so it survives a page reload.
                    const saveResult = await LocalSaveService.saveCurrentFile();
                    if (saveResult.ok) {
                        markSaveClean();
                    } else {
                        console.warn('[loadScene] IDB save after open failed:', saveResult.error);
                    }
                    console.log('Scene opened.');
                }
            } catch (err) {
                console.error('Load error:', err);
                alert('Error loading scene.');
            } finally {
                document.body.removeChild(fileInput);
            }
        };
        fileInput.oncancel = () => {
            document.body.removeChild(fileInput);
        };
        document.body.appendChild(fileInput);
        fileInput.click();
    };

    const clearScene = () => {
        const result = dispatchSceneCommand(
            { type: 'clearScene', clearMacros: true },
            { source: 'useMenuBar.clearScene' }
        );
        if (!result.success) {
            console.warn('Failed to clear scene', result.error);
            return;
        }
        try {
            useTimelineStore.getState().resetTimeline();
        } catch {}
        try {
            const settings = useSceneStore.getState().settings;
            visualizer?.canvas?.dispatchEvent(
                new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
            );
        } catch {}
        visualizer?.invalidateRender?.();
        if (onSceneRefresh) {
            onSceneRefresh();
        }
        console.log('Scene cleared - all elements removed');
    };

    const createNewDefaultScene = () => {
        if (!visualizer) {
            console.log('New default scene functionality: visualizer not available');
            return;
        }

        if (isDirty) {
            const ok = window.confirm('Create a new scene?\n\nYou have unsaved changes that will be lost. Continue?');
            if (!ok) return;
        }

        void (async () => {
            const newSceneName = SceneNameGenerator.generate();

            let resetSucceeded = false;
            try {
                resetSucceeded = await resetToDefaultScene(visualizer);
            } catch (error) {
                console.warn('Failed to reset to default scene, attempting fallback import', error);
            }
            if (!resetSucceeded) {
                await loadDefaultScene('useMenuBar.createNewDefaultScene.fallback');
            }

            // Set the generated name after the template has loaded so the
            // template's embedded name does not overwrite the generated one.
            onSceneNameChange(newSceneName);

            try {
                const settings = useSceneStore.getState().settings;
                visualizer?.canvas?.dispatchEvent(
                    new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
                );
            } catch {}

            try {
                visualizer?.invalidateRender?.();
            } catch {}

            if (onSceneRefresh) {
                onSceneRefresh();
            }

            // Persist the new blank scene to IDB so a page reload restores it.
            const saveResult = await LocalSaveService.saveCurrentFile();
            if (saveResult.ok) {
                markSaveClean();
            } else {
                console.warn('[createNewDefaultScene] IDB save failed:', saveResult.error);
            }

            console.log(`New default scene created with name: ${newSceneName}`);
        })();
    };

    return {
        saveScene,
        loadScene,
        clearScene,
        createNewDefaultScene,
    };
};
