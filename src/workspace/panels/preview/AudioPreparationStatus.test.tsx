import { afterEach, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AudioPreparationStatus } from './AudioPreparationStatus';
import { useTimelineStore } from '@state/timelineStore';

afterEach(() => useTimelineStore.getState().resetTimeline());

it('shows preparation until referenced audio and analysis are ready', () => {
    useTimelineStore.setState({
        tracks: {
            track: {
                id: 'track',
                type: 'audio',
                name: 'Audio',
                enabled: true,
                mute: false,
                solo: false,
                gain: 1,
                clips: [{ id: 'clip', type: 'audio', sourceId: 'source', offsetTicks: 0 }],
            },
        },
        tracksOrder: ['track'],
        audioCache: {
            source: {
                decodedState: 'deferred',
                durationSeconds: 1,
                durationSamples: 100,
                sampleRate: 100,
                channels: 1,
            },
        },
    });
    render(<AudioPreparationStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing audio…');
    act(() =>
        useTimelineStore.setState((state) => ({
            audioCache: { source: { ...state.audioCache.source, decodedState: 'ready' } },
            audioFeatureCacheStatus: { source: { state: 'pending', updatedAt: 1 } },
        }))
    );
    expect(screen.getByRole('status')).toHaveTextContent('Preparing audio analysis…');
    act(() => useTimelineStore.setState({ audioFeatureCacheStatus: { source: { state: 'ready', updatedAt: 2 } } }));
    expect(screen.queryByRole('status')).toBeNull();
});
