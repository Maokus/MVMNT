export type DesktopMenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo';

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

export type CloseRequestResult = 'saved' | 'discarded' | 'canceled' | 'error';

export interface MvmntDesktopApi {
    documents: {
        open(): Promise<DesktopOpenResult>;
        save(request: DesktopSaveRequest): Promise<DesktopSaveResult>;
        saveAs(request: DesktopSaveRequest): Promise<DesktopSaveResult>;
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
    };
    external: {
        openHttps(url: string): Promise<boolean>;
    };
}
