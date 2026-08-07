import type { ExportJobKind } from '@export/export-job-store';
import type { ExportSettings } from './types';

export const BACKGROUND_EXPORT_KEY = 'mvmnt.desktop.background-export.v1';

export interface BackgroundExportBootstrap {
    jobId: string;
    kind: ExportJobKind;
    sceneName: string;
    settings: Partial<ExportSettings>;
}

export function readBackgroundExportBootstrap(
    storage: Storage | undefined = globalThis.sessionStorage
): BackgroundExportBootstrap | null {
    try {
        const raw = storage?.getItem(BACKGROUND_EXPORT_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<BackgroundExportBootstrap>;
        if (
            typeof value.jobId !== 'string' ||
            (value.kind !== 'video' && value.kind !== 'png') ||
            typeof value.sceneName !== 'string' ||
            !value.settings ||
            typeof value.settings !== 'object'
        )
            return null;
        return value as BackgroundExportBootstrap;
    } catch {
        return null;
    }
}
