import type { DesktopRenderRequest } from '../../electron/shared/automation';

const KEY = 'mvmnt.desktop.pending-render.v1';
const READY_KEY = 'mvmnt.desktop.pending-render.imported';

type PendingRenderSettings = Omit<DesktopRenderRequest, 'bytes'>;

export function stagePendingRender(request: DesktopRenderRequest): void {
    const { bytes: _bytes, ...settings } = request;
    sessionStorage.setItem(KEY, JSON.stringify(settings));
    sessionStorage.removeItem(READY_KEY);
}

export function markPendingRenderImported(): void {
    if (sessionStorage.getItem(KEY)) sessionStorage.setItem(READY_KEY, '1');
}

export function isPendingRenderImported(): boolean {
    return sessionStorage.getItem(READY_KEY) === '1';
}

export function hasPendingRender(): boolean {
    return Boolean(sessionStorage.getItem(KEY));
}

export function clearPendingRender(): void {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(READY_KEY);
}

export function takePendingRender(): PendingRenderSettings | null {
    try {
        const value = sessionStorage.getItem(KEY);
        if (!value) return null;
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem(READY_KEY);
        return JSON.parse(value) as PendingRenderSettings;
    } catch {
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem(READY_KEY);
        return null;
    }
}
