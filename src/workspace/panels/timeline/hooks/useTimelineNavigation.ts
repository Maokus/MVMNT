import { useCallback, useRef, useEffect } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { type QuantizeSetting } from '@state/timeline/quantize';
import { zoomAround, getContentEndTick, isEditableTarget } from '../utils/timelineNavUtils';

/**
 * Provides view preset callbacks (fitAll, zoomToSelection, centerOnPlayhead, frameSelection)
 * and registers keyboard shortcuts for zoom, navigation, snap toggle, and track deletion.
 */
export function useTimelineNavigation() {
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const lastSnapRef = useRef<QuantizeSetting>('bar');
    useEffect(() => { if (quantize !== 'off') lastSnapRef.current = quantize; }, [quantize]);

    const fitAll = useCallback(() => {
        const state = useTimelineStore.getState();
        const endTick = getContentEndTick(state);
        const finalEnd = Math.max(endTick, CANONICAL_PPQ * 8);
        const padding = (finalEnd - 0) * 0.05;
        setTimelineViewTicks(Math.round(-padding), Math.round(finalEnd + padding));
    }, [setTimelineViewTicks]);

    const zoomToSelection = useCallback(() => {
        const state = useTimelineStore.getState();
        const selectedIds = state.selection.selectedTrackIds;
        const selectedKeyframes = useSceneStore.getState().interaction.automationSelectedKeyframes;

        if (!selectedIds.length && !selectedKeyframes.length) return;

        let minTick = Infinity, maxTick = -Infinity;

        for (const id of selectedIds) {
            const track = state.tracks[id] as any;
            if (!track) continue;
            const offset: number = track.offsetTicks ?? 0;
            if (track.midiSourceId) {
                const cache = state.midiCache[track.midiSourceId];
                if (cache?.notesRaw?.length) {
                    minTick = Math.min(minTick, offset);
                    maxTick = Math.max(maxTick, offset + cache.notesRaw[cache.notesRaw.length - 1].endTick);
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
        const state = useTimelineStore.getState();
        if (state.selection.selectedTrackIds.length) {
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
                    if (e.shiftKey) { fitAll(); e.preventDefault(); }
                    break;
                case '@':
                    if (e.shiftKey) { zoomToSelection(); e.preventDefault(); }
                    break;
                case 'f':
                case 'F':
                    frameSelection();
                    e.preventDefault();
                    break;
                case 's':
                case 'S': {
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

    // Delete/Backspace removes selected tracks (skips if automation or scene elements are selected)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (isEditableTarget(document.activeElement)) return;
            const automationSelected = useSceneStore.getState().interaction.automationSelectedKeyframes;
            if (automationSelected.length > 0) return;
            const selectedElementIds = useSceneStore.getState().interaction.selectedElementIds;
            if (selectedElementIds.length > 0) return;
            const ids = useTimelineStore.getState().selection.selectedTrackIds;
            if (!ids.length) return;
            useTimelineStore.getState().removeTracks(ids);
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as any);
    }, []);

    return { fitAll, zoomToSelection, centerOnPlayhead, frameSelection };
}
