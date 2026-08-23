import type {
    DesktopAutomationProgress,
    DesktopAutomationResult,
    DesktopDeepLinkCommand,
    DesktopRenderRequest,
} from './automation.js';
import type { BuildInfo, UpdateCheckResult } from './build-info.js';

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

export interface DesktopSaveAsSelectionRequest {
    suggestedName: string;
}

export interface DesktopSaveAsSelectionResult {
    status: 'selected' | 'canceled' | 'error';
    selectionId?: string;
    displayName?: string;
    error?: string;
}

export interface DesktopDocumentSaveBeginRequest {
    expectedBytes: number;
    selectionId?: string;
}

export interface DesktopDocumentSaveBeginResult {
    status: 'ready' | 'canceled' | 'error';
    sessionId?: string;
    displayName?: string;
    error?: string;
}

export interface DesktopDocumentSaveWriteRequest {
    sessionId: string;
    bytes: Uint8Array;
    position: number;
}

/** Renderer-safe document identity. Filesystem paths remain in the main process. */
export interface DesktopDocumentState {
    status: 'untitled' | 'saved';
    displayName?: string;
}

/** A safe recent-project summary. Native paths never leave the main process. */
export interface DesktopRecentDocument {
    displayName: string;
    openedAt: number;
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
    /** Absolute path returned by the native destination picker. */
    outputPath?: string;
}

export interface DesktopExportDestinationRequest {
    kind: DesktopExportKind;
    suggestedName: string;
    extension?: '.mp4' | '.webm';
}

export interface DesktopExportDestinationResult {
    status: 'selected' | 'canceled' | 'error';
    outputPath?: string;
    displayName?: string;
    error?: string;
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

/** Immutable renderer payload used by the desktop-only background export host. */
export interface DesktopBackgroundExportRequest {
    jobId: string;
    kind: 'video' | 'png';
    sceneName: string;
    settings: Record<string, unknown>;
    bytes: Uint8Array;
}

export interface DesktopBackgroundExportUpdate {
    jobId: string;
    patch: Record<string, unknown>;
}

export type CloseRequestResult = 'saved' | 'discarded' | 'canceled' | 'error';

export interface MvmntDesktopApi {
    documents: {
        open(): Promise<DesktopOpenResult>;
        listRecent(): Promise<DesktopRecentDocument[]>;
        openRecent(index: number): Promise<DesktopOpenResult>;
        chooseSaveAs(request: DesktopSaveAsSelectionRequest): Promise<DesktopSaveAsSelectionResult>;
        beginSave(request: DesktopDocumentSaveBeginRequest): Promise<DesktopDocumentSaveBeginResult>;
        writeSaveChunk(request: DesktopDocumentSaveWriteRequest): Promise<void>;
        completeSave(sessionId: string): Promise<DesktopSaveResult>;
        abortSave(sessionId: string): Promise<void>;
        getState(): Promise<DesktopDocumentState>;
        /** Read the current native project without exposing its path. */
        restoreActive(): Promise<DesktopOpenResult>;
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
        getBuildInfo(): Promise<BuildInfo>;
        checkForUpdates(): Promise<UpdateCheckResult>;
        notify(title: string, body: string): void;
    };
    exports: {
        chooseDestination(request: DesktopExportDestinationRequest): Promise<DesktopExportDestinationResult>;
        begin(request: DesktopExportBeginRequest): Promise<DesktopExportBeginResult>;
        write(request: DesktopExportWriteRequest): Promise<void>;
        writeFrame(request: DesktopExportWriteRequest): Promise<void>;
        writeArtifact(request: DesktopExportWriteRequest): Promise<void>;
        complete(request: DesktopExportCompleteRequest): Promise<DesktopExportCompleteResult>;
        abort(sessionId: string): Promise<void>;
        reveal(outputId: string): Promise<boolean>;
    };
    background: {
        start(request: DesktopBackgroundExportRequest): Promise<{ accepted: boolean; error?: string }>;
        /** Claims the request assigned to this hidden renderer, if any. */
        take(): Promise<DesktopBackgroundExportRequest | null>;
        cancel(jobId: string): Promise<boolean>;
        update(update: DesktopBackgroundExportUpdate): void;
        complete(update: DesktopBackgroundExportUpdate): void;
        onUpdate(callback: (update: DesktopBackgroundExportUpdate) => void): () => void;
        onCancel(callback: (jobId: string) => void): () => void;
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
