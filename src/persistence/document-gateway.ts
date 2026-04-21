import { useTimelineStore, sharedTimingManager } from '@state/timelineStore';
import { resolveTempoKeyframes } from '@core/timing/tempo-automation-resolver';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { serializeStable } from './stable-stringify';
import { useSceneStore } from '@state/sceneStore';
import type { SceneSerializedElement } from '@state/sceneStore';
import { getMacroSnapshot, replaceMacrosFromSnapshot } from '@state/scene/macroSyncService';
import { migrateSceneAudioSystemV5 } from './migrations/audioSystemV5';
import { useSceneMetadataStore, type SceneMetadataState } from '@state/sceneMetadataStore';

/** Fields stripped from sceneSettings when persisting (padding concepts removed). */
const STRIP_SCENE_SETTINGS_KEYS = new Set(['prePadding', 'postPadding']);

/**
 * Normalizes elements from either V5 (flat array with spread properties) or
 * V6 (Record keyed by ID + elementsOrder) into the internal V6 array format.
 */
function normalizeElements(scene: any): SceneSerializedElement[] {
    if (Array.isArray(scene?.elements)) {
        // V5 format: properties are spread on the element object
        return (scene.elements as any[])
            .filter((el: any) => el && typeof el === 'object')
            .map((el: any) => {
                const { id, type, index: _index, ...rest } = el;
                return { id, type, properties: rest } as SceneSerializedElement;
            });
    }
    if (
        scene?.elementsOrder &&
        scene?.elements &&
        typeof scene.elements === 'object' &&
        !Array.isArray(scene.elements)
    ) {
        // V6 format: Record + order array
        return (scene.elementsOrder as string[])
            .map((id: string) => scene.elements[id])
            .filter(Boolean) as SceneSerializedElement[];
    }
    return [];
}

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
    audioFeatureCaches?: Record<string, any>;
    audioFeatureCacheStatus?: Record<string, any>;
    scene: { elements: Record<string, any>; elementsOrder?: string[]; sceneSettings?: any; macros?: any; fontAssets?: any; fontLicensingAcknowledgedAt?: number; automation?: any };
    metadata?: Partial<SceneMetadataState>;
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
        let elements: Record<string, any> = {};
        let elementsOrder: string[] = [];
        let sceneSettings: any = undefined;
        let macros: any = undefined;
        let fontAssets: any = undefined;
        let fontLicensingAcknowledgedAt: number | undefined;
        let automation: any = undefined;
        let elementWarnings: string[] | undefined;

        try {
            const snapshot = useSceneStore.getState().exportSceneDraft();
            elements = snapshot.elements ?? {};
            elementsOrder = snapshot.elementsOrder ?? [];
            if (snapshot.elementErrors?.length) {
                elementWarnings = snapshot.elementErrors.map(
                    (e) => `Element "${e.id}" (${e.type}) could not be exported: ${e.message}`
                );
            }
            if (snapshot.sceneSettings) {
                sceneSettings = { ...snapshot.sceneSettings };
            }
            if (snapshot.macros) {
                macros = { ...snapshot.macros };
            }
            if (snapshot.fontAssets) {
                fontAssets = { ...snapshot.fontAssets };
            }
            if (typeof snapshot.fontLicensingAcknowledgedAt === 'number') {
                fontLicensingAcknowledgedAt = snapshot.fontLicensingAcknowledgedAt;
            }
            if (snapshot.automation) {
                automation = snapshot.automation;
            }
        } catch {}

        const hasMacros = !!macros && !!macros.macros && Object.keys(macros.macros).length > 0;
        if (!hasMacros) {
            macros = getMacroSnapshot() ?? undefined;
        }

        if (sceneSettings) {
            for (const k of Object.keys(sceneSettings)) {
                if (STRIP_SCENE_SETTINGS_KEYS.has(k)) delete sceneSettings[k];
            }
        }

        let metadata: Partial<SceneMetadataState> | undefined;
        try {
            metadata = { ...useSceneMetadataStore.getState().metadata };
        } catch {}

        const doc: PersistentDocumentV1 = {
            timeline: timelineCore,
            tracks: state.tracks,
            tracksOrder: [...state.tracksOrder],
            playbackRange: state.playbackRange,
            playbackRangeUserDefined: state.playbackRangeUserDefined,
            rowHeight: state.rowHeight,
            midiCache: state.midiCache,
            audioFeatureCaches: state.audioFeatureCaches,
            audioFeatureCacheStatus: state.audioFeatureCacheStatus,
            scene: {
                elements,
                elementsOrder,
                sceneSettings,
                macros,
                fontAssets,
                fontLicensingAcknowledgedAt,
                automation,
            },
            metadata,
        };

        if (!opts.includeEphemeral) {
            if (elementWarnings?.length) {
                return Object.assign(doc, { _warnings: elementWarnings });
            }
            return doc;
        }
        const withEphemeral = Object.assign(doc, { __ephemeral: { currentTick: timeline?.currentTick, transport, timelineView } });
        if (elementWarnings?.length) {
            return Object.assign(withEphemeral, { _warnings: elementWarnings });
        }
        return withEphemeral;
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
            audioFeatureCaches: doc.audioFeatureCaches || {},
            audioFeatureCacheStatus: doc.audioFeatureCacheStatus || {},
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

        // If tempo automation is enabled in the restored document, re-derive
        // masterTempoMap from keyframes (keyframes are the source of truth).
        try {
            const restored = useTimelineStore.getState().timeline;
            if (restored.tempoAutomation?.enabled &&
                restored.tempoAutomation.keyframes.length > 0) {
                const derivedMap = resolveTempoKeyframes(
                    restored.tempoAutomation.keyframes,
                    restored.globalBpm,
                    CANONICAL_PPQ,
                );
                useTimelineStore.getState().setMasterTempoMap(derivedMap);
            }
        } catch {
            /* non-fatal */
        }

        // Scene & macros (note: sceneSettings tempo/meter SHOULD NOT override timeline if timeline already specified).
        const rawSceneData = {
            elements: normalizeElements(doc.scene),
            sceneSettings: doc.scene?.sceneSettings,
            macros: doc.scene?.macros,
            fontAssets: doc.scene?.fontAssets,
            fontLicensingAcknowledgedAt: doc.scene?.fontLicensingAcknowledgedAt,
            automation: doc.scene?.automation,
        };

        const sceneData = migrateSceneAudioSystemV5(rawSceneData);

        try {
            useSceneStore.getState().importScene(sceneData);
        } catch {}

        try {
            replaceMacrosFromSnapshot(sceneData.macros);
        } catch {}

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

        if (doc.metadata) {
            try {
                useSceneMetadataStore.getState().hydrate(doc.metadata);
            } catch {}
        }
    },
};

export type { PersistentDocumentV1 as DocumentShapeV1 };
