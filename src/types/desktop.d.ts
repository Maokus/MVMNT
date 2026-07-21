import type { MvmntDesktopApi } from '../../electron/shared/desktop-api';

declare global {
    interface Window {
        mvmntDesktop?: MvmntDesktopApi;
    }
}

export {};
