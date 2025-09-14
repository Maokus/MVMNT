import { SERIALIZATION_V1_ENABLED } from './flags';
import { validateSceneEnvelope } from './validate';
import { useTimelineStore } from '../state/timelineStore';

export interface ImportError {
    code?: string; // Provided in Phase 2 validation (fatal codes)
    message: string;
    path?: string;
}

export interface ImportResultDisabled {
    ok: false;
    disabled: true;
    reason: 'feature-disabled';
    errors: ImportError[];
}

export interface ImportResultSuccess {
    ok: true;
    disabled: false;
    errors: [];
    warnings: { message: string }[];
}

export interface ImportResultFailureEnabled {
    ok: false;
    disabled: false;
    errors: ImportError[];
    warnings: { message: string }[];
}

export type ImportSceneResult = ImportResultDisabled | ImportResultSuccess | ImportResultFailureEnabled;

/**
 * Phase 0 importer: validates nothing, does not mutate store (no dependency yet).
 */
export function importScene(json: string): ImportSceneResult {
    if (!SERIALIZATION_V1_ENABLED()) {
        return {
            ok: false,
            disabled: true,
            reason: 'feature-disabled',
            errors: [{ message: 'Serialization feature disabled' }],
        };
    }
    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch (e: any) {
        return {
            ok: false,
            disabled: false,
            errors: [{ code: 'ERR_JSON_PARSE', message: 'Invalid JSON: ' + e.message }],
            warnings: [],
        };
    }
    const validation = validateSceneEnvelope(parsed);
    if (!validation.ok) {
        return {
            ok: false,
            disabled: false,
            errors: validation.errors.map((e) => ({ code: e.code, message: e.message, path: e.path })),
            warnings: validation.warnings.map((w) => ({ message: w.message })),
        };
    }
    // Hydrate store (replace-mode for timeline related slices). Scene elements placeholder not yet integrated.
    const tl = parsed.timeline;
    const set = useTimelineStore.setState;
    set((prev: any) => ({
        timeline: tl.timeline,
        tracks: tl.tracks,
        tracksOrder: tl.tracksOrder,
        transport: tl.transport || prev.transport,
        selection: tl.selection || { selectedTrackIds: [] },
        timelineView: tl.timelineView || prev.timelineView,
        playbackRange: tl.playbackRange,
        playbackRangeUserDefined: !!tl.playbackRangeUserDefined,
        rowHeight: typeof tl.rowHeight === 'number' ? tl.rowHeight : prev.rowHeight,
        midiCache: tl.midiCache || {},
    }));
    return { ok: true, disabled: false, errors: [], warnings: validation.warnings };
}
