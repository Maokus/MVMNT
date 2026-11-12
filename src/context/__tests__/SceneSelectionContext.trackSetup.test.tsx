import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneSelectionProvider, useSceneSelection } from '../SceneSelectionContext';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';

vi.mock('../VisualizerContext', () => ({ useVisualizer: () => ({ visualizer: null }) }));

beforeEach(() => {
    useSceneStore.getState().clearScene();
    useTimelineStore.getState().resetTimeline();
    useSelectionStore.getState().clearSelection();
});
afterEach(() => {
    cleanup();
    useSceneStore.getState().clearScene();
    useTimelineStore.getState().resetTimeline();
    useSelectionStore.getState().clearSelection();
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SceneSelectionProvider>{children}</SceneSelectionProvider>
);

function setTracks(type: 'midi' | 'audio', ids: string[]) {
    useTimelineStore.setState({
        tracks: Object.fromEntries(
            ids.map((id) => [
                id,
                {
                    id,
                    name: id,
                    enabled: true,
                    mute: false,
                    solo: false,
                    ...(type === 'audio' ? { type: 'audio' as const, clips: [], gain: 1 } : { type: 'midi' as const }),
                },
            ])
        ),
        tracksOrder: ids,
    });
}

describe('element creation track setup', () => {
    it.each([
        ['midi', 'notesPlayingDisplay', 'midiTrackId'],
        ['audio', 'audioSpectrum', 'audioTrackId'],
    ] as const)('silently connects the sole %s track', (type, elementType, key) => {
        setTracks(type, ['only']);
        const { result } = renderHook(useSceneSelection, { wrapper });
        act(() => result.current.addElement(elementType));
        expect(result.current.trackInputPopup).toBeNull();
        expect(result.current.selectedElement?.bindings[key]).toEqual({ type: 'constant', value: 'only' });
    });

    it('asks for a track when several compatible tracks exist', () => {
        setTracks('midi', ['a', 'b']);
        const { result } = renderHook(useSceneSelection, { wrapper });
        act(() => result.current.addElement('notesPlayingDisplay'));
        expect(result.current.trackInputPopup?.trackInputs.map((input) => input.key)).toEqual(['midiTrackId']);
    });

    it('preserves explicit assignments without prompting', () => {
        setTracks('midi', ['a', 'b']);
        const { result } = renderHook(useSceneSelection, { wrapper });
        act(() => result.current.addElement('notesPlayingDisplay', { midiTrackId: 'b' }));
        expect(result.current.trackInputPopup).toBeNull();
        expect(result.current.selectedElement?.bindings.midiTrackId).toEqual({ type: 'constant', value: 'b' });
    });

    it('offers setup with no compatible tracks and clears it when adding an unrelated element', () => {
        setTracks('audio', ['audio']);
        const { result } = renderHook(useSceneSelection, { wrapper });
        act(() => result.current.addElement('notesPlayingDisplay'));
        expect(result.current.trackInputPopup?.trackInputs.map((input) => input.key)).toEqual(['midiTrackId']);
        act(() => result.current.addElement('textOverlay'));
        expect(result.current.trackInputPopup).toBeNull();
    });
});
