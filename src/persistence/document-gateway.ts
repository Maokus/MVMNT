import { useTimelineStore } from '../state/timelineStore';
import { globalMacroManager } from '../bindings/macro-manager';
import { serializeStable } from './stable-stringify';

// Lightweight runtime discovery of scene builder without creating an import cycle.
function _getSceneBuilder(): any | null {
    try {
        const vis: any = (window as any).vis || (window as any).visualizer;
        if (vis && typeof vis.getSceneBuilder === 'function') return vis.getSceneBuilder();
        if (vis && vis.sceneBuilder) return vis.sceneBuilder;
    } catch {}
    return null;
}

/** Fields stripped from sceneSettings when persisting (padding concepts removed). */
const STRIP_SCENE_SETTINGS_KEYS = new Set(['prePadding', 'postPadding']);

/**
 * Persistent document shape (public) – intentionally omits volatile playback & view state.
 * - Excludes: timeline.timeline.currentTick, transport, timelineView.
 * - Includes: timeline meta (id, name, tempo map, bpm, meter) & tracks/midiCache etc.
 */
export interface PersistentDocumentV1 {
    timeline: any; // sanitized timeline slice without currentTick (playhead)
    tracks: any;
    tracksOrder: string[];
    playbackRange?: any;
    playbackRangeUserDefined: boolean;
    rowHeight: number;
    midiCache: any;
    scene: { elements: any[]; sceneSettings?: any; macros?: any };
}

export interface BuildOptions {
    /**
     * Include ephemeral runtime-only fields (currentTick, transport, timelineView) – used by undo snapshots.
     */
    includeEphemeral?: boolean;
}

export const DocumentGateway = {
    /** Build a PersistentDocumentV1 (optionally with ephemeral fields for undo). */
    build(opts: BuildOptions = {}): PersistentDocumentV1 & { __ephemeral?: any } {
        const state = useTimelineStore.getState();
        // Copy timeline but drop currentTick always in persistent form.
        const { timeline, transport, timelineView, ...rest } = state as any;
        const { currentTick: _dropTick, ...timelineCore } = timeline || {};

        // Scene + macros (best effort)
        let elements: any[] = [];
        let sceneSettings: any = undefined;
        const sb = _getSceneBuilder();
        if (sb && typeof sb.serializeScene === 'function') {
            try {
                const serialized = sb.serializeScene();
                if (serialized?.elements) elements = serialized.elements.map((e: any) => ({ ...e }));
                if (serialized?.sceneSettings) {
                    sceneSettings = { ...serialized.sceneSettings };
                    // Remove padding keys
                    for (const k of Object.keys(sceneSettings)) {
                        if (STRIP_SCENE_SETTINGS_KEYS.has(k)) delete sceneSettings[k];
                    }
                }
            } catch {}
        }
        let macros: any = undefined;
        try {
            macros = globalMacroManager.exportMacros();
        } catch {}

        const doc: PersistentDocumentV1 = {
            timeline: timelineCore,
            tracks: state.tracks,
            tracksOrder: [...state.tracksOrder],
            playbackRange: state.playbackRange,
            playbackRangeUserDefined: state.playbackRangeUserDefined,
            rowHeight: state.rowHeight,
            midiCache: state.midiCache,
            scene: { elements, sceneSettings, macros },
        };

        if (!opts.includeEphemeral) return doc;
        return Object.assign(doc, { __ephemeral: { currentTick: timeline?.currentTick, transport, timelineView } });
    },

    /** Serialize (stable) */
    serialize(doc: PersistentDocumentV1): string {
        return serializeStable(doc);
    },

    /** Apply a document to the running app state. Ephemeral fields ignored unless present explicitly. */
    apply(doc: PersistentDocumentV1 & { __ephemeral?: any }) {
        const set = useTimelineStore.setState;
        const timelineCore = doc.timeline || {};
        set((prev: any) => ({
            ...prev,
            timeline: {
                ...prev.timeline,
                ...timelineCore,
                currentTick: prev.timeline.currentTick, // preserve existing playhead
            },
            tracks: doc.tracks || {},
            tracksOrder: doc.tracksOrder || [],
            playbackRange: doc.playbackRange,
            playbackRangeUserDefined: !!doc.playbackRangeUserDefined,
            rowHeight: typeof doc.rowHeight === 'number' ? doc.rowHeight : prev.rowHeight,
            midiCache: doc.midiCache || {},
        }));

        // Scene & macros
        try {
            if (doc.scene?.macros) {
                try {
                    globalMacroManager.importMacros(doc.scene.macros);
                } catch {}
            }
            const sb = _getSceneBuilder();
            if (sb) {
                const sceneData = {
                    elements: Array.isArray(doc.scene?.elements) ? doc.scene.elements : [],
                    sceneSettings: doc.scene?.sceneSettings,
                    macros: doc.scene?.macros,
                };
                if (typeof sb.loadScene === 'function') {
                    sb.loadScene(sceneData);
                } else if (sceneData.elements) {
                    try {
                        sb.clearElements?.();
                    } catch {}
                    for (const el of sceneData.elements) {
                        try {
                            sb.addElementFromRegistry?.(el.type, el);
                        } catch {}
                    }
                }
            }
        } catch {}

        // Ephemeral replay (undo only): restore currentTick & optionally transport/view.
        if (doc.__ephemeral) {
            try {
                const { currentTick, transport, timelineView } = doc.__ephemeral;
                useTimelineStore.setState((prev: any) => ({
                    ...prev,
                    timeline: {
                        ...prev.timeline,
                        currentTick: typeof currentTick === 'number' ? currentTick : prev.timeline.currentTick,
                    },
                    transport: transport ? { ...prev.transport, ...transport } : prev.transport,
                    timelineView: timelineView ? { ...timelineView } : prev.timelineView,
                }));
            } catch {}
        }
    },
};

export type { PersistentDocumentV1 as DocumentShapeV1 };
