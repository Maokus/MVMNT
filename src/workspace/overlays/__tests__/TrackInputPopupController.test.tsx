import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import type { TrackInputPopupData } from '@context/SceneSelectionContext';
import { TrackInputPopupController } from '../TrackInputPopupController';

const context = vi.hoisted(() => ({
    trackInputPopup: null as TrackInputPopupData | null,
    selectedElementId: 'element',
    dismissTrackInputPopup: vi.fn(),
    updateElementConfig: vi.fn(),
}));
vi.mock('@context/SceneSelectionContext', () => ({ useSceneSelection: () => context }));

const midiInput = { key: 'midiTrackId', label: 'MIDI track', allowedTrackTypes: ['midi'] as ['midi'] };
const audioInput = { key: 'audioTrackId', label: 'Audio track', allowedTrackTypes: ['audio'] as ['audio'] };

function addTracks() {
    useTimelineStore.setState({
        tracks: {
            midiA: { id: 'midiA', type: 'midi', name: 'A', enabled: true, mute: false, solo: false },
            midiB: { id: 'midiB', type: 'midi', name: 'B', enabled: true, mute: false, solo: false },
        },
        tracksOrder: ['midiA', 'midiB'],
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    useSceneStore.getState().clearScene();
    useTimelineStore.getState().resetTimeline();
    useAudioDiagnosticsStore.getState().reset();
    dispatchSceneCommand({ type: 'addElement', elementType: 'notesPlayingDisplay', elementId: 'element' });
    context.selectedElementId = 'element';
    context.trackInputPopup = { elementId: 'element', trackInputs: [midiInput] };
    context.dismissTrackInputPopup.mockImplementation(() => {
        context.trackInputPopup = null;
    });
    context.updateElementConfig.mockImplementation((elementId, patch) => {
        dispatchSceneCommand({ type: 'updateElementConfig', elementId, patch });
    });
});
afterEach(() => {
    cleanup();
    useSceneStore.getState().clearScene();
    useTimelineStore.getState().resetTimeline();
    useAudioDiagnosticsStore.getState().reset();
});

describe('track setup and analysis coordination', () => {
    it('explains missing tracks, updates options after import, and requires a selection', () => {
        render(<TrackInputPopupController />);
        expect(screen.getByText('Import a MIDI file in the timeline to connect this element.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
        expect(screen.getByLabelText('MIDI track')).toBeDisabled();
        act(addTracks);
        expect(screen.getByLabelText('MIDI track')).toHaveValue('');
        fireEvent.change(screen.getByLabelText('MIDI track'), { target: { value: 'midiB' } });
        fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
        expect(context.updateElementConfig).toHaveBeenCalledWith('element', { midiTrackId: 'midiB' });
        expect(useSceneStore.getState().bindings.byElement.element.midiTrackId).toEqual({
            type: 'constant',
            value: 'midiB',
        });
        expect(screen.queryByText('Connect tracks')).not.toBeInTheDocument();
    });

    it('hides analysis until setup is deferred without dismissing diagnostics', () => {
        useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        const view = render(<TrackInputPopupController />);
        expect(screen.queryByText('Audio analysis required')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Later' }));
        view.rerender(<TrackInputPopupController />);
        expect(screen.queryByText('Connect tracks')).not.toBeInTheDocument();
        expect(screen.getByText('Audio analysis required')).toBeInTheDocument();
        expect(useAudioDiagnosticsStore.getState().missingPopupSuppressed).toBe(false);
    });

    it('does not display analysis if its diagnostics clear during setup', () => {
        useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        const view = render(<TrackInputPopupController />);
        act(() => useAudioDiagnosticsStore.setState({ missingPopupVisible: false }));
        fireEvent.click(screen.getByRole('button', { name: 'Later' }));
        view.rerender(<TrackInputPopupController />);
        expect(screen.queryByText('Audio analysis required')).not.toBeInTheDocument();
    });

    it('closes setup after an inspector assignment and preserves that assignment', () => {
        addTracks();
        render(<TrackInputPopupController />);
        act(() => {
            dispatchSceneCommand({
                type: 'updateElementConfig',
                elementId: 'element',
                patch: { midiTrackId: 'midiA' },
            });
        });
        expect(screen.queryByText('Connect tracks')).not.toBeInTheDocument();
        expect(context.dismissTrackInputPopup).toHaveBeenCalled();
        expect(context.updateElementConfig).not.toHaveBeenCalled();
    });

    it('only submits unresolved inputs and allows partial assignment', () => {
        addTracks();
        context.trackInputPopup!.trackInputs = [midiInput, audioInput];
        render(<TrackInputPopupController />);
        fireEvent.change(screen.getByLabelText('MIDI track'), { target: { value: 'midiA' } });
        fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
        expect(context.updateElementConfig).toHaveBeenCalledWith('element', { midiTrackId: 'midiA' });
    });

    it('invalidates a draft when its selected track is removed', () => {
        addTracks();
        render(<TrackInputPopupController />);
        fireEvent.change(screen.getByLabelText('MIDI track'), { target: { value: 'midiA' } });
        act(() => useTimelineStore.setState({ tracks: {}, tracksOrder: [] }));
        expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
        expect(screen.getByLabelText('MIDI track')).toHaveValue('');
    });

    it('resets draft selections when setup switches to another element', () => {
        addTracks();
        dispatchSceneCommand({ type: 'addElement', elementType: 'notesPlayingDisplay', elementId: 'other' });
        const view = render(<TrackInputPopupController />);
        fireEvent.change(screen.getByLabelText('MIDI track'), { target: { value: 'midiA' } });
        context.selectedElementId = 'other';
        context.trackInputPopup = { elementId: 'other', trackInputs: [midiInput] };
        view.rerender(<TrackInputPopupController />);
        expect(screen.getByLabelText('MIDI track')).toHaveValue('');
        expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
    });

    it.each(['deleted', 'deselected'])('closes setup when the element is %s', (reason) => {
        const view = render(<TrackInputPopupController />);
        if (reason === 'deleted')
            act(() => {
                dispatchSceneCommand({ type: 'removeElement', elementId: 'element' });
            });
        else {
            context.selectedElementId = '';
            view.rerender(<TrackInputPopupController />);
        }
        expect(screen.queryByText('Connect tracks')).not.toBeInTheDocument();
        expect(context.dismissTrackInputPopup).toHaveBeenCalled();
    });
});
