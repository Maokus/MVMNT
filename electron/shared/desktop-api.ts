import type { DesktopAutomationProgress, DesktopAutomationResult, DesktopDeepLinkCommand, DesktopRenderRequest } from './automation.js';

export type DesktopMenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo' | 'recovery' | 'storage';

export type DesktopOpenKind = 'project' | 'plugin';

export interface DesktopOpenResult {
    canceled: boolean;
    kind?: DesktopOpenKind;
    displayName?: string;
    bytes?: Uint8Array;
}

export interface DesktopSaveResult {
    status: 'saved' | 'canceled' | 'error';
    displayName?: string;
    error?: string;
}

export interface DesktopSaveRequest {
    bytes: Uint8Array;
    suggestedName: string;
}

/** Renderer-safe document identity. Filesystem paths remain in the main process. */
export interface DesktopDocumentState {
    status: 'untitled' | 'saved';
    displayName?: string;
}

export interface DesktopRenameRequest {
    /** A validated .mvt filename, never a path. */
    filename: string;
}

export interface DesktopRenameResult {
    status: 'renamed' | 'canceled' | 'error';
    displayName?: string;
    error?: string;
}

export interface DesktopDroppedFile {
    name: string;
    category: 'project' | 'plugin' | 'midi' | 'audio' | 'image' | 'font' | 'template';
    bytes: Uint8Array;
}

export interface DesktopStorageReport {
    location: string;
    temporaryExports: { count: number; bytes: number };
    updateCache: { count: number; bytes: number; available: boolean };
}

export type DesktopExportKind = 'video' | 'image-sequence' | 'audio';

export interface DesktopExportBeginRequest {
    kind: DesktopExportKind;
    suggestedName: string;
    extension?: '.mp4' | '.webm' | '.wav';
    estimatedBytes?: number;
    outputDirectory?: string;
}

export interface DesktopExportBeginResult {
    status: 'ready' | 'canceled' | 'error';
    sessionId?: string;
    displayName?: string;
    error?: string;
}

export interface DesktopExportWriteRequest {
    sessionId: string;
    bytes: Uint8Array;
    position?: number;
    filename?: string;
}

export interface DesktopExportCompleteRequest {
    sessionId: string;
    manifest?: Record<string, unknown>;
    expectedFrames?: number;
}

export interface DesktopExportCompleteResult {
    status: 'completed' | 'error';
    outputId?: string;
    displayName?: string;
    bytesWritten?: number;
    error?: string;
}

export type CloseRequestResult = 'saved' | 'discarded' | 'canceled' | 'error';

export interface MvmntDesktopApi {
    documents: {
        open(): Promise<DesktopOpenResult>;
        save(request: DesktopSaveRequest): Promise<DesktopSaveResult>;
        saveAs(request: DesktopSaveRequest): Promise<DesktopSaveResult>;
        getState(): Promise<DesktopDocumentState>;
        rename(request: DesktopRenameRequest): Promise<DesktopRenameResult>;
        acceptOpen(): Promise<void>;
        clearActivePath(): Promise<void>;
        setDirty(isDirty: boolean): void;
        onOpenPathRequest(callback: (result: DesktopOpenResult) => void): () => void;
    };
    menu: {
        onCommand(callback: (command: DesktopMenuCommand) => void): () => void;
    };
    lifecycle: {
        onCloseRequest(callback: () => void): () => void;
        completeCloseRequest(result: CloseRequestResult): void;
    };
    app: {
        getVersion(): Promise<string>;
        notify(title: string, body: string): void;
    };
    exports: {
        begin(request: DesktopExportBeginRequest): Promise<DesktopExportBeginResult>;
        write(request: DesktopExportWriteRequest): Promise<void>;
        writeFrame(request: DesktopExportWriteRequest): Promise<void>;
        writeArtifact(request: DesktopExportWriteRequest): Promise<void>;
        complete(request: DesktopExportCompleteRequest): Promise<DesktopExportCompleteResult>;
        abort(sessionId: string): Promise<void>;
        reveal(outputId: string): Promise<boolean>;
    };
    external: {
        openHttps(url: string): Promise<boolean>;
    };
    droppedFiles: {
        read(files: File[]): Promise<DesktopDroppedFile[]>;
    };
    storage: {
        inspect(): Promise<DesktopStorageReport>;
        cleanup(category: 'temporary-exports' | 'update-cache'): Promise<DesktopStorageReport>;
    };
    automation: {
        ready(): void;
        onRenderRequest(callback: (request: DesktopRenderRequest) => void): () => void;
        reportProgress(progress: DesktopAutomationProgress): void;
        reportResult(result: DesktopAutomationResult): void;
        onDeepLink(callback: (command: DesktopDeepLinkCommand) => void): () => void;
    };
}
