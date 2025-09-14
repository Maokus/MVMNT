import { SERIALIZATION_V1_ENABLED } from './flags';
import { validateSceneEnvelope } from './validate';
import { useTimelineStore } from '../state/timelineStore';
import { globalMacroManager } from '../bindings/macro-manager';
import { instrumentSceneBuilderForUndo } from './undo/snapshot-undo';

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
    // Hydrate store (replace-mode for timeline related slices) + scene elements/macros.
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

    // Scene + macros best effort hydration
    try {
        const scene = parsed.scene || {};
        if (scene.macros) {
            try {
                globalMacroManager.importMacros(scene.macros);
            } catch (e) {
                console.error('[importScene] Macro import failed', e);
            }
        }
        const sb = _getSceneBuilder();
        if (sb) {
            try {
                instrumentSceneBuilderForUndo(sb);
            } catch {}
            // Build a legacy sceneData object compatible with HybridSceneBuilder.loadScene
            const sceneData = {
                elements: Array.isArray(scene.elements) ? scene.elements : [],
                sceneSettings: scene.sceneSettings,
                macros: scene.macros, // loadScene will re-import macros; that's okay (idempotent) or ignore if absent
            };
            if (typeof sb.loadScene === 'function') {
                const ok = sb.loadScene(sceneData);
                if (!ok) console.error('[importScene] Scene builder load failed');
                try {
                    const canvas: any = sb?.canvas || (window as any).vis?.canvas;
                    canvas?.dispatchEvent?.(
                        new CustomEvent('scene-imported', { detail: { exportSettings: scene.sceneSettings || {} } })
                    );
                } catch {}
            } else if (Array.isArray(scene.elements) && typeof sb.setElements === 'function') {
                // Fallback minimal restoration: assume elements are simple configs requiring registry creation
                for (const el of scene.elements) {
                    try {
                        sb.addElementFromRegistry?.(el.type, el);
                    } catch (e) {
                        console.error('[importScene] addElement fallback failed', e);
                    }
                }
            }
        }
    } catch (e) {
        console.error('[importScene] Scene element restoration failed', e);
    }
    return { ok: true, disabled: false, errors: [], warnings: validation.warnings };
}
