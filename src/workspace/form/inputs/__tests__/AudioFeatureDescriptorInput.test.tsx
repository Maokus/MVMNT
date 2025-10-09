import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioFeatureDescriptorInput from '@workspace/form/inputs/AudioFeatureDescriptorInput';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache } from '@audio/features/audioFeatureTypes';

function createCache(trackId: string, channels = 1, extraFeatures: Record<string, Partial<AudioFeatureCache['featureTracks'][string]>> = {}): AudioFeatureCache {
    const frameCount = 4;
    const hopTicks = 120;
    const hopSeconds = hopTicks / 1920;
    const baseTrack = {
        key: 'rms',
        calculatorId: 'mvmnt.rms',
        version: 1,
        frameCount,
        channels,
        hopTicks,
        hopSeconds,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
        format: 'float32' as const,
        data: Float32Array.from({ length: frameCount * channels }, (_, idx) => idx / frameCount),
        metadata: { label: 'RMS' },
    };
    const featureTracks: AudioFeatureCache['featureTracks'] = {
        rms: baseTrack,
        ...Object.fromEntries(
            Object.entries(extraFeatures).map(([key, overrides]) => [
                key,
                {
                    ...baseTrack,
                    key,
                    calculatorId: overrides.calculatorId ?? `calc.${key}`,
                    channels: overrides.channels ?? baseTrack.channels,
                    format: overrides.format ?? baseTrack.format,
                    metadata: { label: overrides.metadata?.label ?? key },
                },
            ]),
        ),
    };
    return {
        version: 2,
        audioSourceId: trackId,
        hopSeconds,
        hopTicks,
        startTimeSeconds: 0,
        tempoProjection: { hopTicks, startTick: 0 },
        frameCount,
        analysisParams: {
            windowSize: 256,
            hopSize: 128,
            overlap: 2,
            sampleRate: 48000,
            calculatorVersions: { 'mvmnt.rms': 1 },
        },
        featureTracks,
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
    useTimelineStore.getState().ingestAudioFeatureCache(
        'audioTrack',
        createCache('audioTrack', 2, {
            waveform: { channels: 2, metadata: { label: 'Waveform' } },
        }),
    );
});

describe('AudioFeatureDescriptorInput', () => {
    it('renders smoothing control and status for the current descriptor', () => {
        const handleChange = vi.fn();
        render(
            <AudioFeatureDescriptorInput
                id="descriptor"
                value={{ featureKey: 'rms', smoothing: 4, calculatorId: 'mvmnt.rms', channelIndex: null, bandIndex: null }}
                schema={{ trackId: 'audioTrack', requiredFeatureKey: 'rms' }}
                onChange={handleChange}
            />,
        );
        const slider = screen.getByRole('slider') as HTMLInputElement;
        expect(slider.value).toBe('4');
        const statusNode = screen.getByText(/Status:/i);
        expect(statusNode.textContent).toMatch(/ready/i);
    });

    it('invokes onChange when smoothing value changes', () => {
        const handleChange = vi.fn();
        render(
            <AudioFeatureDescriptorInput
                id="descriptor"
                value={{ featureKey: 'rms', smoothing: 2, calculatorId: 'mvmnt.rms', channelIndex: null, bandIndex: null }}
                schema={{ trackId: 'audioTrack' }}
                onChange={handleChange}
            />,
        );
        const slider = screen.getByRole('slider');
        fireEvent.change(slider, { target: { value: '6' } });
        const payload = handleChange.mock.calls.at(-1)?.[0];
        expect(payload).toMatchObject({ featureKey: 'rms', smoothing: 6 });
    });

    it('allows selecting alternate features when available', () => {
        const handleChange = vi.fn();
        render(
            <AudioFeatureDescriptorInput
                id="descriptor"
                value={{ featureKey: 'rms', smoothing: 0, calculatorId: 'mvmnt.rms', channelIndex: null, bandIndex: null }}
                schema={{ trackId: 'audioTrack' }}
                onChange={handleChange}
            />,
        );
        const featureSelect = screen.getByLabelText(/Feature/i) as HTMLSelectElement;
        fireEvent.change(featureSelect, { target: { value: 'waveform' } });
        const payload = handleChange.mock.calls.at(-1)?.[0];
        expect(payload.featureKey).toBe('waveform');
        expect(payload.calculatorId).toBeDefined();
    });

    it('exposes channel selector when feature has multiple channels', () => {
        const handleChange = vi.fn();
        render(
            <AudioFeatureDescriptorInput
                id="descriptor"
                value={{ featureKey: 'waveform', smoothing: 0, calculatorId: 'calc.waveform', channelIndex: null, bandIndex: null }}
                schema={{ trackId: 'audioTrack' }}
                onChange={handleChange}
            />,
        );
        const channelSelect = screen.getByLabelText(/Channel/i) as HTMLSelectElement;
        expect(channelSelect.options.length).toBeGreaterThan(1);
        fireEvent.change(channelSelect, { target: { value: '1' } });
        const payload = handleChange.mock.calls.at(-1)?.[0];
        expect(payload.channelIndex).toBe(1);
    });
});
