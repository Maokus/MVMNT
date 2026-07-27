import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
    CloseRequestResult,
    DesktopMenuCommand,
    DesktopOpenResult,
    DesktopSaveRequest,
    DesktopSaveAsSelectionRequest,
    DesktopWriteSaveAsRequest,
    DesktopExportBeginRequest,
    DesktopExportDestinationRequest,
    DesktopExportCompleteRequest,
    DesktopExportWriteRequest,
    DesktopBackgroundExportRequest,
    DesktopBackgroundExportUpdate,
    MvmntDesktopApi,
} from './shared/desktop-api.js';
import type { DesktopAutomationProgress, DesktopAutomationResult, DesktopDeepLinkCommand, DesktopRenderRequest } from './shared/automation.js';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

const api: MvmntDesktopApi = {
    documents: {
        open: () => ipcRenderer.invoke('documents:open'),
        listRecent: () => ipcRenderer.invoke('documents:list-recent'),
        openRecent: (index) => ipcRenderer.invoke('documents:open-recent', index),
        save: (request: DesktopSaveRequest) => ipcRenderer.invoke('documents:save', request),
        chooseSaveAs: (request: DesktopSaveAsSelectionRequest) => ipcRenderer.invoke('documents:choose-save-as', request),
        writeSaveAs: (request: DesktopWriteSaveAsRequest) => ipcRenderer.invoke('documents:write-save-as', request),
        getState: () => ipcRenderer.invoke('documents:get-state'),
        restoreActive: () => ipcRenderer.invoke('documents:restore-active'),
        rename: (request) => ipcRenderer.invoke('documents:rename', request),
        acceptOpen: () => ipcRenderer.invoke('documents:accept-open'),
        clearActivePath: () => ipcRenderer.invoke('documents:clear-active-path'),
        setDirty: (isDirty: boolean) => ipcRenderer.send('documents:set-dirty', isDirty),
        onOpenPathRequest: (callback: (result: DesktopOpenResult) => void) =>
            subscribe('documents:open-path-request', callback),
    },
    menu: {
        onCommand: (callback: (command: DesktopMenuCommand) => void) =>
            subscribe('menu:command', callback),
    },
    lifecycle: {
        onCloseRequest: (callback: () => void) => subscribe('lifecycle:close-request', callback),
        completeCloseRequest: (result: CloseRequestResult) =>
            ipcRenderer.send('lifecycle:close-complete', result),
    },
    app: {
        getVersion: () => ipcRenderer.invoke('app:get-version'),
        notify: (title: string, body: string) => ipcRenderer.send('app:notify', title, body),
    },
    exports: {
        chooseDestination: (request: DesktopExportDestinationRequest) => ipcRenderer.invoke('exports:choose-destination', request),
        begin: (request: DesktopExportBeginRequest) => ipcRenderer.invoke('exports:begin', request),
        write: (request: DesktopExportWriteRequest) => ipcRenderer.invoke('exports:write', request),
        writeFrame: (request: DesktopExportWriteRequest) => ipcRenderer.invoke('exports:write-frame', request),
        writeArtifact: (request: DesktopExportWriteRequest) => ipcRenderer.invoke('exports:write-artifact', request),
        complete: (request: DesktopExportCompleteRequest) => ipcRenderer.invoke('exports:complete', request),
        abort: (sessionId: string) => ipcRenderer.invoke('exports:abort', sessionId),
        reveal: (outputId: string) => ipcRenderer.invoke('exports:reveal', outputId),
    },
    background: {
        start: (request: DesktopBackgroundExportRequest) => ipcRenderer.invoke('background:start', request),
        take: () => ipcRenderer.invoke('background:take'),
        cancel: (jobId: string) => ipcRenderer.invoke('background:cancel', jobId),
        update: (update: DesktopBackgroundExportUpdate) => ipcRenderer.send('background:update', update),
        complete: (update: DesktopBackgroundExportUpdate) => ipcRenderer.send('background:complete', update),
        onUpdate: (callback: (update: DesktopBackgroundExportUpdate) => void) => subscribe('background:update', callback),
        onCancel: (callback: (jobId: string) => void) => subscribe('background:cancel', callback),
    },
    external: {
        openHttps: (url: string) => ipcRenderer.invoke('external:open-https', url),
    },
    droppedFiles: {
        read: (files: File[]) => ipcRenderer.invoke('dropped-files:read', files.map((file) => webUtils.getPathForFile(file))),
    },
    storage: {
        inspect: () => ipcRenderer.invoke('storage:inspect'),
        cleanup: (category) => ipcRenderer.invoke('storage:cleanup', category),
    },
    automation: {
        ready: () => ipcRenderer.send('automation:ready'),
        onRenderRequest: (callback: (request: DesktopRenderRequest) => void) => subscribe('automation:render-request', callback),
        reportProgress: (progress: DesktopAutomationProgress) => ipcRenderer.send('automation:progress', progress),
        reportResult: (result: DesktopAutomationResult) => ipcRenderer.send('automation:result', result),
        onDeepLink: (callback: (command: DesktopDeepLinkCommand) => void) => subscribe('automation:deep-link', callback),
    },
};

contextBridge.exposeInMainWorld('mvmntDesktop', api);
