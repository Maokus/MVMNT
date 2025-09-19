import { SERIALIZATION_V1_ENABLED } from './flags';
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

// --- Types (Phase 1 minimal envelope) ---
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

export interface ExportResultDisabled {
    ok: false;
    disabled: true;
    reason: 'feature-disabled';
}

export interface ExportResultSuccess {
    ok: true;
    disabled: false;
    envelope: SceneExportEnvelopeV1;
    json: string; // stable stringified form
}

export type ExportSceneResult = ExportResultDisabled | ExportResultSuccess;

/**
 * Phase 0 exportScene: returns disabled result if flag off, else placeholder envelope.
 */
export function exportScene(): ExportSceneResult {
    if (!SERIALIZATION_V1_ENABLED()) {
        return { ok: false, disabled: true, reason: 'feature-disabled' };
    }

    // Build persistent document via gateway (no ephemeral fields)
    const doc = DocumentGateway.build();
    const state = useTimelineStore.getState();

    const now = new Date().toISOString();
    // Derive metadata (use timeline id/name for now as scene identity)
    const metadata: SceneMetadata = {
        id: state.timeline.id || 'scene_1',
        name: state.timeline.name || 'Untitled Scene',
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
            selection: doc.selection,
            playbackRange: doc.playbackRange,
            playbackRangeUserDefined: doc.playbackRangeUserDefined,
            rowHeight: doc.rowHeight,
            midiCache: doc.midiCache,
        },
        compatibility: { warnings: [] },
    };

    const json = serializeStable(envelope);
    return { ok: true, disabled: false, envelope, json };
}
