import { contextBridge, ipcRenderer } from 'electron';
import type {
    CloseRequestResult,
    DesktopMenuCommand,
    DesktopOpenResult,
    DesktopSaveRequest,
    MvmntDesktopApi,
} from './shared/desktop-api.js';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

const api: MvmntDesktopApi = {
    documents: {
        open: () => ipcRenderer.invoke('documents:open'),
        save: (request: DesktopSaveRequest) => ipcRenderer.invoke('documents:save', request),
        saveAs: (request: DesktopSaveRequest) => ipcRenderer.invoke('documents:save-as', request),
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
    },
    external: {
        openHttps: (url: string) => ipcRenderer.invoke('external:open-https', url),
    },
};

contextBridge.exposeInMainWorld('mvmntDesktop', api);
