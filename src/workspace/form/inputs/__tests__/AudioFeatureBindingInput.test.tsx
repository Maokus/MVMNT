import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioFeatureBindingInput from '@workspace/form/inputs/AudioFeatureBindingInput';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createCache(trackId: string): AudioFeatureCache {
    const frameCount = 8;
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
        },
        tracksOrder: ['audioTrack'],
    }));
    useTimelineStore.getState().ingestAudioFeatureCache('audioTrack', createCache('audioTrack'));
});

describe('AudioFeatureBindingInput', () => {
    it('renders track and feature selectors when feature is configurable', () => {
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
        expect(screen.getByLabelText(/Audio Track/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Feature/i)).toHaveValue('rms');
    });

    it('locks feature selection when a required feature is provided', () => {
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
                schema={{ requiredFeatureKey: 'spectrogram', autoFeatureLabel: 'Spectrogram' }}
                onChange={handleChange}
            />,
        );
        expect(screen.getByLabelText(/Audio Track/i)).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: /Feature/i })).toBeNull();
        expect(screen.getByText('Spectrogram')).toBeInTheDocument();
    });

    it('emits changes when smoothing value updates', () => {
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
        const input = screen.getByLabelText(/Smoothing/);
        fireEvent.change(input, { target: { value: '2' } });
        expect(handleChange).toHaveBeenCalled();
        const lastCall = handleChange.mock.calls.at(-1)?.[0];
        expect(lastCall?.smoothing).toBe(2);
    });
});
