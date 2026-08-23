import { useCallback, useRef, useEffect } from 'react';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { type QuantizeSetting } from '@state/timeline/quantize';
import { zoomAround, getContentEndTick, isEditableTarget } from '../utils/timelineNavUtils';
import { getMidiClipTimelineBounds, getMidiClipsForTrack } from '@state/timeline/midiClips';
import { getAudioClipTimelineBounds, getAudioClipsForTrack } from '@state/timeline/audioClips';
import { createTimelineTimingContext } from '@state/timeline/timelineShared';
import {
    copyTimelineSelectionToClipboard,
    getTimelineClipDuplicateDestination,
    getTimelineClipClipboard,
    getAudioClipsInTimelineSelection,
    getMidiClipsInTimelineSelection,
    prepareTimelineClipPaste,
} from '../clipboard/midiClipClipboard';
import { useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { isCommandSurfaceActive } from '@context/commands/commandContext';

/**
 * Provides view preset callbacks (fitAll, zoomToSelection, centerOnPlayhead, frameSelection)
 * and registers keyboard shortcuts for zoom, navigation, snap toggle, and track deletion.
 */
export function useTimelineNavigation() {
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const lastSnapRef = useRef<QuantizeSetting>('bar');
    useEffect(() => {
        if (quantize !== 'off') lastSnapRef.current = quantize;
    }, [quantize]);

    const fitAll = useCallback(() => {
        const state = useTimelineStore.getState();
        const endTick = getContentEndTick(state);
        const finalEnd = Math.max(endTick, CANONICAL_PPQ * 8);
        const padding = (finalEnd - 0) * 0.05;
        setTimelineViewTicks(Math.round(-padding), Math.round(finalEnd + padding));
    }, [setTimelineViewTicks]);

    const zoomToSelection = useCallback(() => {
        const state = useTimelineStore.getState();
        const selection = useSelectionStore.getState();
        const selectedIds = selection.selectedTrackIds;
        const selectedKeyframes = selection.selectedKeyframes;
        const clipTimelineSelection = selection.clipTimelineSelection;

        if (!selectedIds.length && !selectedKeyframes.length && !clipTimelineSelection) return;

        let minTick = Infinity,
            maxTick = -Infinity;
        const timing = createTimelineTimingContext(state);

        for (const id of selectedIds) {
            const track = state.tracks[id] as any;
            if (!track) continue;
            const offset: number = track.offsetTicks ?? 0;
            if (track.type === 'midi') {
                for (const clip of getMidiClipsForTrack(track)) {
                    if (clip.enabled === false) continue;
                    const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
                    if (bounds) {
                        minTick = Math.min(minTick, bounds.startTick);
                        maxTick = Math.max(maxTick, bounds.endTick);
                    }
                }
            } else if (track.type === 'audio') {
                for (const clip of getAudioClipsForTrack(track)) {
                    if (clip.enabled === false) continue;
                    const bounds = getAudioClipTimelineBounds(state.audioCache, clip, timing);
                    if (bounds) {
                        minTick = Math.min(minTick, bounds.startTick);
                        maxTick = Math.max(maxTick, bounds.endTick);
                    }
                }
            }
        }

        for (const { tick } of selectedKeyframes) {
            minTick = Math.min(minTick, tick);
            maxTick = Math.max(maxTick, tick);
        }

        if (clipTimelineSelection?.type === 'range') {
            minTick = Math.min(minTick, clipTimelineSelection.range.startTick);
            maxTick = Math.max(maxTick, clipTimelineSelection.range.endTick);
        } else if (clipTimelineSelection?.type === 'point') {
            minTick = Math.min(minTick, clipTimelineSelection.point.tick);
            maxTick = Math.max(maxTick, clipTimelineSelection.point.tick);
        } else if (clipTimelineSelection?.type === 'clips') {
            for (const ref of clipTimelineSelection.clips) {
                const track = state.tracks[ref.trackId];
                if (!track) continue;
                const kind = ref.kind ?? track.type;
                const clip =
                    kind === 'midi' && track.type === 'midi'
                        ? getMidiClipsForTrack(track).find((c) => c.id === ref.clipId)
                        : kind === 'audio' && track.type === 'audio'
                          ? getAudioClipsForTrack(track).find((c) => c.id === ref.clipId)
                          : undefined;
                if (!clip) continue;
                const bounds =
                    kind === 'midi'
                        ? getMidiClipTimelineBounds(state.midiCache, clip as any)
                        : getAudioClipTimelineBounds(state.audioCache, clip as any, timing);
                if (bounds) {
                    minTick = Math.min(minTick, bounds.startTick);
                    maxTick = Math.max(maxTick, bounds.endTick);
                }
            }
        }

        if (!isFinite(minTick) || !isFinite(maxTick)) return;
        const padding = Math.max(CANONICAL_PPQ, (maxTick - minTick) * 0.1);
        setTimelineViewTicks(Math.round(minTick - padding), Math.round(maxTick + padding));
    }, [setTimelineViewTicks]);

    const centerOnPlayhead = useCallback(() => {
        const state = useTimelineStore.getState();
        const { startTick, endTick } = state.timelineView;
        const range = Math.max(1, endTick - startTick);
        const tick = state.timeline.currentTick;
        setTimelineViewTicks(Math.round(tick - range / 2), Math.round(tick + range / 2));
    }, [setTimelineViewTicks]);

    const frameSelection = useCallback(() => {
        const selection = useSelectionStore.getState();
        if (
            selection.selectedTrackIds.length ||
            selection.selectedKeyframes.length ||
            selection.clipTimelineSelection
        ) {
            zoomToSelection();
        } else {
            centerOnPlayhead();
        }
    }, [zoomToSelection, centerOnPlayhead]);

    // Keyboard shortcuts: zoom, navigate, snap toggle
    useGlobalShortcut({
        id: 'timeline.navigation',
        domain: 'timeline',
        matches: (event) => {
            if (
                !isCommandSurfaceActive(['timeline-clips', 'timeline-automation'], event) ||
                isEditableTarget(event.target as Element | null) ||
                event.altKey ||
                event.metaKey ||
                event.ctrlKey
            ) {
                return false;
            }
            if (event.code === 'Digit1' || event.code === 'Digit2') return event.shiftKey;
            if (event.code === 'Equal' || event.code === 'Minus') return true;
            return !event.shiftKey && ['KeyF', 'KeyS', 'ArrowLeft', 'ArrowRight'].includes(event.code);
        },
        handle: (e) => {
            const ZOOM_STEP = 1.3;
            if (isEditableTarget(document.activeElement)) return;
            const state = useTimelineStore.getState();
            const { startTick, endTick } = state.timelineView;
            const center = (startTick + endTick) / 2;

            switch (e.code) {
                case 'Equal': {
                    const { newStart, newEnd } = zoomAround(startTick, endTick, center, 1 / ZOOM_STEP);
                    state.setTimelineViewTicks(newStart, newEnd);
                    e.preventDefault();
                    break;
                }
                case 'Minus': {
                    const { newStart, newEnd } = zoomAround(startTick, endTick, center, ZOOM_STEP);
                    state.setTimelineViewTicks(newStart, newEnd);
                    e.preventDefault();
                    break;
                }
                case 'Digit1':
                    fitAll();
                    e.preventDefault();
                    break;
                case 'Digit2':
                    zoomToSelection();
                    e.preventDefault();
                    break;
                case 'KeyF':
                    frameSelection();
                    e.preventDefault();
                    break;
                case 'KeyS': {
                    const snapState = useTimelineStore.getState();
                    const q = snapState.transport.quantize;
                    snapState.setQuantize(q !== 'off' ? 'off' : lastSnapRef.current);
                    e.preventDefault();
                    break;
                }
                case 'ArrowLeft':
                case 'ArrowRight': {
                    if (e.defaultPrevented || e.ctrlKey || e.metaKey) break;
                    const sel = useSelectionStore.getState();
                    if (sel.activeTarget === 'elements' && sel.selectedNodeIds.length > 0) break;
                    const nudge = e.shiftKey ? CANONICAL_PPQ * (state.timeline.beatsPerBar || 4) : CANONICAL_PPQ;
                    const dir = e.key === 'ArrowLeft' ? -1 : 1;
                    const next = Math.max(0, state.timeline.currentTick + dir * nudge);
                    state.seekTick(next);
                    e.preventDefault();
                    break;
                }
                default:
                    break;
            }
            return e.defaultPrevented;
        },
    });

    // Cmd+A: select all clips when clip timeline is active
    useGlobalShortcut({
        id: 'timeline.select-all-clips',
        domain: 'timeline',
        matches: (event) =>
            isCommandSurfaceActive('timeline-clips', event) &&
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'a' &&
            !isEditableTarget(event.target as Element | null),
        handle: (e) => {
            const sel = useSelectionStore.getState();
            if (sel.activeTarget !== 'clipTimeline') return false;
            const state = useTimelineStore.getState();
            const allRefs: Array<{ trackId: string; clipId: string; kind: 'midi' | 'audio' }> = [];
            for (const trackId of state.tracksOrder) {
                const track = state.tracks[trackId];
                if (!track) continue;
                if (track.type === 'midi') {
                    for (const clip of getMidiClipsForTrack(track)) {
                        if (clip.enabled !== false) allRefs.push({ trackId, clipId: clip.id, kind: 'midi' });
                    }
                } else if (track.type === 'audio') {
                    for (const clip of getAudioClipsForTrack(track)) {
                        if (clip.enabled !== false) allRefs.push({ trackId, clipId: clip.id, kind: 'audio' });
                    }
                }
            }
            if (allRefs.length) {
                sel.selectClipTimeline({ type: 'clips', clips: allRefs });
                e.preventDefault();
                e.stopPropagation();
                return true;
            }
            return false;
        },
    });

    // Resolve paste destination from current selection state
    const resolvePasteDestination = () => {
        const timelineState = useTimelineStore.getState();
        const selection = useSelectionStore.getState();
        const clipSelection = selection.clipTimelineSelection;
        const clipboard = getTimelineClipClipboard();
        const preferredKind = clipboard?.clips[0]?.kind;
        const isCompatible = (id: string) =>
            preferredKind ? timelineState.tracks[id]?.type === preferredKind : Boolean(timelineState.tracks[id]);
        if (clipSelection?.type === 'range') {
            const trackId = clipSelection.range.trackIds.find(isCompatible);
            if (trackId) return { trackId, tick: clipSelection.range.startTick };
        }
        if (clipSelection?.type === 'point' && isCompatible(clipSelection.point.trackId)) {
            return { trackId: clipSelection.point.trackId, tick: clipSelection.point.tick };
        }
        if (clipSelection?.type === 'clips' && clipSelection.clips.length) {
            // Find first track (in track order) that has selected clips
            const clipTrackIds = new Set(clipSelection.clips.map((c) => c.trackId));
            const firstTrackId = timelineState.tracksOrder.find((id) => clipTrackIds.has(id) && isCompatible(id));
            if (firstTrackId) {
                // Paste at the minimum offset of selected clips on that track
                const track = timelineState.tracks[firstTrackId];
                let minTick = Infinity;
                if (track) {
                    for (const ref of clipSelection.clips) {
                        if (ref.trackId !== firstTrackId) continue;
                        const clip =
                            track.type === 'midi'
                                ? getMidiClipsForTrack(track).find((c) => c.id === ref.clipId)
                                : track.type === 'audio'
                                  ? getAudioClipsForTrack(track).find((c) => c.id === ref.clipId)
                                  : undefined;
                        if (clip) minTick = Math.min(minTick, clip.offsetTicks);
                    }
                }
                return {
                    trackId: firstTrackId,
                    tick: isFinite(minTick) ? minTick : timelineState.timeline.currentTick,
                };
            }
        }
        const selectedTrack = selection.selectedTrackIds.find(isCompatible);
        if (selectedTrack) return { trackId: selectedTrack, tick: timelineState.timeline.currentTick };
        const firstCompatibleTrack = timelineState.tracksOrder.find(isCompatible);
        return firstCompatibleTrack
            ? { trackId: firstCompatibleTrack, tick: timelineState.timeline.currentTick }
            : null;
    };

    // Helper: execute a paste and update selection to pasted clips
    const executePaste = (prepared: ReturnType<typeof prepareTimelineClipPaste>) => {
        if (!prepared) return;
        const pastedIds = new Set([
            ...prepared.midiClips.map((entry) => entry.clip.id),
            ...prepared.audioClips.map((entry) => entry.clip.id),
        ]);
        const tasks: Array<Promise<unknown>> = [];
        if (prepared.midiClips.length) {
            tasks.push(
                timelineCommandGateway.dispatchById(
                    'timeline.pasteMidiClips',
                    {
                        clips: prepared.midiClips,
                        createTracks: prepared.createMidiTracks,
                        midiCache: prepared.midiCache,
                    },
                    { source: 'timeline-clipboard' }
                )
            );
        }
        if (prepared.audioClips.length) {
            tasks.push(
                timelineCommandGateway.dispatchById(
                    'timeline.pasteAudioClips',
                    {
                        clips: prepared.audioClips,
                        createTracks: prepared.createAudioTracks,
                        audioCache: prepared.audioCache,
                    },
                    { source: 'timeline-clipboard' }
                )
            );
        }
        void Promise.all(tasks)
            .then(() => {
                const state = useTimelineStore.getState();
                const clips: Array<{ trackId: string; clipId: string; kind: 'midi' | 'audio' }> = [];
                for (const trackId of state.tracksOrder) {
                    const track = state.tracks[trackId];
                    if (!track) continue;
                    if (track.type === 'midi') {
                        for (const clip of getMidiClipsForTrack(track)) {
                            if (pastedIds.has(clip.id)) clips.push({ trackId, clipId: clip.id, kind: 'midi' });
                        }
                    } else if (track.type === 'audio') {
                        for (const clip of getAudioClipsForTrack(track)) {
                            if (pastedIds.has(clip.id)) clips.push({ trackId, clipId: clip.id, kind: 'audio' });
                        }
                    }
                }
                if (clips.length) {
                    useSelectionStore.getState().selectClipTimeline({ type: 'clips', clips });
                }
            })
            .catch((error) => console.error('[timeline] failed to paste timeline clips', error));
    };

    // Cmd+C / Cmd+V copy-paste
    useGlobalShortcut({
        id: 'timeline.clipboard',
        domain: 'timeline',
        matches: (event) =>
            isCommandSurfaceActive('timeline-clips', event) &&
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            ['c', 'v'].includes(event.key.toLowerCase()) &&
            !isEditableTarget(event.target as Element | null),
        handle: (e) => {
            const key = e.key.toLowerCase();

            if (key === 'c') {
                const selection = useSelectionStore.getState();
                if (selection.activeTarget !== 'clipTimeline') return;
                const clipSel = selection.clipTimelineSelection;
                if (!clipSel || clipSel.type === 'point') return;
                const copied = copyTimelineSelectionToClipboard(useTimelineStore.getState(), clipSel);
                if (copied) {
                    e.preventDefault();
                    e.stopPropagation();
                    return true;
                }
                return false;
            }

            if (key === 'v') {
                const clipboard = getTimelineClipClipboard();
                if (!clipboard) return false;
                const destination = resolvePasteDestination();
                if (!destination) return false;
                const prepared = prepareTimelineClipPaste(useTimelineStore.getState(), clipboard, destination);
                if (!prepared) return false;
                e.preventDefault();
                e.stopPropagation();
                executePaste(prepared);
                return true;
            }
            return false;
        },
    });

    // Cmd+X: cut (copy + delete in single undo step for delete)
    useGlobalShortcut({
        id: 'timeline.cut-clips',
        domain: 'timeline',
        matches: (event) =>
            isCommandSurfaceActive('timeline-clips', event) &&
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            event.key.toLowerCase() === 'x' &&
            !isEditableTarget(event.target as Element | null),
        handle: (e) => {
            const selection = useSelectionStore.getState();
            if (selection.activeTarget !== 'clipTimeline') return false;
            const clipSel = selection.clipTimelineSelection;
            if (!clipSel || clipSel.type === 'point') return false;
            const state = useTimelineStore.getState();
            const copied = copyTimelineSelectionToClipboard(state, clipSel);
            if (!copied) return false;
            e.preventDefault();
            e.stopPropagation();
            const midiClips = getMidiClipsInTimelineSelection(state, clipSel);
            const audioClips = getAudioClipsInTimelineSelection(state, clipSel);
            if (!midiClips.length && !audioClips.length) return true;
            if (midiClips.length) void useTimelineStore.getState().removeMidiClips({ clips: midiClips });
            if (audioClips.length) void useTimelineStore.getState().removeAudioClips({ clips: audioClips });
            useSelectionStore.getState().clearSelection('clipTimeline');
            return true;
        },
    });

    // Cmd+D: duplicate (paste copy immediately after current clips)
    useGlobalShortcut({
        id: 'timeline.duplicate-clips',
        domain: 'timeline',
        matches: (event) =>
            isCommandSurfaceActive('timeline-clips', event) &&
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            event.key.toLowerCase() === 'd' &&
            !isEditableTarget(event.target as Element | null),
        handle: (e) => {
            const selection = useSelectionStore.getState();
            if (selection.activeTarget !== 'clipTimeline') return false;
            const clipSel = selection.clipTimelineSelection;
            if (!clipSel || clipSel.type === 'point') return false;
            e.preventDefault();
            e.stopPropagation();
            const state = useTimelineStore.getState();
            // Build a clipboard payload from selected clips
            const copied = copyTimelineSelectionToClipboard(state, clipSel);
            if (!copied) return true;
            const destination = getTimelineClipDuplicateDestination(state, copied);
            if (!destination) return true;
            const prepared = prepareTimelineClipPaste(state, copied, destination);
            if (!prepared) return true;
            executePaste(prepared);
            return true;
        },
    });

    // Delete/Backspace
    useGlobalShortcut({
        id: 'timeline.delete-selection',
        domain: 'timeline',
        matches: (event) =>
            isCommandSurfaceActive(['timeline-clips', 'timeline-automation'], event) &&
            (event.key === 'Delete' || event.key === 'Backspace') &&
            !isEditableTarget(event.target as Element | null),
        handle: (e) => {
            const activeTarget = useSelectionStore.getState().getActiveCommandTarget();
            switch (activeTarget) {
                case 'tracks': {
                    const ids = useSelectionStore.getState().selectedTrackIds;
                    if (!ids.length) return;
                    useTimelineStore.getState().removeTracks(ids);
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                }
                case 'clipTimeline': {
                    const selection = useSelectionStore.getState().clipTimelineSelection;
                    if (!selection || selection.type === 'point') {
                        useSelectionStore.getState().clearSelection('clipTimeline');
                        e.preventDefault();
                        e.stopPropagation();
                        break;
                    }
                    const state = useTimelineStore.getState();
                    const midiClips = getMidiClipsInTimelineSelection(state, selection);
                    const audioClips = getAudioClipsInTimelineSelection(state, selection);
                    if (!midiClips.length && !audioClips.length) {
                        useSelectionStore.getState().clearSelection('clipTimeline');
                        e.preventDefault();
                        e.stopPropagation();
                        break;
                    }
                    if (midiClips.length) void useTimelineStore.getState().removeMidiClips({ clips: midiClips });
                    if (audioClips.length) void useTimelineStore.getState().removeAudioClips({ clips: audioClips });
                    useSelectionStore.getState().clearSelection('clipTimeline');
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                }
                case 'keyframes':
                case 'elements':
                    break;
                default:
                    break;
            }
            return e.defaultPrevented;
        },
    });

    return { fitAll, zoomToSelection, centerOnPlayhead, frameSelection };
}
