import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useTimelineStore } from '@state/timelineStore';
import TrackEditorRow from '../TrackEditorRow';

afterEach(() => useTimelineStore.getState().resetTimeline());

describe('TrackEditorRow MIDI preview', () => {
    it('toggles the session-only test sound without selecting the track', () => {
        useTimelineStore.setState({
            tracks: { midi1: { id: 'midi1', name: 'MIDI', type: 'midi', enabled: true, mute: false, solo: false } },
            tracksOrder: ['midi1'],
            midiPreviewTrackIds: {},
            rowHeight: 64,
        } as any);
        const { getByRole } = render(<TrackEditorRow trackId="midi1" />);
        const button = getByRole('button', { name: 'Enable MIDI test sound' });

        fireEvent.click(button);

        expect(useTimelineStore.getState().midiPreviewTrackIds).toEqual({ midi1: true });
        expect(getByRole('button', { name: 'Disable MIDI test sound' })).toBeTruthy();
    });
});
