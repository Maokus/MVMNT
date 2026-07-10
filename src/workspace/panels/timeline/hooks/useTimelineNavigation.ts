import { useCallback, useRef, useEffect } from 'react';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { type QuantizeSetting } from '@state/timeline/quantize';
import { zoomAround, getContentEndTick, isEditableTarget } from '../utils/timelineNavUtils';
import { getMidiClipTimelineBounds, getMidiClipsForTrack } from '@state/timeline/midiClips';
import {
    copySelectedMidiClipsToClipboard,
    getMidiClipClipboard,
    prepareMidiClipPaste,
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
        const selectedClips = selection.selectedTimelineClips;
        const clipTimelineSelection = selection.clipTimelineSelection;

        if (!selectedIds.length && !selectedKeyframes.length && !selectedClips.length && !clipTimelineSelection) return;

        let minTick = Infinity,
            maxTick = -Infinity;

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
            } else {
                const entry = (state as any).audioCache?.[id];
                if (entry?.durationTicks) {
                    minTick = Math.min(minTick, offset);
                    maxTick = Math.max(maxTick, offset + entry.durationTicks);
                }
            }
        }

        for (const { tick } of selectedKeyframes) {
            minTick = Math.min(minTick, tick);
            maxTick = Math.max(maxTick, tick);
        }

        for (const { trackId, clipId } of selectedClips) {
            const track = state.tracks[trackId];
            if (!track || track.type !== 'midi') continue;
            const clip = getMidiClipsForTrack(track).find((entry) => entry.id === clipId);
            if (!clip || clip.enabled === false) continue;
            const bounds = getMidiClipTimelineBounds(state.midiCache, clip);
            if (!bounds) continue;
            minTick = Math.min(minTick, bounds.startTick);
            maxTick = Math.max(maxTick, bounds.endTick);
        }

        if (clipTimelineSelection?.type === 'range') {
            minTick = Math.min(minTick, clipTimelineSelection.range.startTick);
            maxTick = Math.max(maxTick, clipTimelineSelection.range.endTick);
        } else if (clipTimelineSelection?.type === 'point') {
            minTick = Math.min(minTick, clipTimelineSelection.point.tick);
            maxTick = Math.max(maxTick, clipTimelineSelection.point.tick);
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
            selection.selectedTimelineClips.length ||
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
                    if (e.ctrlKey || e.metaKey) break; // reserved for save
                    const snapState = useTimelineStore.getState();
                    const q = snapState.transport.quantize;
                    snapState.setQuantize(q !== 'off' ? 'off' : lastSnapRef.current);
                    e.preventDefault();
                    break;
                }
                // Arrow keys → nudge playhead (skip if Ctrl/Cmd — reserved for single-tick step)
                case 'ArrowLeft':
                case 'ArrowRight': {
                    if (e.defaultPrevented || e.ctrlKey || e.metaKey) break;
                    // Don't nudge playhead when elements are selected (arrow keys nudge the element instead)
                    const sel = useSelectionStore.getState();
                    if (sel.activeTarget === 'elements' && sel.selectedElementIds.length > 0) break;
                    const nudge = e.shiftKey
                        ? CANONICAL_PPQ * (state.timeline.beatsPerBar || 4) // 1 bar
                        : CANONICAL_PPQ; // 1 beat
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

    useEffect(() => {
        const resolvePasteDestination = () => {
            const timelineState = useTimelineStore.getState();
            const selection = useSelectionStore.getState();
            const clipSelection = selection.clipTimelineSelection;
            if (clipSelection?.type === 'range') {
                const trackId = clipSelection.range.trackIds.find((id) => timelineState.tracks[id]?.type === 'midi');
                if (trackId) {
                    return { trackId, tick: clipSelection.range.startTick };
                }
            }
            if (clipSelection?.type === 'point' && timelineState.tracks[clipSelection.point.trackId]?.type === 'midi') {
                return { trackId: clipSelection.point.trackId, tick: clipSelection.point.tick };
            }
            const selectedClipTrack = selection.selectedTimelineClips.find(
                (entry) => timelineState.tracks[entry.trackId]?.type === 'midi',
            )?.trackId;
            if (selectedClipTrack) {
                return { trackId: selectedClipTrack, tick: timelineState.timeline.currentTick };
            }
            const selectedTrack = selection.selectedTrackIds.find((id) => timelineState.tracks[id]?.type === 'midi');
            if (selectedTrack) {
                return { trackId: selectedTrack, tick: timelineState.timeline.currentTick };
            }
            const firstMidiTrack = timelineState.tracksOrder.find((id) => timelineState.tracks[id]?.type === 'midi');
            return firstMidiTrack ? { trackId: firstMidiTrack, tick: timelineState.timeline.currentTick } : null;
        };

        const handler = (e: KeyboardEvent) => {
            if (isEditableTarget(document.activeElement)) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            if (e.key.toLowerCase() === 'c') {
                const selection = useSelectionStore.getState();
                if (selection.activeTarget !== 'timelineClips' || !selection.selectedTimelineClips.length) return;
                const copied = copySelectedMidiClipsToClipboard(useTimelineStore.getState(), selection.selectedTimelineClips);
                if (copied) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }
            if (e.key.toLowerCase() !== 'v') return;
            const clipboard = getMidiClipClipboard();
            if (!clipboard) return;
            const destination = resolvePasteDestination();
            if (!destination) return;
            const prepared = prepareMidiClipPaste(useTimelineStore.getState(), clipboard, destination);
            if (!prepared) return;
            e.preventDefault();
            e.stopPropagation();
            void timelineCommandGateway
                .dispatchById(
                    'timeline.pasteMidiClips',
                    { clips: prepared.clips, createTracks: prepared.createTracks },
                    { source: 'timeline-clipboard' },
                )
                .then(() => {
                    useSelectionStore.getState().selectTimelineClips(
                        prepared.clips.map((entry) => ({ trackId: entry.trackId, clipId: entry.clip.id })),
                    );
                })
                .catch((error) => {
                    console.error('[timeline] failed to paste MIDI clips', error);
                });
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, []);

    // Delete/Backspace dispatches based on activeTarget from selectionStore
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
                case 'timelineClips': {
                    const clips = useSelectionStore.getState().selectedTimelineClips;
                    if (!clips.length) return;
                    void useTimelineStore.getState().removeMidiClips({ clips });
                    useSelectionStore.getState().clearSelection('timelineClips');
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                }
                case 'clipTimeline':
                    useSelectionStore.getState().clearSelection('clipTimeline');
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                case 'keyframes':
                case 'elements':
                    // Handled by scene/canvas delete handlers; do not interfere.
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
