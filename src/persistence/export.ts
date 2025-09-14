import { SERIALIZATION_V1_ENABLED } from './flags';
import { serializeStable } from './stable-stringify';
import { canonicalizeElements } from './ordering';
import { useTimelineStore } from '../state/timelineStore';
import { globalMacroManager } from '../bindings/macro-manager';
import { instrumentSceneBuilderForUndo } from './undo/snapshot-undo';

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
        elements: any[]; // serialized element configs (sceneBuilder.serializeScene().elements)
        sceneSettings?: any; // fps, dimensions, padding, tempo, meter
        macros?: any; // macro definitions (globalMacroManager.exportMacros())
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

    // Gather scene + macros (best effort; absent if no scene builder yet)
    let elements: any[] = [];
    let sceneSettings: any = undefined;
    const sb = _getSceneBuilder();
    if (sb && typeof sb.serializeScene === 'function') {
        try {
            instrumentSceneBuilderForUndo(sb);
            const serialized = sb.serializeScene();
            if (serialized && Array.isArray(serialized.elements)) {
                elements = serialized.elements.map((e: any) => ({ ...e }));
            }
            if (serialized && serialized.sceneSettings) sceneSettings = { ...serialized.sceneSettings };
        } catch (e) {
            console.warn('[exportScene] Failed to serialize scene elements', e);
        }
    }
    const ordered = canonicalizeElements(elements || []);

    let macros: any = undefined;
    try {
        macros = globalMacroManager.exportMacros();
    } catch {}

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
        scene: { elements: ordered, sceneSettings, macros },
        timeline,
        compatibility: { warnings: [] },
    };

    const json = serializeStable(envelope);
    return { ok: true, disabled: false, envelope, json };
}
