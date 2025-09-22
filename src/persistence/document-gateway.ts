import { useTimelineStore, sharedTimingManager } from '../state/timelineStore';
import { globalMacroManager } from '../bindings/macro-manager';
import { serializeStable } from './stable-stringify';
import { useSceneStore } from '@state/sceneStore';
import { dispatchSceneCommand } from '@state/scene';

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
        // Strip ephemeral timeline fields: currentTick always, playheadAuthority should not generate undo snapshots.
        // Additional ephemeral timeline-only fields can be added here without affecting persisted documents.
        const { currentTick: _dropTick, playheadAuthority: _dropAuth, ...timelineCore } = timeline || {};

        // Scene + macros (best effort)
        let elements: any[] = [];
        let sceneSettings: any = undefined;
        let macros: any = undefined;

        try {
            const snapshot = useSceneStore.getState().exportSceneDraft();
            if (Array.isArray(snapshot.elements)) {
                elements = snapshot.elements.map((el: any) => ({ ...el }));
            }
            if (snapshot.sceneSettings) {
                sceneSettings = { ...snapshot.sceneSettings };
            }
            if (snapshot.macros) {
                macros = { ...snapshot.macros };
            }
        } catch {}

        if (!elements.length) {
            const sb = _getSceneBuilder();
            if (sb && typeof sb.serializeScene === 'function') {
                try {
                    const serialized = sb.serializeScene();
                    if (serialized?.elements) elements = serialized.elements.map((e: any) => ({ ...e }));
                    if (serialized?.sceneSettings) {
                        sceneSettings = { ...serialized.sceneSettings };
                    }
                    if (serialized?.macros) {
                        macros = { ...serialized.macros };
                    }
                } catch {}
            }
            if (!macros) {
                try {
                    macros = globalMacroManager.exportMacros();
                } catch {}
            }
        }

        if (sceneSettings) {
            for (const k of Object.keys(sceneSettings)) {
                if (STRIP_SCENE_SETTINGS_KEYS.has(k)) delete sceneSettings[k];
            }
        }

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

        // After timeline slice merge, propagate restored tempo state to shared timing manager.
        try {
            const tl = useTimelineStore.getState().timeline;
            // Order matters: set BPM first (clears tempo map), then map, then beatsPerBar.
            if (typeof tl.globalBpm === 'number' && tl.globalBpm > 0) {
                sharedTimingManager.setBPM(tl.globalBpm);
            }
            if (Array.isArray(tl.masterTempoMap) && tl.masterTempoMap.length > 0) {
                sharedTimingManager.setTempoMap(tl.masterTempoMap, 'seconds');
            } else {
                // Ensure we clear tempo map if snapshot had none.
                sharedTimingManager.setTempoMap(null);
            }
            if (typeof tl.beatsPerBar === 'number' && tl.beatsPerBar > 0) {
                sharedTimingManager.setBeatsPerBar(tl.beatsPerBar);
            }
        } catch {
            /* non-fatal */
        }

        // Scene & macros (note: sceneSettings tempo/meter SHOULD NOT override timeline if timeline already specified).
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
                if (sceneData.sceneSettings) {
                    try {
                        const { tempo, beatsPerBar } = sceneData.sceneSettings as any;
                        const api = useTimelineStore.getState();
                        const tl = api.timeline;
                        const haveTimelineBpm = typeof tl.globalBpm === 'number' && tl.globalBpm !== 120;
                        const haveTimelineMeter = typeof tl.beatsPerBar === 'number' && tl.beatsPerBar !== 4;
                        if (typeof tempo === 'number' && !haveTimelineBpm) api.setGlobalBpm(Math.max(1, tempo));
                        if (typeof beatsPerBar === 'number' && !haveTimelineMeter)
                            api.setBeatsPerBar(Math.max(1, Math.floor(beatsPerBar)));
                    } catch {
                        /* ignore */
                    }
                }
                dispatchSceneCommand(sb, { type: 'loadSerializedScene', payload: sceneData }, { source: 'DocumentGateway.apply' });
            } else {
                useSceneStore.getState().importScene({
                    elements: Array.isArray(doc.scene?.elements) ? doc.scene.elements : [],
                    sceneSettings: doc.scene?.sceneSettings,
                    macros: doc.scene?.macros,
                });
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
