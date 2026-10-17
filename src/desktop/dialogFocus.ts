let installed = false;

export function installDialogFocusFix(): void {
    if (installed) return;

    const desktop = typeof window !== 'undefined' ? window.mvmntDesktop : undefined;
    if (!desktop?.app?.fixDialogFocus) return;

    installed = true;
    const restoreFocus = () => desktop.app.fixDialogFocus();

    const nativeConfirm = window.confirm;
    window.confirm = (message?: string): boolean => {
        const result = nativeConfirm.call(window, message);
        restoreFocus();
        return result;
    };

    const nativeAlert = window.alert;
    window.alert = (message?: string): void => {
        nativeAlert.call(window, message);
        restoreFocus();
    };
}
