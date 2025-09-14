import { SERIALIZATION_V1_ENABLED } from './flags';
import { serializeStable } from './stable-stringify';
import { canonicalizeElements } from './ordering';
import { useTimelineStore } from '../state/timelineStore';

// --- Types (Phase 1 minimal envelope) ---
export interface SceneMetadata {
    id: string;
    name: string;
    createdAt: string; // ISO timestamp
    modifiedAt: string; // ISO timestamp
    format: 'scene'; // reserved for future multi-format support
}

export interface SceneExportEnvelopeV1 {
    schemaVersion: 1;
    format: 'mvmnt.scene';
    metadata: SceneMetadata;
    scene: {
        // Placeholder for future scene graph (visual elements). For Phase 1 we only persist timeline for MVP.
        elements: any[]; // empty for now unless future UI adds elements.
    };
    timeline: any; // timeline slice captured from store
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

    // Gather timeline store snapshot (shallow copy of relevant slices)
    const state = useTimelineStore.getState();
    const timeline = {
        timeline: state.timeline,
        tracks: state.tracks,
        tracksOrder: [...state.tracksOrder],
        transport: state.transport,
        selection: state.selection,
        timelineView: state.timelineView,
        playbackRange: state.playbackRange,
        playbackRangeUserDefined: state.playbackRangeUserDefined,
        rowHeight: state.rowHeight,
        // midiCache can be heavy; include for determinism now (Phase 1). Could be optionally excluded later.
        midiCache: state.midiCache,
    };

    // Scene elements placeholder: integrate future scene builder. For now, empty deterministic list.
    const elements: any[] = [];
    const ordered = canonicalizeElements(elements);

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
        scene: { elements: ordered },
        timeline,
        compatibility: { warnings: [] },
    };

    const json = serializeStable(envelope);
    return { ok: true, disabled: false, envelope, json };
}
