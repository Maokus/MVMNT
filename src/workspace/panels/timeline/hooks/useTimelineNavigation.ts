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
    useEffect(() => {
        const ZOOM_STEP = 1.3;
        const handler = (e: KeyboardEvent) => {
            if (isEditableTarget(document.activeElement)) return;
            const state = useTimelineStore.getState();
            const { startTick, endTick } = state.timelineView;
            const center = (startTick + endTick) / 2;

            switch (e.key) {
                case '+':
                case '=': {
                    const { newStart, newEnd } = zoomAround(startTick, endTick, center, 1 / ZOOM_STEP);
                    state.setTimelineViewTicks(newStart, newEnd);
                    e.preventDefault();
                    break;
                }
                case '-': {
                    const { newStart, newEnd } = zoomAround(startTick, endTick, center, ZOOM_STEP);
                    state.setTimelineViewTicks(newStart, newEnd);
                    e.preventDefault();
                    break;
                }
                case '!':
                    if (e.shiftKey) {
                        fitAll();
                        e.preventDefault();
                    }
                    break;
                case '@':
                    if (e.shiftKey) {
                        zoomToSelection();
                        e.preventDefault();
                    }
                    break;
                case 'f':
                case 'F':
                    frameSelection();
                    e.preventDefault();
                    break;
                case 's':
                case 'S': {
                    if (e.ctrlKey || e.metaKey) break;
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
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, [fitAll, zoomToSelection, frameSelection]);

    // Cmd+A: select all clips when clip timeline is active
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (isEditableTarget(document.activeElement)) return;
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
            const sel = useSelectionStore.getState();
            if (sel.activeTarget !== 'clipTimeline') return;
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
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, []);

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
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (isEditableTarget(document.activeElement)) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
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
                }
                return;
            }

            if (key === 'v') {
                const clipboard = getTimelineClipClipboard();
                if (!clipboard) return;
                const destination = resolvePasteDestination();
                if (!destination) return;
                const prepared = prepareTimelineClipPaste(useTimelineStore.getState(), clipboard, destination);
                if (!prepared) return;
                e.preventDefault();
                e.stopPropagation();
                executePaste(prepared);
                return;
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, []);

    // Cmd+X: cut (copy + delete in single undo step for delete)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (isEditableTarget(document.activeElement)) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'x') return;
            const selection = useSelectionStore.getState();
            if (selection.activeTarget !== 'clipTimeline') return;
            const clipSel = selection.clipTimelineSelection;
            if (!clipSel || clipSel.type === 'point') return;
            const state = useTimelineStore.getState();
            const copied = copyTimelineSelectionToClipboard(state, clipSel);
            if (!copied) return;
            e.preventDefault();
            e.stopPropagation();
            const midiClips = getMidiClipsInTimelineSelection(state, clipSel);
            const audioClips = getAudioClipsInTimelineSelection(state, clipSel);
            if (!midiClips.length && !audioClips.length) return;
            if (midiClips.length) void useTimelineStore.getState().removeMidiClips({ clips: midiClips });
            if (audioClips.length) void useTimelineStore.getState().removeAudioClips({ clips: audioClips });
            useSelectionStore.getState().clearSelection('clipTimeline');
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, []);

    // Cmd+D: duplicate (paste copy immediately after current clips)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (isEditableTarget(document.activeElement)) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'd') return;
            const selection = useSelectionStore.getState();
            if (selection.activeTarget !== 'clipTimeline') return;
            const clipSel = selection.clipTimelineSelection;
            if (!clipSel || clipSel.type === 'point') return;
            e.preventDefault();
            e.stopPropagation();
            const state = useTimelineStore.getState();
            // Build a clipboard payload from selected clips
            const copied = copyTimelineSelectionToClipboard(state, clipSel);
            if (!copied) return;
            const destination = getTimelineClipDuplicateDestination(state, copied);
            if (!destination) return;
            const prepared = prepareTimelineClipPaste(state, copied, destination);
            if (!prepared) return;
            executePaste(prepared);
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, []);

    // Delete/Backspace
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (isEditableTarget(document.activeElement)) return;
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
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, []);

    return { fitAll, zoomToSelection, centerOnPlayhead, frameSelection };
}
