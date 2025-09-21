import { validateSceneEnvelope } from './validate';
import { DocumentGateway } from './document-gateway';

function _getSceneBuilder(): any | null {
    try {
        const vis: any = (window as any).vis || (window as any).visualizer;
        if (vis && typeof vis.getSceneBuilder === 'function') return vis.getSceneBuilder();
        if (vis && vis.sceneBuilder) return vis.sceneBuilder;
    } catch {}
    return null;
}

export interface ImportError {
    code?: string; // Provided in Phase 2 validation (fatal codes)
    message: string;
    path?: string;
}

export interface ImportResultSuccess {
    ok: true;
    errors: [];
    warnings: { message: string }[];
}

export interface ImportResultFailureEnabled {
    ok: false;
    errors: ImportError[];
    warnings: { message: string }[];
}
export type ImportSceneResult = ImportResultSuccess | ImportResultFailureEnabled;

export function importScene(json: string): ImportSceneResult {
    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch (e: any) {
        return {
            ok: false,
            errors: [{ code: 'ERR_JSON_PARSE', message: 'Invalid JSON: ' + e.message }],
            warnings: [],
        };
    }
    const validation = validateSceneEnvelope(parsed);
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors.map((e) => ({ code: e.code, message: e.message, path: e.path })),
            warnings: validation.warnings.map((w) => ({ message: w.message })),
        };
    }
    // Build gateway-shaped document from envelope (dropping now-unsupported fields)
    const tl = parsed.timeline || {};
    const doc = {
        timeline: tl.timeline,
        tracks: tl.tracks,
        tracksOrder: tl.tracksOrder || [],
        playbackRange: tl.playbackRange,
        playbackRangeUserDefined: !!tl.playbackRangeUserDefined,
        rowHeight: tl.rowHeight,
        midiCache: tl.midiCache || {},
        scene: { ...parsed.scene },
    };
    // NOTE: legacy exports may contain a `selection` field; this is now intentionally ignored
    // as selection is ephemeral UI state and should not be persisted.
    // Apply via gateway (ignores currentTick/transport/view & strips padding keys internally)
    DocumentGateway.apply(doc as any);
    return { ok: true, errors: [], warnings: validation.warnings };
}
