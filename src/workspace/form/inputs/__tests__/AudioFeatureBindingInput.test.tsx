import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioFeatureBindingInput from '@workspace/form/inputs/AudioFeatureBindingInput';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createCache(trackId: string): AudioFeatureCache {
    const frameCount = 4;
    const hopTicks = 120;
    const data = Float32Array.from({ length: frameCount }, (_, idx) => idx / frameCount);
    return {
        version: 1,
        audioSourceId: trackId,
        hopTicks,
        hopSeconds: 0.05,
        frameCount,
        analysisParams: {
            windowSize: 256,
            hopSize: 128,
            overlap: 2,
            sampleRate: 48000,
            calculatorVersions: { 'mvmnt.rms': 1 },
        },
        featureTracks: {
            rms: {
                key: 'rms',
                calculatorId: 'mvmnt.rms',
                version: 1,
                frameCount,
                channels: 1,
                hopTicks,
                hopSeconds: 0.05,
                format: 'float32',
                data,
            },
        },
    };
}

beforeEach(() => {
    useTimelineStore.getState().resetTimeline();
    useTimelineStore.setState((state) => ({
        ...state,
        tracks: {
            audioTrack: {
                id: 'audioTrack',
                name: 'Audio Track',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                offsetTicks: 0,
                gain: 1,
            },
            secondTrack: {
                id: 'secondTrack',
                name: 'Second Track',
                type: 'audio',
                enabled: true,
                mute: false,
                solo: false,
                offsetTicks: 0,
                gain: 1,
            },
        },
        tracksOrder: ['audioTrack', 'secondTrack'],
    }));
    useTimelineStore.getState().ingestAudioFeatureCache('audioTrack', createCache('audioTrack'));
});

describe('AudioFeatureBindingInput', () => {
    it('renders audio track options and selects the current track', () => {
        const handleChange = vi.fn();
        render(
            <AudioFeatureBindingInput
                id="binding"
                value={{
                    type: 'audioFeature',
                    trackId: 'audioTrack',
                    featureKey: 'rms',
                    calculatorId: 'mvmnt.rms',
                    bandIndex: null,
                    channelIndex: null,
                    smoothing: null,
                }}
                schema={{}}
                onChange={handleChange}
            />,
        );

        const select = screen.getByLabelText(/Audio Track/i) as HTMLSelectElement;
        expect(select).toBeInTheDocument();
        expect(select.value).toBe('audioTrack');
        expect(select.options.length).toBe(2);
        const statusNode = screen.getByText(/Status:/i).parentElement;
        expect(statusNode).toHaveTextContent(/ready/i);
    });

    it('invokes onChange when a different track is selected', () => {
        const handleChange = vi.fn();
        render(
            <AudioFeatureBindingInput
                id="binding"
                value={{
                    type: 'audioFeature',
                    trackId: 'audioTrack',
                    featureKey: 'rms',
                    calculatorId: 'mvmnt.rms',
                    bandIndex: null,
                    channelIndex: null,
                    smoothing: null,
                }}
                schema={{}}
                onChange={handleChange}
            />,
        );

        const select = screen.getByLabelText(/Audio Track/i);
        fireEvent.change(select, { target: { value: 'secondTrack' } });
        expect(handleChange).toHaveBeenCalled();
        const payload = handleChange.mock.calls.at(-1)?.[0];
        expect(payload.trackId).toBe('secondTrack');
        expect(payload.type).toBe('audioFeature');
    });
});
