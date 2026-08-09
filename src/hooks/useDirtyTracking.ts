/**
 * Tracks whether the current in-memory state differs from the last explicitly
 * saved version.
 *
 * Strategy
 * --------
 * After a save or a startup load from IndexedDB, `markClean()` records a
 * lightweight "checkpoint" from the three stores that make up the persistent
 * document:
 *
 *   • sceneEditorStore.documentRevision      – any authored scene mutation
 *   • sceneMetadataStore.metadata.modifiedAt – name / author / description edits
 *   • Structural fields of timelineStore      – tracks, MIDI cache, tempo, etc.
 *                                               (NOT currentTick / transport /
 *                                               timelineView which are ephemeral)
 *
 * Each store is subscribed to with Zustand's built-in subscribe API.  The
 * timeline subscription uses reference-equality guards on the non-ephemeral
 * fields so that playhead movements during playback never trigger a dirty mark.
 *
 * Exposing `markClean` lets call-sites (save, startup load) opt into clearing
 * the dirty flag without any special Redux-style action.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useTimelineStore } from '@state/timelineStore';

interface SaveCheckpoint {
    /** Authored scene revision at the time of the last save. */
    sceneRevision: number;
    /** sceneMetadataStore.metadata.modifiedAt at the time of the last save */
    metadataModifiedAt: string;
    /**
     * Object references for the timeline fields that are part of the
     * persistent document.  Using object identity (===) is cheap: Zustand
     * produces new references whenever a slice is mutated, so we detect
     * changes without deep comparison or JSON serialisation.
     */
    timelineRefs: TimelineRefs;
}

interface TimelineRefs {
    tracksOrder: unknown;
    tracks: unknown;
    playbackRange: unknown;
    playbackRangeUserDefined: unknown;
    midiCache: unknown;
    audioFeatureCaches: unknown;
    tempoMap: unknown;
    bpm: unknown;
}

function captureTimelineRefs(): TimelineRefs {
    const s = useTimelineStore.getState();
    return {
        tracksOrder: s.tracksOrder,
        tracks: s.tracks,
        playbackRange: s.playbackRange,
        playbackRangeUserDefined: s.playbackRangeUserDefined,
        midiCache: s.midiCache,
        audioFeatureCaches: s.audioFeatureCaches,
        tempoMap: (s as any).timeline?.tempoMap,
        bpm: (s as any).timeline?.bpm,
    };
}

function timelineRefsDiffer(a: TimelineRefs, b: TimelineRefs): boolean {
    return (
        a.tracksOrder !== b.tracksOrder ||
        a.tracks !== b.tracks ||
        a.playbackRange !== b.playbackRange ||
        a.playbackRangeUserDefined !== b.playbackRangeUserDefined ||
        a.midiCache !== b.midiCache ||
        a.audioFeatureCaches !== b.audioFeatureCaches ||
        a.tempoMap !== b.tempoMap ||
        a.bpm !== b.bpm
    );
}

function captureCheckpoint(): SaveCheckpoint {
    return {
        sceneRevision: useSceneEditorStore.getState().documentRevision,
        metadataModifiedAt: useSceneMetadataStore.getState().metadata.modifiedAt,
        timelineRefs: captureTimelineRefs(),
    };
}

export interface DirtyTrackingState {
    isDirty: boolean;
    /** Monotonically increases for each persistent edit while this document is open. */
    dirtyRevision: number;
    /** Call after a successful save to IndexedDB or a load from IndexedDB. */
    markClean: () => void;
    /** Explicitly mark the scene as dirty (e.g. after loading a template/remix). */
    markDirty: () => void;
}

export function useDirtyTracking(): DirtyTrackingState {
    const checkpointRef = useRef<SaveCheckpoint | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [dirtyRevision, setDirtyRevision] = useState(0);

    const markClean = useCallback(() => {
        checkpointRef.current = captureCheckpoint();
        setIsDirty(false);
    }, []);

    const markDirty = useCallback(() => {
        if (!checkpointRef.current) {
            // Initialise checkpoint so subscriptions track future changes correctly.
            checkpointRef.current = captureCheckpoint();
        }
        setIsDirty(true);
        setDirtyRevision((revision) => revision + 1);
    }, []);

    useEffect(() => {
        // --- Scene element changes ---
        const unsubScene = useSceneEditorStore.subscribe((state) => {
            if (!checkpointRef.current) return;
            if (state.documentRevision !== checkpointRef.current.sceneRevision) {
                setIsDirty(true);
                setDirtyRevision((revision) => revision + 1);
            }
        });

        // --- Metadata changes (name, author, description) ---
        const unsubMeta = useSceneMetadataStore.subscribe((state, prev) => {
            if (!checkpointRef.current) return;
            if (state.metadata.modifiedAt !== checkpointRef.current.metadataModifiedAt) {
                setIsDirty(true);
                setDirtyRevision((revision) => revision + 1);
            }
            void prev;
        });

        // --- Timeline structural changes (tracks, MIDI, tempo, etc.) ---
        // Reference-equality check avoids marking dirty on playhead ticks.
        const unsubTimeline = useTimelineStore.subscribe((state, prev) => {
            if (!checkpointRef.current) return;
            const currentRefs = captureTimelineRefs();
            if (timelineRefsDiffer(currentRefs, checkpointRef.current.timelineRefs)) {
                setIsDirty(true);
                setDirtyRevision((revision) => revision + 1);
            }
            void prev;
        });

        return () => {
            unsubScene();
            unsubMeta();
            unsubTimeline();
        };
    }, []);

    return { isDirty, dirtyRevision, markClean, markDirty };
}
