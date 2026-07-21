import { loadDefaultScene, resetToDefaultScene } from '@core/default-scene-loader';
import { dispatchSceneCommand } from '@state/scene';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { exportScene, importScene } from '@persistence/index';
import { extractSceneMetadataFromArtifact } from '@persistence/scene-package';
import { LocalSaveService } from '@persistence/local-save-service';
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

function createAbortError(): Error {
    if (typeof DOMException === 'function') {
        return new DOMException('File load aborted', 'AbortError');
    }
    const error = new Error('File load aborted');
    error.name = 'AbortError';
    return error;
}

function readFileWithProgress(
    file: File,
    signal: AbortSignal,
    onProgress: (progress: number, text?: string) => void,
): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const abort = () => {
            if (reader.readyState === FileReader.LOADING) {
                reader.abort();
            }
            reject(createAbortError());
        };
        if (signal.aborted) {
            reject(createAbortError());
            return;
        }
        signal.addEventListener('abort', abort, { once: true });
        reader.onprogress = (event) => {
            if (!event.lengthComputable || event.total <= 0) return;
            onProgress(Math.min(0.35, (event.loaded / event.total) * 0.35), 'Reading file…');
        };
        reader.onload = () => {
            signal.removeEventListener('abort', abort);
            resolve(reader.result as ArrayBuffer);
        };
        reader.onerror = () => {
            signal.removeEventListener('abort', abort);
            reject(reader.error ?? new Error('Failed to read file'));
        };
        reader.onabort = () => {
            signal.removeEventListener('abort', abort);
            reject(createAbortError());
        };
        onProgress(0, 'Reading file…');
        reader.readAsArrayBuffer(file);
    });
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
    saveScene: (projectName?: string, options?: { embedPlugins?: boolean; forceSaveAs?: boolean }) => Promise<boolean>;
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

    const saveScene = async (projectName?: string, options?: { embedPlugins?: boolean; forceSaveAs?: boolean }) => {
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
            const safeName = nameToUse.replace(/[^a-zA-Z0-9]/g, '_') || 'scene';
            const exportBlob = res.blob || new Blob([toArrayBuffer(res.zip)], { type: 'application/zip' });
            const extension = '.mvt';
            const desktop = window.mvmntDesktop;
            if (desktop) {
                useTemplateStatusStore.getState().updateLoading({ progress: 0.95, message: 'Writing project…' });
                const request = { bytes: res.zip, suggestedName: `${safeName}${extension}` };
                const saveResult = options?.forceSaveAs
                    ? await desktop.documents.saveAs(request)
                    : await desktop.documents.save(request);
                if (saveResult.status === 'error') {
                    alert(`Save failed: ${saveResult.error || 'Unknown error'}`);
                    return false;
                }
                if (saveResult.status === 'canceled') return false;
                await LocalFileStore.save(res.zip).catch((error) => {
                    console.warn('[saveScene] Recovery snapshot failed:', error);
                });
                localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
                markSaveClean();
                console.log('Scene saved.');
                return true;
            }
            useTemplateStatusStore.getState().updateLoading({ progress: 1, message: 'Starting download…' });
            const url = URL.createObjectURL(exportBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeName}${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log('Scene exported.');
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
        return saveScene(sceneName, { forceSaveAs });
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
            const metadata = extractSceneMetadataFromArtifact(result.bytes);
            const fallbackName = fileName.replace(/\.mvt$/i, '');
            onSceneNameChange(metadata?.name?.trim() || fallbackName || sceneName);
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
        if (window.mvmntDesktop) {
            void window.mvmntDesktop.documents.open().then(openDesktopFile);
            return;
        }
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
            const abortController = new AbortController();
            const statusStore = useTemplateStatusStore.getState();
            statusStore.startLoading(`Loading ${file.name}…`, {
                progress: 0,
                onAbort: () => abortController.abort(),
            });
            try {
                const buffer = await readFileWithProgress(file, abortController.signal, (progress, text) => {
                    useTemplateStatusStore.getState().updateLoading({ progress, message: text });
                });
                const bytes = new Uint8Array(buffer);
                const result = await importScene(bytes, {
                    signal: abortController.signal,
                    onProgress: (progress, text) => {
                        useTemplateStatusStore.getState().updateLoading({
                            progress: 0.35 + progress * 0.65,
                            message: text ?? `Loading ${file.name}…`,
                        });
                    },
                });
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
                        const base = file.name.replace(/\.(mvt|json|mvmntpkg)$/i, '');
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
                if ((err as Error)?.name === 'AbortError') {
                    // An import can be cancelled after it has already applied part of
                    // the document. Leave the workspace in a deterministic empty state.
                    clearScene();
                } else {
                    console.error('Load error:', err);
                    alert('Error loading scene.');
                }
            } finally {
                useTemplateStatusStore.getState().finishLoading();
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

        if (window.mvmntDesktop) {
            void window.mvmntDesktop.documents.clearActivePath();
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
            if (saveResult.ok && !window.mvmntDesktop) {
                markSaveClean();
            } else if (saveResult.ok) {
                localStorage.setItem('mvmnt.desktop.recovery-state', 'dirty');
                markDirty();
            } else {
                console.warn('[createNewDefaultScene] IDB save failed:', saveResult.error);
            }

            console.log(`New default scene created with name: ${newSceneName}`);
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
