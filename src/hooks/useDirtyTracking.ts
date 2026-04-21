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
 *   • sceneStore.runtimeMeta.lastMutatedAt   – any element / property mutation
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
import { useSceneStore } from '@state/sceneStore';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { useTimelineStore } from '@state/timelineStore';

interface SaveCheckpoint {
    /** sceneStore.runtimeMeta.lastMutatedAt at the time of the last save */
    sceneMutatedAt: number;
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
        sceneMutatedAt: useSceneStore.getState().runtimeMeta?.lastMutatedAt ?? 0,
        metadataModifiedAt: useSceneMetadataStore.getState().metadata.modifiedAt,
        timelineRefs: captureTimelineRefs(),
    };
}

export interface DirtyTrackingState {
    isDirty: boolean;
    /** Call after a successful save to IndexedDB or a load from IndexedDB. */
    markClean: () => void;
}

export function useDirtyTracking(): DirtyTrackingState {
    const checkpointRef = useRef<SaveCheckpoint | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const markClean = useCallback(() => {
        checkpointRef.current = captureCheckpoint();
        setIsDirty(false);
    }, []);

    useEffect(() => {
        // --- Scene element changes ---
        const unsubScene = useSceneStore.subscribe((state, prev) => {
            if (!checkpointRef.current) return;
            const mutatedAt = state.runtimeMeta?.lastMutatedAt ?? 0;
            if (mutatedAt !== checkpointRef.current.sceneMutatedAt) {
                setIsDirty(true);
            }
            // Suppress lint warning: prev is needed for the Zustand callback signature
            void prev;
        });

        // --- Metadata changes (name, author, description) ---
        const unsubMeta = useSceneMetadataStore.subscribe((state, prev) => {
            if (!checkpointRef.current) return;
            if (state.metadata.modifiedAt !== checkpointRef.current.metadataModifiedAt) {
                setIsDirty(true);
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
            }
            void prev;
        });

        return () => {
            unsubScene();
            unsubMeta();
            unsubTimeline();
        };
    }, []);

    return { isDirty, markClean };
}
