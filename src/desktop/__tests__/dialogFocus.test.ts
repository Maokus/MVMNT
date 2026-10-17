import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MvmntDesktopApi } from '../../../electron/shared/desktop-api';

async function installDialogFocusFix() {
    const module = await import('../dialogFocus');
    module.installDialogFocusFix();
}

function stubDesktop(fixDialogFocus: () => void): void {
    window.mvmntDesktop = { app: { fixDialogFocus } } as unknown as MvmntDesktopApi;
}

describe('installDialogFocusFix', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        delete (window as { mvmntDesktop?: unknown }).mvmntDesktop;
        vi.restoreAllMocks();
    });

    it('restores window focus after a native confirm and preserves its result', async () => {
        const fixDialogFocus = vi.fn();
        stubDesktop(fixDialogFocus);
        const nativeConfirm = vi.fn(() => true);
        window.confirm = nativeConfirm;

        await installDialogFocusFix();
        const result = window.confirm('Continue?');

        expect(nativeConfirm).toHaveBeenCalledWith('Continue?');
        expect(result).toBe(true);
        expect(fixDialogFocus).toHaveBeenCalledTimes(1);
    });

    it('restores window focus after a native alert', async () => {
        const fixDialogFocus = vi.fn();
        stubDesktop(fixDialogFocus);
        const nativeAlert = vi.fn();
        window.alert = nativeAlert;

        await installDialogFocusFix();
        window.alert('Heads up');

        expect(nativeAlert).toHaveBeenCalledWith('Heads up');
        expect(fixDialogFocus).toHaveBeenCalledTimes(1);
    });

    it('leaves the native dialogs untouched without the desktop bridge', async () => {
        delete (window as { mvmntDesktop?: unknown }).mvmntDesktop;
        const nativeConfirm = vi.fn(() => false);
        window.confirm = nativeConfirm;

        await installDialogFocusFix();

        expect(window.confirm).toBe(nativeConfirm);
    });
});
