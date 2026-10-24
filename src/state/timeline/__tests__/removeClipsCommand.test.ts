import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import { createPatchUndoController } from '@state/undo';
import { useSelectionStore } from '@state/selectionStore';
import { activateCommandSurface } from '@context/commands/commandContext';
import { resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { useTimelineNavigation } from '@workspace/panels/timeline/hooks/useTimelineNavigation';

describe('mixed timeline clip deletion', () => {
    let undo: ReturnType<typeof createPatchUndoController> | null = null;

    beforeEach(() => {
        useSelectionStore.getState().clearSelection();
        useTimelineStore.getState().resetTimeline();
        useTimelineStore.getState().clearAllTracks();
        useTimelineStore.setState((state) => ({
            ...state,
            tracks: {
                midi: {
                    id: 'midi',
                    name: 'MIDI',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [{ id: 'midi-clip', type: 'midi', sourceId: 'midi-source', offsetTicks: 0, enabled: true }],
                },
                audio: {
                    id: 'audio',
                    name: 'Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    clips: [
                        { id: 'audio-clip', type: 'audio', sourceId: 'audio-source', offsetTicks: 0, enabled: true },
                    ],
                },
            },
            tracksOrder: ['midi', 'audio'],
            midiCache: {
                'midi-source': {
                    midiData: undefined as any,
                    notesRaw: [
                        {
                            note: 60,
                            channel: 0,
                            startTick: 0,
                            endTick: CANONICAL_PPQ,
                            durationTicks: CANONICAL_PPQ,
                        },
                    ],
                    ccRaw: [],
                    ticksPerQuarter: CANONICAL_PPQ,
                    bounds: {
                        minTick: 0,
                        maxTick: CANONICAL_PPQ,
                        minNote: 60,
                        maxNote: 60,
                        maxDurationTicks: CANONICAL_PPQ,
                    },
                },
            },
            audioCache: {
                'audio-source': { sampleRate: 48_000, channels: 2, durationSeconds: 1, durationSamples: 48_000 },
            },
        }));
        undo = createPatchUndoController(useTimelineStore);
    });

    afterEach(() => {
        cleanup();
        undo?.dispose();
        undo = null;
        useSelectionStore.getState().clearSelection();
        resetGlobalShortcutsForTest();
    });

    it('removes and restores MIDI and audio clips with one undo step', async () => {
        let updates = 0;
        const unsubscribe = useTimelineStore.subscribe(() => updates++);
        try {
            await timelineCommandGateway.dispatchById('timeline.removeClips', {
                midiClips: [{ trackId: 'midi', clipId: 'midi-clip' }],
                audioClips: [{ trackId: 'audio', clipId: 'audio-clip' }],
            });
        } finally {
            unsubscribe();
        }

        expect(updates).toBe(1);
        expect(undo?.debugStack().size).toBe(1);
        expect((useTimelineStore.getState().tracks.midi as any).clips).toEqual([]);
        expect((useTimelineStore.getState().tracks.audio as any).clips).toEqual([]);
        expect(useTimelineStore.getState().midiCache['midi-source']).toBeUndefined();
        expect(useTimelineStore.getState().audioCache['audio-source']).toBeUndefined();

        undo?.undo();
        expect((useTimelineStore.getState().tracks.midi as any).clips.map((clip: any) => clip.id)).toEqual([
            'midi-clip',
        ]);
        expect((useTimelineStore.getState().tracks.audio as any).clips.map((clip: any) => clip.id)).toEqual([
            'audio-clip',
        ]);
        expect(useTimelineStore.getState().midiCache['midi-source']).toBeDefined();
        expect(useTimelineStore.getState().audioCache['audio-source']).toBeDefined();
        expect(undo?.canUndo()).toBe(false);

        undo?.redo();
        expect((useTimelineStore.getState().tracks.midi as any).clips).toEqual([]);
        expect((useTimelineStore.getState().tracks.audio as any).clips).toEqual([]);
    });

    it('selects all mixed clips and undoes keyboard deletion in one step', async () => {
        renderHook(() => useTimelineNavigation());
        useSelectionStore.getState().selectClipTimeline({
            type: 'clips',
            clips: [{ trackId: 'midi', clipId: 'midi-clip', kind: 'midi' }],
        });
        activateCommandSurface('timeline-clips');

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
        });
        expect(useSelectionStore.getState().clipTimelineSelection).toMatchObject({
            type: 'clips',
            clips: [
                { trackId: 'midi', clipId: 'midi-clip', kind: 'midi' },
                { trackId: 'audio', clipId: 'audio-clip', kind: 'audio' },
            ],
        });

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        });
        await waitFor(() => expect(undo?.debugStack().size).toBe(1));
        expect((useTimelineStore.getState().tracks.midi as any).clips).toEqual([]);
        expect((useTimelineStore.getState().tracks.audio as any).clips).toEqual([]);

        undo?.undo();
        expect((useTimelineStore.getState().tracks.midi as any).clips).toHaveLength(1);
        expect((useTimelineStore.getState().tracks.audio as any).clips).toHaveLength(1);
        expect(undo?.canUndo()).toBe(false);
    });
});
