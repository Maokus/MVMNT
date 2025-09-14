import { SERIALIZATION_V1_ENABLED } from './flags';

export interface SceneExportEnvelopePlaceholder {
    schemaVersion: number;
    format: 'mvmnt.scene';
    // Skeleton fields; real implementation will expand these.
    metadata: Record<string, unknown>;
    scene: Record<string, unknown>;
    timeline: Record<string, unknown>;
    compatibility: { warnings: any[] };
}

export interface ExportResultDisabled {
    ok: false;
    disabled: true;
    reason: 'feature-disabled';
}

export interface ExportResultPlaceholder {
    ok: true;
    disabled: false;
    envelope: SceneExportEnvelopePlaceholder;
    json: string; // Will be stable in Phase 1
}

export type ExportSceneResult = ExportResultDisabled | ExportResultPlaceholder;

/**
 * Phase 0 exportScene: returns disabled result if flag off, else placeholder envelope.
 */
export function exportScene(): ExportSceneResult {
    if (!SERIALIZATION_V1_ENABLED()) {
        return { ok: false, disabled: true, reason: 'feature-disabled' };
    }
    const envelope: SceneExportEnvelopePlaceholder = {
        schemaVersion: 1,
        format: 'mvmnt.scene',
        metadata: {},
        scene: {},
        timeline: {},
        compatibility: { warnings: [] },
    };
    return { ok: true, disabled: false, envelope, json: JSON.stringify(envelope) };
}
