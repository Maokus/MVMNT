/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BINDING_VERSION: string;
    readonly VITE_VERBOSE_LOGS?: string;
    readonly REACT_APP_VERSION?: string;
    readonly REACT_APP_BINDING_VERSION?: string;
    readonly REACT_APP_VERBOSE_LOGS?: string;
}

declare const __MVMNT_VERSION__: string;
declare const __MVMNT_BUILD_CHANNEL__: 'development' | 'nightly' | 'stable';
declare const __MVMNT_BUILD_SHA__: string;
declare const __MVMNT_BUILD_DATE__: string;

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
