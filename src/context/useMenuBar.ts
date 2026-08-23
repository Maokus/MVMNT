import { useEffect, useRef } from 'react';
import { dispatchSceneCommand } from '@state/scene';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { exportScene, importScene } from '@persistence/index';
import { LocalFileStore } from '@persistence/local-file-store';
import type { ImportError } from '@persistence/import';
import { loadPlugin } from '@core/scene/plugins';
import type { DesktopOpenResult } from '../../electron/shared/desktop-api';
import { analytics } from '@app/analytics';
import { writeNativeDocument } from '@persistence/native-document-writer';
import { useDocumentSaveStatusStore } from '@state/documentSaveStatusStore';

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
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
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
    captureSaveRevision: () => number;
    markSaveCleanIfRevision: (revision: number) => boolean;
    markDirty: () => void;
    requestUnsavedChangesDecision: (message: string) => Promise<'save' | 'discard' | 'cancel'>;
}

interface MenuBarActions {
    saveProject: (forceSaveAs?: boolean) => Promise<boolean>;
    loadScene: () => void;
    openDesktopFile: (result: DesktopOpenResult) => Promise<void>;
    clearScene: () => void;
    createNewDefaultScene: () => Promise<boolean>;
}

export const useMenuBar = ({
    visualizer,
    sceneName,
    onSceneNameChange,
    onSceneRefresh,
    isDirty,
    markSaveClean,
    captureSaveRevision,
    markSaveCleanIfRevision,
    markDirty,
    requestUnsavedChangesDecision,
}: UseMenuBarProps): MenuBarActions => {
    const sceneNameRef = useRef(sceneName);
    sceneNameRef.current = sceneName;
    const saveQueueRef = useRef<{
        forceSaveAs: boolean;
        waiters: Array<(saved: boolean) => void>;
    } | null>(null);
    const saveDrainActiveRef = useRef(false);
    const saveDrainPromiseRef = useRef<Promise<void> | null>(null);
    const successTimerRef = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        },
        []
    );
    // Access undo (optional if provider disabled)
    let undo: ReturnType<typeof useUndo> | null = null;
    try {
        undo = useUndo();
    } catch {
        /* provider may not exist in some tests */
    }

    const saveScene = async (
        projectName?: string,
        options?: { embedPlugins?: boolean; saveAsSelectionId?: string },
        saveRevision = captureSaveRevision()
    ): Promise<{ saved: boolean; canceled: boolean; revision: number; warnings: string[] }> => {
        const nameToUse = projectName?.trim() ? projectName.trim() : sceneNameRef.current;
        const statusStore = useDocumentSaveStatusStore.getState();
        statusStore.setSaving(0, `Saving ${nameToUse || 'scene'}…`);
        try {
            const res = await exportScene(nameToUse, {
                embedPlugins: options?.embedPlugins,
                onProgress: (progress, message) =>
                    useDocumentSaveStatusStore
                        .getState()
                        .setSaving(progress * 0.9, message ?? `Saving ${nameToUse || 'scene'}…`),
            });
            if (!res.ok) {
                const errors = res.errors?.map((error) => error.message) ?? ['Export failed.'];
                statusStore.setResult('error', 'Save failed', errors);
                return { saved: false, canceled: false, revision: saveRevision, warnings: [] };
            }
            const desktop = window.mvmntDesktop;
            if (!desktop) throw new Error('MVMNT desktop services are unavailable.');
            statusStore.setSaving(0.9, 'Writing project…');
            const saveResult = await writeNativeDocument(desktop.documents, res.zip, {
                selectionId: options?.saveAsSelectionId,
                onProgress: (progress) =>
                    useDocumentSaveStatusStore.getState().setSaving(0.9 + progress * 0.08, 'Writing project…'),
            });
            if (saveResult.status === 'error') {
                const message = saveResult.error || 'Unknown error';
                statusStore.setResult('error', 'Save failed', [message]);
                return { saved: false, canceled: false, revision: saveRevision, warnings: [] };
            }
            if (saveResult.status === 'canceled') {
                statusStore.clear();
                return { saved: false, canceled: true, revision: saveRevision, warnings: [] };
            }
            if (saveResult.displayName) {
                const savedName = saveResult.displayName.replace(/\.mvt$/i, '');
                if (savedName !== useSceneMetadataStore.getState().metadata.name) onSceneNameChange(savedName);
            }
            statusStore.setSaving(0.99, 'Updating recovery copy…');
            await LocalFileStore.save(res.zip).catch((error) => {
                console.warn('[saveScene] Recovery snapshot failed:', error);
            });
            const savedLatestRevision = markSaveCleanIfRevision(saveRevision);
            localStorage.setItem('mvmnt.desktop.recovery-state', savedLatestRevision ? 'clean' : 'dirty');
            console.log('Scene saved.');
            return { saved: true, canceled: false, revision: saveRevision, warnings: res.warnings ?? [] };
        } catch (e) {
            console.error('Export error:', e);
            const message = e instanceof Error ? e.message : String(e);
            statusStore.setResult('error', 'Save failed', [message]);
            return { saved: false, canceled: false, revision: saveRevision, warnings: [] };
        }
    };

    const performSave = async (forceSaveAs: boolean) => {
        let canonicalName = sceneNameRef.current;
        const desktop = window.mvmntDesktop;
        if (!desktop) return { saved: false, canceled: false, revision: captureSaveRevision(), warnings: [] };
        try {
            const document = await desktop.documents.getState();
            if (forceSaveAs || document.status !== 'saved') {
                const selection = await desktop.documents.chooseSaveAs({
                    suggestedName: `${canonicalName || 'Untitled'}.mvt`,
                });
                if (selection.status === 'canceled') {
                    useDocumentSaveStatusStore.getState().clear();
                    return { saved: false, canceled: true, revision: captureSaveRevision(), warnings: [] };
                }
                if (selection.status === 'error' || !selection.selectionId || !selection.displayName) {
                    const message = selection.error || 'Unknown error';
                    useDocumentSaveStatusStore.getState().setResult('error', 'Save As failed', [message]);
                    return { saved: false, canceled: false, revision: captureSaveRevision(), warnings: [] };
                }
                canonicalName = selection.displayName.replace(/\.mvt$/i, '');
                onSceneNameChange(canonicalName);
                const revision = captureSaveRevision();
                return saveScene(canonicalName, { saveAsSelectionId: selection.selectionId }, revision);
            }
            if (document.displayName) {
                canonicalName = document.displayName.replace(/\.mvt$/i, '');
                if (canonicalName !== sceneNameRef.current) onSceneNameChange(canonicalName);
            }
            const revision = captureSaveRevision();
            return saveScene(canonicalName, undefined, revision);
        } catch (error) {
            console.error('Save failed:', error);
            const message = error instanceof Error ? error.message : String(error);
            useDocumentSaveStatusStore.getState().setResult('error', 'Save failed', [message]);
            return { saved: false, canceled: false, revision: captureSaveRevision(), warnings: [] };
        }
    };

    const saveProject = (forceSaveAs = false): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            const queued = saveQueueRef.current;
            if (saveDrainActiveRef.current) {
                if (queued) {
                    queued.forceSaveAs ||= forceSaveAs;
                    queued.waiters.push(resolve);
                } else {
                    saveQueueRef.current = { forceSaveAs, waiters: [resolve] };
                }
                useDocumentSaveStatusStore.getState().setQueued(true);
                return;
            }

            saveDrainActiveRef.current = true;
            const drainPromise = (async () => {
                let request: {
                    forceSaveAs: boolean;
                    waiters: Array<(saved: boolean) => void>;
                } = { forceSaveAs, waiters: [resolve] };
                let finalWarnings: string[] = [];
                try {
                    while (true) {
                        const result = await performSave(request.forceSaveAs);
                        await analytics
                            .capture(
                                result.saved ? 'document_saved' : 'document_operation_failed',
                                result.saved
                                    ? { save_mode: request.forceSaveAs ? 'save_as' : 'save' }
                                    : { operation: 'save', failure_category: 'save' }
                            )
                            .catch(() => undefined);
                        request.waiters.forEach((waiter) => waiter(result.saved));
                        if (!result.saved) {
                            saveQueueRef.current?.waiters.forEach((waiter) => waiter(false));
                            saveQueueRef.current = null;
                            break;
                        }
                        finalWarnings = result.warnings;
                        const next = saveQueueRef.current;
                        saveQueueRef.current = null;
                        if (!next) break;
                        useDocumentSaveStatusStore.getState().setQueued(false);
                        if (!next.forceSaveAs && captureSaveRevision() <= result.revision) {
                            next.waiters.forEach((waiter) => waiter(true));
                            break;
                        }
                        request = next;
                    }

                    if (useDocumentSaveStatusStore.getState().phase !== 'error') {
                        if (finalWarnings.length > 0) {
                            useDocumentSaveStatusStore
                                .getState()
                                .setResult('warning', 'Saved with warnings', finalWarnings);
                        } else if (useDocumentSaveStatusStore.getState().phase !== 'idle') {
                            useDocumentSaveStatusStore.getState().setResult('saved', 'Saved');
                            if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
                            successTimerRef.current = window.setTimeout(() => {
                                if (useDocumentSaveStatusStore.getState().phase === 'saved') {
                                    useDocumentSaveStatusStore.getState().clear();
                                }
                            }, 2_000);
                        }
                    }
                } finally {
                    saveDrainActiveRef.current = false;
                    saveDrainPromiseRef.current = null;
                }
            })();
            saveDrainPromiseRef.current = drainPromise;
            void drainPromise;
        });
    };

    const openDesktopFile = async (result: DesktopOpenResult): Promise<void> => {
        if (result.canceled || !result.bytes) return;
        await saveDrainPromiseRef.current;
        if (isDirty) {
            const ok = window.confirm('Open this file?\n\nYou have unsaved changes that will be lost. Continue?');
            if (!ok) return;
        }
        if (result.kind === 'plugin') {
            const trusted = window.confirm(
                `Install ${result.displayName || 'this plugin'}?\n\nPlugins execute code inside MVMNT. Only install plugins from authors you trust.`
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
                onProgress: (progress, text) =>
                    statusStore.updateLoading({
                        progress: 0.35 + progress * 0.65,
                        message: text ?? `Loading ${fileName}…`,
                    }),
            });
            if (!imported.ok) {
                void analytics.capture('document_operation_failed', {
                    operation: 'open',
                    failure_category: 'import',
                });
                alert(
                    'Import failed: ' + (imported.errors.map(humanReadableImportError).join('\n') || 'Unknown error')
                );
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
            void analytics.capture('document_opened', { source: 'file_picker' });
        } catch (error) {
            if ((error as Error)?.name !== 'AbortError') {
                console.error('Desktop open failed:', error);
                void analytics.capture('document_operation_failed', {
                    operation: 'open',
                    failure_category: 'import',
                });
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
        void (async () => {
            await saveDrainPromiseRef.current;
            const result = await desktop.documents.open();
            await openDesktopFile(result);
        })();
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

    const createNewDefaultScene = async (): Promise<boolean> => {
        await saveDrainPromiseRef.current;
        if (isDirty) {
            const decision = await requestUnsavedChangesDecision(
                'Your current scene has unsaved changes. Save them before creating a new blank scene?'
            );
            if (decision === 'cancel') return false;
            if (decision === 'save') {
                const saved = await saveProject(false);
                if (!saved) return false;
            }
        }

        // A blank scene is a new document, never an edit of the opened file.
        if (window.mvmntDesktop) await window.mvmntDesktop.documents.clearActivePath();
        const result = dispatchSceneCommand(
            { type: 'clearScene', clearMacros: true },
            { source: 'useMenuBar.createNewBlankScene' }
        );
        if (!result.success) {
            console.warn('Failed to create blank scene', result.error);
            return false;
        }
        try {
            useTimelineStore.getState().resetTimeline();
        } catch {}
        onSceneNameChange(SceneNameGenerator.generate());
        try {
            const settings = useSceneStore.getState().settings;
            visualizer?.canvas?.dispatchEvent(
                new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
            );
        } catch {}
        visualizer?.invalidateRender?.();
        onSceneRefresh?.();
        localStorage.setItem('mvmnt.desktop.recovery-state', 'dirty');
        markDirty();
        void analytics.capture('document_created', { entry_point: 'menu' });
        return true;
    };

    return {
        saveProject,
        loadScene,
        openDesktopFile,
        clearScene,
        createNewDefaultScene,
    };
};
