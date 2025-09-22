import { serializeStable } from './stable-stringify';
import { useTimelineStore } from '../state/timelineStore';
import { DocumentGateway } from './document-gateway';

// Attempt to access a global scene builder (visualizer) if present. This avoids a hard dependency cycle.
function _getSceneBuilder(): any | null {
    try {
        // Typical location via visualizer core debug handle
        const vis: any = (window as any).vis || (window as any).visualizer;
        if (vis && typeof vis.getSceneBuilder === 'function') return vis.getSceneBuilder();
        // Fallback: some code may expose sceneBuilder directly
        if (vis && vis.sceneBuilder) return vis.sceneBuilder;
    } catch {}
    return null;
}

// --- Types (initial minimal envelope) ---
export interface SceneMetadata {
    id: string;
    name: string;
    createdAt: string; // ISO timestamp
    modifiedAt: string; // ISO timestamp
    format: 'scene'; // reserved for future multi-format support
}

// Extended V1 schema now includes actual scene element graph + macro definitions.
export interface SceneExportEnvelopeV1 {
    schemaVersion: 1;
    format: 'mvmnt.scene';
    metadata: SceneMetadata;
    scene: {
        elements: any[];
        sceneSettings?: any; // fps, dimensions, tempo, meter (no padding fields)
        macros?: any;
    };
    timeline: any; // sanitized timeline (no currentTick)
    compatibility: { warnings: any[] };
}

export interface ExportResultSuccess {
    ok: true;
    envelope: SceneExportEnvelopeV1;
    json: string; // stable stringified form
}
export type ExportSceneResult = ExportResultSuccess;
export function exportScene(sceneNameOverride?: string): ExportSceneResult {
    // Build persistent document via gateway (no ephemeral fields)
    const doc = DocumentGateway.build();
    const state = useTimelineStore.getState();

    const now = new Date().toISOString();
    // Prefer explicit override (from UI SceneContext), else timeline name, else fallback
    const resolvedName = sceneNameOverride?.trim() || state.timeline.name || 'Untitled Scene';
    const metadata: SceneMetadata = {
        id: state.timeline.id || 'scene_1',
        name: resolvedName,
        createdAt: now, // Without persisted value we set both created/modified to now (import will preserve original)
        modifiedAt: now,
        format: 'scene',
    };

    const envelope: SceneExportEnvelopeV1 = {
        schemaVersion: 1,
        format: 'mvmnt.scene',
        metadata,
        scene: { ...doc.scene },
        timeline: {
            timeline: doc.timeline,
            tracks: doc.tracks,
            tracksOrder: doc.tracksOrder,
            playbackRange: doc.playbackRange,
            playbackRangeUserDefined: doc.playbackRangeUserDefined,
            rowHeight: doc.rowHeight,
            midiCache: doc.midiCache,
        },
        compatibility: { warnings: [] },
    };

    const json = serializeStable(envelope);
    return { ok: true, envelope, json };
}
