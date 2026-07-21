import type { DesktopOpenResult } from '../../electron/shared/desktop-api';
import { writeStoredImportPayload } from '@utils/importPayloadStorage';

const PENDING_DESKTOP_NAME_KEY = 'mvmnt.desktop.pending-open-name';

export function stageDesktopProjectOpen(result: DesktopOpenResult): boolean {
    if (result.canceled || result.kind !== 'project' || !result.bytes) return false;
    writeStoredImportPayload(result.bytes);
    sessionStorage.setItem(PENDING_DESKTOP_NAME_KEY, result.displayName || 'Untitled.mvt');
    return true;
}

export function readPendingDesktopProjectName(): string | null {
    return sessionStorage.getItem(PENDING_DESKTOP_NAME_KEY);
}

export function clearPendingDesktopProject(): void {
    sessionStorage.removeItem(PENDING_DESKTOP_NAME_KEY);
}
