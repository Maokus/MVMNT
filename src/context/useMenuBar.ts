import { dispatchSceneCommand } from '@state/scene';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { exportScene, importScene } from '@persistence/index';
import { LocalFileStore } from '@persistence/local-file-store';
import type { ImportError } from '@persistence/import';
import { loadPlugin } from '@core/scene/plugins';
import type { DesktopOpenResult } from '../../electron/shared/desktop-api';

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
import { useTemplateStatusStore } from '@state/templateStatusStore';

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
    saveScene: (projectName?: string, options?: { embedPlugins?: boolean; saveAsSelectionId?: string }) => Promise<boolean>;
    saveProject: (forceSaveAs?: boolean) => Promise<boolean>;
    loadScene: () => void;
    openDesktopFile: (result: DesktopOpenResult) => Promise<void>;
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
    markDirty,
}: UseMenuBarProps): MenuBarActions => {
    // Access undo (optional if provider disabled)
    let undo: ReturnType<typeof useUndo> | null = null;
    try {
        undo = useUndo();
    } catch {
        /* provider may not exist in some tests */
    }

    const saveScene = async (projectName?: string, options?: { embedPlugins?: boolean; saveAsSelectionId?: string }) => {
        const nameToUse = projectName?.trim() ? projectName.trim() : sceneName;
        const statusStore = useTemplateStatusStore.getState();
        statusStore.startLoading(`Saving ${nameToUse || 'scene'}…`, { progress: 0 });
        try {
            const res = await exportScene(nameToUse, {
                embedPlugins: options?.embedPlugins,
                onProgress: (progress, message) => useTemplateStatusStore.getState().updateLoading({ progress, message }),
            });
            if (!res.ok) {
                alert(res.errors?.map((e) => e.message).join('\n') || 'Export failed.');
                return false;
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
            // The desktop filename is the canonical project name. Validation is
            // performed before user renames, so preserve the human-readable stem.
            const safeName = nameToUse || 'Untitled';
            const extension = '.mvt';
            const desktop = window.mvmntDesktop;
            if (!desktop) throw new Error('MVMNT desktop services are unavailable.');
            useTemplateStatusStore.getState().updateLoading({ progress: 0.95, message: 'Writing project…' });
            const request = { bytes: res.zip, suggestedName: `${safeName}${extension}` };
            const saveResult = options?.saveAsSelectionId
                ? await desktop.documents.writeSaveAs({ selectionId: options.saveAsSelectionId, bytes: res.zip })
                : await desktop.documents.save(request);
            if (saveResult.status === 'error') {
                alert(`Save failed: ${saveResult.error || 'Unknown error'}`);
                return false;
            }
            if (saveResult.status === 'canceled') return false;
            if (saveResult.displayName) {
                onSceneNameChange(saveResult.displayName.replace(/\.mvt$/i, ''));
            }
            await LocalFileStore.save(res.zip).catch((error) => {
                console.warn('[saveScene] Recovery snapshot failed:', error);
            });
            localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
            markSaveClean();
            console.log('Scene saved.');
            return true;
        } catch (e) {
            console.error('Export error:', e);
            alert('Error exporting scene. See console.');
            return false;
        } finally {
            useTemplateStatusStore.getState().finishLoading();
        }
    };

    const saveProject = async (forceSaveAs = false): Promise<boolean> => {
        let canonicalName = sceneName;
        const desktop = window.mvmntDesktop;
        if (!desktop) return false;
        const document = await desktop.documents.getState();
        if (forceSaveAs || document.status !== 'saved') {
            const selection = await desktop.documents.chooseSaveAs({ suggestedName: `${canonicalName || 'Untitled'}.mvt` });
            if (selection.status === 'canceled') return false;
            if (selection.status === 'error' || !selection.selectionId || !selection.displayName) {
                alert(`Save As failed: ${selection.error || 'Unknown error'}`);
                return false;
            }
            canonicalName = selection.displayName.replace(/\.mvt$/i, '');
            onSceneNameChange(canonicalName);
            return saveScene(canonicalName, { saveAsSelectionId: selection.selectionId });
        }
        if (document.displayName) {
            canonicalName = document.displayName.replace(/\.mvt$/i, '');
            if (canonicalName !== sceneName) onSceneNameChange(canonicalName);
        }
        return saveScene(canonicalName);
    };

    const openDesktopFile = async (result: DesktopOpenResult): Promise<void> => {
        if (result.canceled || !result.bytes) return;
        if (isDirty) {
            const ok = window.confirm('Open this file?\n\nYou have unsaved changes that will be lost. Continue?');
            if (!ok) return;
        }
        if (result.kind === 'plugin') {
            const trusted = window.confirm(
                `Install ${result.displayName || 'this plugin'}?\n\nPlugins execute code inside MVMNT. Only install plugins from authors you trust.`,
            );
            if (!trusted) return;
            const pluginResult = await loadPlugin(toArrayBuffer(result.bytes));
            if (!pluginResult.success) alert(pluginResult.error || 'Plugin installation failed.');
            return;
        }

        const fileName = result.displayName || 'scene.mvt';
        const statusStore = useTemplateStatusStore.getState();
        const abortController = new AbortController();
        statusStore.startLoading(`Loading ${fileName}…`, {
            progress: 0.35,
            onAbort: () => abortController.abort(),
        });
        try {
            const imported = await importScene(result.bytes, {
                signal: abortController.signal,
                onProgress: (progress, text) => statusStore.updateLoading({
                    progress: 0.35 + progress * 0.65,
                    message: text ?? `Loading ${fileName}…`,
                }),
            });
            if (!imported.ok) {
                alert('Import failed: ' + (imported.errors.map(humanReadableImportError).join('\n') || 'Unknown error'));
                return;
            }
            const fallbackName = fileName.replace(/\.mvt$/i, '');
            // The filename is canonical for a saved desktop project. Older files
            // may embed a different title; opening them reconciles to the path.
            onSceneNameChange(fallbackName || sceneName);
            undo?.reset();
            onSceneRefresh?.();
            await window.mvmntDesktop?.documents.acceptOpen();
            await LocalFileStore.save(result.bytes).catch(() => undefined);
            localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
            markSaveClean();
        } catch (error) {
            if ((error as Error)?.name !== 'AbortError') {
                console.error('Desktop open failed:', error);
                alert('Error loading scene.');
            }
        } finally {
            statusStore.finishLoading();
        }
    };

    const loadScene = () => {
        const desktop = window.mvmntDesktop;
        if (!desktop) {
            alert('MVMNT must be run through the desktop application.');
            return;
        }
        void desktop.documents.open().then(openDesktopFile);
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
        void (async () => {
            if (isDirty) {
                const saveFirst = window.confirm('Save changes before creating a new blank scene?');
                if (saveFirst) {
                    const saved = await saveProject(false);
                    if (!saved) return;
                } else {
                    const discard = window.confirm('Discard unsaved changes and create a new blank scene?');
                    if (!discard) return;
                }
            }

            // A blank scene is a new document, never an edit of the opened file.
            if (window.mvmntDesktop) await window.mvmntDesktop.documents.clearActivePath();
            const result = dispatchSceneCommand(
                { type: 'clearScene', clearMacros: true },
                { source: 'useMenuBar.createNewBlankScene' },
            );
            if (!result.success) {
                console.warn('Failed to create blank scene', result.error);
                return;
            }
            try { useTimelineStore.getState().resetTimeline(); } catch {}
            onSceneNameChange(SceneNameGenerator.generate());
            try {
                const settings = useSceneStore.getState().settings;
                visualizer?.canvas?.dispatchEvent(new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } }));
            } catch {}
            visualizer?.invalidateRender?.();
            onSceneRefresh?.();
            localStorage.setItem('mvmnt.desktop.recovery-state', 'dirty');
            markDirty();
        })();
    };

    return {
        saveScene,
        saveProject,
        loadScene,
        openDesktopFile,
        clearScene,
        createNewDefaultScene,
    };
};
