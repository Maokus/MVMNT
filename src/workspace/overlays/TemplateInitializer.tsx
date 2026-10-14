import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVisualizer } from '@context/VisualizerContext';
import { useScene } from '@context/SceneContext';
import { useUndo } from '@context/UndoContext';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useTimelineStore } from '@state/timelineStore';
import { useTemplateStatusStore } from '@state/templateStatusStore';
import { deriveElementOrder } from '@state/scene-graph';
import { dispatchSceneCommand } from '@state/scene';
import { importScene } from '@persistence/index';
import { loadDefaultScene } from '@core/default-scene-loader';
import { clearStoredImportPayload, readStoredImportPayload } from '@utils/importPayloadStorage';
import { clearPendingDesktopProject, readPendingDesktopProjectName } from '../../desktop/pending-open';
import { clearPendingRender, hasPendingRender, markPendingRenderImported } from '../../desktop/pending-automation';
import { LocalSaveService } from '@persistence/local-save-service';
import { LocalFileStore } from '@persistence/local-file-store';
import { SceneNameGenerator } from '@core/scene-name-generator';
import { failPendingDocumentAnalytics } from '@app/analytics';
import { failedToLoadSceneDetail } from '@workspace/userMessages';

// Handles applying template/import based on navigation state or session storage
export const TemplateInitializer: React.FC = () => {
    const { visualizer } = useVisualizer() as any;
    const { refreshSceneUI, markSaveClean, markDirty } = useScene();
    const setSceneAuthor = useSceneMetadataStore((state) => state.setAuthor);
    const setSceneAttribution = useSceneMetadataStore((state) => state.setAttribution);
    const setSceneName = useSceneMetadataStore((state) => state.setName);
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
    const updateTemplateLoading = useTemplateStatusStore((state) => state.updateLoading);
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
        const hasScene = sceneStoreState ? deriveElementOrder(sceneStoreState.graph).length > 0 : false;
        const hasInitializedScene = useSceneEditorStore.getState().hasInitializedScene;

        const shouldImport = Boolean(state.importScene);
        const isNewDocumentImport = Boolean(state.newDocument);
        const shouldRestoreAutosave = Boolean(state.restoreAutosave);
        const shouldLoadTemplate = Boolean(state.template);
        const shouldLoadDefault = !shouldImport && !shouldLoadTemplate && !hasScene && !hasInitializedScene;
        const shouldShowIndicator = shouldImport || shouldLoadTemplate || shouldLoadDefault;
        const message = shouldImport
            ? 'Importing scene…'
            : shouldLoadTemplate
              ? 'Loading template…'
              : 'Checking for last open file…';

        let finished = false;
        let unsubscribeHydration: (() => void) | null = null;
        const abortController = shouldShowIndicator ? new AbortController() : null;
        const finish = (options: { abort?: boolean } = {}) => {
            if (finished || !shouldShowIndicator) return;
            finished = true;
            if (options.abort) {
                abortController?.abort();
            }
            unsubscribeHydration?.();
            unsubscribeHydration = null;
            finishTemplateLoading();
        };

        if (shouldShowIndicator) {
            startTemplateLoading(message, {
                progress: 0,
                onAbort: abortController ? () => abortController.abort() : null,
            });
            try {
                const initialHydration = useSceneEditorStore.getState().lastHydratedAt ?? 0;
                unsubscribeHydration = useSceneEditorStore.subscribe((state, previousState) => {
                    if (finished) return;
                    const nextHydration = state.lastHydratedAt ?? 0;
                    const prevHydration = previousState.lastHydratedAt ?? 0;
                    if (!nextHydration || nextHydration === prevHydration) return;
                    if (prevHydration !== initialHydration) return;
                    finish();
                });
            } catch {
                /* no-op */
            }
        }

        const run = async () => {
            let didChange = false;
            const clearSceneAfterAbort = () => {
                dispatchSceneCommand(
                    { type: 'clearScene', clearMacros: true },
                    { source: 'MidiVisualizer.TemplateInitializer.abort' }
                );
                try {
                    useTimelineStore.getState().resetTimeline();
                } catch {}
                refreshSceneUI();
                visualizer.invalidateRender?.();
            };
            try {
                if (shouldImport) {
                    const pendingDesktopName = readPendingDesktopProjectName();
                    const payload = readStoredImportPayload();
                    if (payload) {
                        try {
                            const result = await importScene(payload, {
                                signal: abortController?.signal,
                                onProgress: (progress, text) => updateTemplateLoading({ progress, message: text }),
                                autoInstallEmbeddedPlugins:
                                    sessionStorage.getItem('mvmnt.desktop.background-export.v1') !== null,
                            });
                            if (!result.ok) {
                                const msg = result.errors.map((e) => e.message).join('\n');
                                console.warn('[Import] Failed:', msg);
                                const cancelled = abortController?.signal.aborted ?? false;
                                void failPendingDocumentAnalytics(cancelled);
                                if (!cancelled) alert(failedToLoadSceneDetail(msg));
                            } else {
                                const metadataStore = useSceneMetadataStore.getState();
                                const importedName = metadataStore.metadata?.name?.trim() || 'Untitled';
                                const importedAuthor = metadataStore.metadata?.author?.trim() || '';
                                undo?.reset();
                                refreshSceneUI();
                                const isBackgroundExport =
                                    sessionStorage.getItem('mvmnt.desktop.background-export.v1') !== null;
                                if (isBackgroundExport) {
                                    setSceneName(importedName);
                                    sessionStorage.setItem('mvmnt.desktop.background-export.v1.imported', '1');
                                    window.dispatchEvent(new Event('mvmnt-project-imported'));
                                } else if (pendingDesktopName && window.mvmntDesktop && !isNewDocumentImport) {
                                    const fallbackName = pendingDesktopName.replace(/\.mvt$/i, '');
                                    // Desktop files use their filename as the canonical scene name.
                                    setSceneName(fallbackName || importedName);
                                    await window.mvmntDesktop.documents.acceptOpen();
                                    const recovery = await LocalSaveService.saveCurrentFile(
                                        fallbackName || importedName
                                    );
                                    if (!recovery.ok) {
                                        console.warn(
                                            '[Import] Could not save desktop recovery snapshot:',
                                            recovery.error
                                        );
                                    }
                                    localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
                                    markSaveClean();
                                    markPendingRenderImported();
                                    window.dispatchEvent(new Event('mvmnt-project-imported'));
                                } else {
                                    const attribution = importedAuthor
                                        ? `Based on "${importedName}" by ${importedAuthor}`
                                        : `Based on "${importedName}"`;
                                    setSceneName(SceneNameGenerator.generate());
                                    setSceneAuthor('');
                                    setSceneAttribution(attribution);
                                    useSceneMetadataStore.getState().stampNewDocument();
                                    useTimelineStore.getState().resetMidiTimingImportEligibility();
                                    // Browser/community imports remain new unsaved remixes.
                                    markDirty();
                                }
                                didChange = true;
                            }
                        } catch (e) {
                            if ((e as Error)?.name === 'AbortError') {
                                throw e;
                            }
                            console.error('Failed to import scene payload', e);
                            void failPendingDocumentAnalytics();
                            const message = e instanceof Error ? e.message : String(e);
                            if (hasPendingRender()) {
                                clearPendingRender();
                                window.mvmntDesktop?.automation.reportResult({ type: 'error', code: 'input', message });
                            } else {
                                alert(failedToLoadSceneDetail(message));
                            }
                        }
                        clearStoredImportPayload();
                        clearPendingDesktopProject();
                    }
                    // Always clear the importScene navigation state to prevent getting stuck
                    navigate('/workspace', { replace: true });
                } else if (shouldLoadTemplate) {
                    updateTemplateLoading({ progress: null, message: 'Loading template…', onAbort: null });
                    const tpl = state.template as string;
                    dispatchSceneCommand(
                        { type: 'clearScene', clearMacros: true },
                        { source: 'TemplateInitializer.template' }
                    );
                    try {
                        useTimelineStore.getState().resetTimeline();
                    } catch {}
                    switch (tpl) {
                        case 'blank':
                            setSceneName(SceneNameGenerator.generate());
                            break;
                        case 'default':
                            await loadDefaultScene('MidiVisualizer.TemplateInitializer.default');
                            break;
                        case 'debug':
                            console.warn('Debug template is no longer available; loading default scene instead.');
                            await loadDefaultScene('MidiVisualizer.TemplateInitializer.debugFallback');
                            break;
                        default:
                            await loadDefaultScene('MidiVisualizer.TemplateInitializer.fallback');
                    }
                    setSceneAuthor('');
                    useSceneMetadataStore.getState().stampNewDocument();
                    useTimelineStore.getState().resetMidiTimingImportEligibility();
                    refreshSceneUI();
                    if (state.desktopNew) {
                        localStorage.setItem('mvmnt.desktop.recovery-state', 'dirty');
                        markDirty();
                    }
                    didChange = true;
                } else if (shouldLoadDefault) {
                    const savedAt = await LocalSaveService.savedAt();
                    const desktopRecoveryState = window.mvmntDesktop
                        ? localStorage.getItem('mvmnt.desktop.recovery-state')
                        : null;
                    const restoreRecovery =
                        shouldRestoreAutosave ||
                        desktopRecoveryState !== 'dirty' ||
                        window.confirm('MVMNT found changes recovered from the previous session. Restore them?');
                    if (!restoreRecovery) {
                        await LocalFileStore.clear();
                        await window.mvmntDesktop?.documents.clearActivePath();
                        localStorage.setItem('mvmnt.desktop.recovery-state', 'clean');
                    }
                    // A clean desktop launch restores the actual native document,
                    // not the global recovery slot. The latter can belong to a
                    // previously opened project and must never be paired with a
                    // different active file path.
                    if (window.mvmntDesktop && desktopRecoveryState !== 'dirty' && restoreRecovery) {
                        const active = await window.mvmntDesktop.documents.restoreActive().catch((error) => {
                            // A renderer can briefly outrun a restarted Electron main
                            // process during development. Fall back safely instead of
                            // surfacing a missing IPC handler as a startup failure.
                            console.warn('[TemplateInitializer] Native active-document restore unavailable:', error);
                            return null;
                        });
                        if (active && !active.canceled && active.kind === 'project' && active.bytes) {
                            const result = await importScene(active.bytes, {
                                signal: abortController?.signal,
                                onProgress: (progress, text) => updateTemplateLoading({ progress, message: text }),
                            });
                            if (result.ok) {
                                const filename = active.displayName?.replace(/\.mvt$/i, '');
                                if (filename) setSceneName(filename);
                                await LocalFileStore.save(active.bytes).catch(() => undefined);
                                refreshSceneUI();
                                markSaveClean();
                                didChange = true;
                            } else {
                                console.warn(
                                    '[TemplateInitializer] Could not restore active desktop document:',
                                    result.errors
                                );
                            }
                        }
                    }
                    // Try to restore from the user's last local save first.
                    updateTemplateLoading({
                        progress: 0.05,
                        message: savedAt ? 'Loading last open file…' : 'Preparing default scene…',
                    });
                    const localResult =
                        !didChange && restoreRecovery
                            ? await LocalSaveService.loadSavedFile({
                                  signal: abortController?.signal,
                                  onProgress: (progress, text) => updateTemplateLoading({ progress, message: text }),
                              })
                            : { ok: true as const, loaded: false as const };
                    if (didChange) {
                        // The active native document is already hydrated.
                    } else if (localResult.ok && localResult.loaded) {
                        if (window.mvmntDesktop) {
                            const document = await window.mvmntDesktop.documents.getState();
                            if (document.status === 'saved' && document.displayName) {
                                setSceneName(document.displayName.replace(/\.mvt$/i, ''));
                            }
                        }
                        refreshSceneUI();
                        if (desktopRecoveryState === 'dirty') markDirty();
                        else markSaveClean();
                        didChange = true;
                    } else {
                        if (!localResult.ok) {
                            console.warn(
                                '[TemplateInitializer] Could not load local save, falling back to default scene:',
                                localResult.error
                            );
                        }
                        // No local save found (or corrupt) – load the default template.
                        updateTemplateLoading({ progress: null, message: 'Preparing default scene…', onAbort: null });
                        const loaded = await loadDefaultScene('MidiVisualizer.TemplateInitializer.initialDefault');
                        if (loaded) {
                            // Give the fresh scene a generated name (default template may have a generic one).
                            useSceneMetadataStore.getState().setName(SceneNameGenerator.generate());
                            useSceneMetadataStore.getState().stampNewDocument();
                            useTimelineStore.getState().resetMidiTimingImportEligibility();
                            refreshSceneUI();
                            // Establish a clean baseline so the asterisk doesn't show immediately.
                            markSaveClean();
                            didChange = true;
                        }
                    }
                }
                if (didChange) {
                    visualizer.invalidateRender?.();
                    window.dispatchEvent(new Event('mvmnt-project-imported'));
                    if (!shouldImport) {
                        navigate('/workspace', { replace: true });
                    }
                }
            } catch (e) {
                if ((e as Error)?.name === 'AbortError') {
                    void failPendingDocumentAnalytics(true);
                    clearSceneAfterAbort();
                } else {
                    void failPendingDocumentAnalytics();
                    console.error('Template initialization error', e);
                }
            } finally {
                finish();
            }
        };

        run();

        return () => finish({ abort: true });
    }, [
        visualizer,
        location.state,
        navigate,
        refreshSceneUI,
        markSaveClean,
        markDirty,
        setSceneAuthor,
        setSceneAttribution,
        setSceneName,
        undo,
        startTemplateLoading,
        finishTemplateLoading,
        updateTemplateLoading,
    ]);
    return null;
};
