/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_VERSION: string;
    readonly VITE_BINDING_VERSION: string;
    readonly VITE_VERBOSE_LOGS?: string;
    readonly REACT_APP_VERSION?: string;
    readonly REACT_APP_BINDING_VERSION?: string;
    readonly REACT_APP_VERBOSE_LOGS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare const __INCLUDE_EXAMPLES__: boolean;
