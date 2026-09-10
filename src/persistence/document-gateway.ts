import { useTimelineStore, sharedTimingManager, type TimelineState } from '@state/timelineStore';
import { resolveTempoKeyframes } from '@core/timing/tempo-automation-resolver';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { serializeStable } from './stable-stringify';
import { createSceneSnapshot, useSceneStore, type SceneSnapshot } from '@state/sceneStore';
import type { SceneSerializedElement } from '@state/sceneStore';
import { getMacroSnapshot, replaceMacrosFromSnapshot } from '@state/scene/macroSyncService';
import { migrateSceneAudioSystemV5 } from './migrations/audioSystemV5';
import { useSceneMetadataStore, type SceneMetadataState } from '@state/sceneMetadataStore';
import { hydrateRuntimeMidiPlacementFields } from './migrations/midiClipsV8';
import { createFlatSceneGraph, deriveElementOrder, type SceneGraphState } from '@state/scene-graph';
import {
    beginAnalysisIntentRestore,
    getAnalysisIntentSnapshot,
    mergePersistedAnalysisIntents,
    type PersistedAnalysisIntent,
} from '@audio/features/analysisIntents';

/** Fields stripped from sceneSettings when persisting (padding concepts removed). */
const STRIP_SCENE_SETTINGS_KEYS = new Set(['prePadding', 'postPadding', 'tempo', 'beatsPerBar']);

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
    if (scene?.graph && scene?.elements && typeof scene.elements === 'object' && !Array.isArray(scene.elements)) {
        return deriveElementOrder(scene.graph as SceneGraphState)
            .map((id) => scene.elements[id])
            .filter(Boolean) as SceneSerializedElement[];
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
type PersistentTimeline = Omit<TimelineState['timeline'], 'currentTick' | 'playheadAuthority' | 'tempoAutomation'> & {
    tempoAutomation?: Omit<NonNullable<TimelineState['timeline']['tempoAutomation']>, 'laneVisible'>;
};

export interface DocumentEphemeralState {
    currentTick?: number;
    transport?: TimelineState['transport'];
    timelineView?: TimelineState['timelineView'];
}

export interface PersistentDocumentV1 {
    timeline: PersistentTimeline;
    tracks: TimelineState['tracks'];
    tracksOrder: string[];
    playbackRange?: TimelineState['playbackRange'];
    playbackRangeUserDefined: boolean;
    /** Legacy document UI preference; read for compatibility but no longer written. */
    rowHeight?: number;
    midiCache: TimelineState['midiCache'];
    audioFeatureCaches?: TimelineState['audioFeatureCaches'];
    audioFeatureCacheStatus?: TimelineState['audioFeatureCacheStatus'];
    audioFeatureDemands?: PersistedAnalysisIntent[];
    scene: {
        elements: SceneSnapshot['elements'];
        graph: SceneGraphState;
        sceneSettings?: SceneSnapshot['sceneSettings'];
        macros?: SceneSnapshot['macros'];
        fontAssets?: SceneSnapshot['fontAssets'];
        fontLicensingAcknowledgedAt?: number;
        automation?: SceneSnapshot['automation'];
        nodeBindings?: SceneSnapshot['nodeBindings'];
    };
    metadata?: Partial<SceneMetadataState>;
}

export interface BuildOptions {
    /**
     * Include ephemeral runtime-only fields (currentTick, transport, timelineView) – used by undo snapshots.
     */
    includeEphemeral?: boolean;
}

export class DocumentApplyError extends Error {
    constructor(
        message: string,
        readonly applyError: unknown,
        readonly rollbackErrors: readonly unknown[] = []
    ) {
        super(message);
        this.name = 'DocumentApplyError';
    }
}

export const DocumentGateway = {
    /** Build a PersistentDocumentV1 (optionally with ephemeral fields for undo). */
    build(opts: BuildOptions = {}): PersistentDocumentV1 & { __ephemeral?: DocumentEphemeralState } {
        const state = useTimelineStore.getState();
        // Copy timeline but drop currentTick always in persistent form.
        const { timeline, transport, timelineView } = state;
        // Strip ephemeral timeline fields: currentTick always, playheadAuthority should not generate undo snapshots.
        // Additional ephemeral timeline-only fields can be added here without affecting persisted documents.
        const { currentTick: _dropTick, playheadAuthority: _dropAuth, ...timelineCore } = timeline || {};
        const persistedTimeline = timelineCore.tempoAutomation
            ? {
                  ...timelineCore,
                  tempoAutomation: {
                      enabled: timelineCore.tempoAutomation.enabled,
                      keyframes: timelineCore.tempoAutomation.keyframes,
                  },
              }
            : timelineCore;

        // Scene + macros
        let elements: SceneSnapshot['elements'] = {};
        let graph: SceneGraphState = createFlatSceneGraph([]);
        let sceneSettings: SceneSnapshot['sceneSettings'] | undefined;
        let macros: SceneSnapshot['macros'];
        let fontAssets: SceneSnapshot['fontAssets'];
        let fontLicensingAcknowledgedAt: number | undefined;
        let automation: SceneSnapshot['automation'];
        let nodeBindings: SceneSnapshot['nodeBindings'];
        let elementWarnings: string[] | undefined;

        const snapshot = createSceneSnapshot(useSceneStore.getState());
        elements = snapshot.elements ?? {};
        graph = snapshot.graph;
        if (snapshot.elementErrors?.length) {
            elementWarnings = snapshot.elementErrors.map(
                (e) => `Element "${e.id}" (${e.type}) could not be exported: ${e.message}`
            );
        }
        if (snapshot.sceneSettings) sceneSettings = { ...snapshot.sceneSettings };
        if (snapshot.macros) macros = { ...snapshot.macros };
        if (snapshot.fontAssets) fontAssets = { ...snapshot.fontAssets };
        if (typeof snapshot.fontLicensingAcknowledgedAt === 'number') {
            fontLicensingAcknowledgedAt = snapshot.fontLicensingAcknowledgedAt;
        }
        if (snapshot.automation) automation = snapshot.automation;
        if (snapshot.nodeBindings) nodeBindings = snapshot.nodeBindings;

        const hasMacros = !!macros && !!macros.macros && Object.keys(macros.macros).length > 0;
        if (!hasMacros) {
            macros = getMacroSnapshot() ?? undefined;
        }

        if (sceneSettings) {
            for (const k of Object.keys(sceneSettings)) {
                if (STRIP_SCENE_SETTINGS_KEYS.has(k)) delete sceneSettings[k];
            }
        }

        const metadata: Partial<SceneMetadataState> = { ...useSceneMetadataStore.getState().metadata };

        const doc: PersistentDocumentV1 = {
            timeline: {
                ...persistedTimeline,
                id: metadata.id ?? persistedTimeline.id,
                name: metadata.name ?? persistedTimeline.name,
            },
            tracks: state.tracks,
            tracksOrder: [...state.tracksOrder],
            playbackRange: state.playbackRange,
            playbackRangeUserDefined: state.playbackRangeUserDefined,
            midiCache: state.midiCache,
            audioFeatureCaches: state.audioFeatureCaches,
            audioFeatureCacheStatus: state.audioFeatureCacheStatus,
            audioFeatureDemands: getAnalysisIntentSnapshot(),
            scene: {
                elements,
                graph,
                sceneSettings,
                macros,
                fontAssets,
                fontLicensingAcknowledgedAt,
                automation,
                nodeBindings,
            },
            metadata,
        };

        if (!opts.includeEphemeral) {
            if (elementWarnings?.length) {
                return Object.assign(doc, { _warnings: elementWarnings });
            }
            return doc;
        }
        const withEphemeral = Object.assign(doc, {
            __ephemeral: { currentTick: timeline?.currentTick, transport, timelineView },
        });
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
    _applyUnchecked(doc: PersistentDocumentV1 & { __ephemeral?: DocumentEphemeralState }) {
        const set = useTimelineStore.setState;
        const timelineCore = doc.timeline || {};
        const hydratedTracks: Record<string, any> = {};
        for (const [id, track] of Object.entries(doc.tracks || {})) {
            hydratedTracks[id] = hydrateRuntimeMidiPlacementFields(track);
        }
        set((prev: any) => ({
            ...prev,
            timeline: {
                ...prev.timeline,
                ...timelineCore,
                tempoAutomation: timelineCore.tempoAutomation
                    ? {
                          ...timelineCore.tempoAutomation,
                          laneVisible: prev.timeline.tempoAutomation?.laneVisible,
                      }
                    : prev.timeline.tempoAutomation,
                currentTick: prev.timeline.currentTick, // preserve existing playhead
            },
            tracks: hydratedTracks,
            tracksOrder: doc.tracksOrder || [],
            // Test synth routing is a session-only preview preference, never scene data.
            midiPreviewTrackIds: {},
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
            if (restored.tempoAutomation?.enabled && restored.tempoAutomation.keyframes.length > 0) {
                const derivedMap = resolveTempoKeyframes(
                    restored.tempoAutomation.keyframes,
                    restored.globalBpm,
                    CANONICAL_PPQ
                );
                useTimelineStore.getState().setMasterTempoMap(derivedMap);
            }
        } catch {
            /* non-fatal */
        }

        // Runtime declarations replace these fallbacks while the new scene is instantiated.
        beginAnalysisIntentRestore();

        // Scene & macros (note: sceneSettings tempo/meter SHOULD NOT override timeline if timeline already specified).
        const rawSceneData = {
            elements: normalizeElements(doc.scene),
            graph: doc.scene?.graph,
            sceneSettings: doc.scene?.sceneSettings,
            macros: doc.scene?.macros,
            fontAssets: doc.scene?.fontAssets,
            fontLicensingAcknowledgedAt: doc.scene?.fontLicensingAcknowledgedAt,
            automation: doc.scene?.automation,
            nodeBindings: doc.scene?.nodeBindings,
        };

        const sceneData = migrateSceneAudioSystemV5(rawSceneData);

        useSceneStore.getState().importScene(sceneData);

        mergePersistedAnalysisIntents(doc.audioFeatureDemands);

        replaceMacrosFromSnapshot(sceneData.macros);

        if (sceneData.sceneSettings) {
            try {
                const { tempo, beatsPerBar } = sceneData.sceneSettings as any;
                const api = useTimelineStore.getState();
                const tl = api.timeline;
                const haveTimelineBpm = typeof tl.globalBpm === 'number' && tl.globalBpm !== 120;
                const haveTimelineMeter = typeof tl.beatsPerBar === 'number' && tl.beatsPerBar !== 4;
                const fallbackBpm = typeof tempo === 'number' && !haveTimelineBpm ? Math.max(1, tempo) : tl.globalBpm;
                const fallbackMeter =
                    typeof beatsPerBar === 'number' && !haveTimelineMeter
                        ? Math.max(1, Math.floor(beatsPerBar))
                        : tl.beatsPerBar;
                if (fallbackBpm !== tl.globalBpm || fallbackMeter !== tl.beatsPerBar) {
                    useTimelineStore.setState((state) => ({
                        timeline: { ...state.timeline, globalBpm: fallbackBpm, beatsPerBar: fallbackMeter },
                    }));
                    sharedTimingManager.setBPM(fallbackBpm);
                    sharedTimingManager.setBeatsPerBar(fallbackMeter);
                }
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
            useSceneMetadataStore.getState().hydrate(doc.metadata);
        }
    },

    /** Apply all authored domains atomically or restore the previous canonical document. */
    apply(doc: PersistentDocumentV1 & { __ephemeral?: DocumentEphemeralState }): { ok: true } {
        const previous = this.build({ includeEphemeral: true });
        try {
            this._applyUnchecked(doc);
            return { ok: true };
        } catch (applyError) {
            const rollbackErrors: unknown[] = [];
            try {
                this._applyUnchecked(previous);
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError);
            }
            throw new DocumentApplyError(
                rollbackErrors.length ? 'Document apply and rollback failed' : 'Document apply failed',
                applyError,
                rollbackErrors
            );
        }
    },
};

export type { PersistentDocumentV1 as DocumentShapeV1 };
