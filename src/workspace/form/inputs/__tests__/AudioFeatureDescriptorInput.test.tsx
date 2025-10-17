import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioFeatureDescriptorInput from '@workspace/form/inputs/AudioFeatureDescriptorInput';
import { useTimelineStore } from '@state/timelineStore';
import type { AudioFeatureCache, AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';

function renderControlled(
    initialValue: AudioFeatureDescriptor[] | null,
    schema: Parameters<typeof AudioFeatureDescriptorInput>[0]['schema'],
    handleChange: ReturnType<typeof vi.fn>,
) {
    const Controlled: React.FC = () => {
        const [currentValue, setCurrentValue] = React.useState<AudioFeatureDescriptor[] | null>(initialValue);
        return (
            <AudioFeatureDescriptorInput
                id="descriptor"
                value={currentValue}
                schema={schema}
                onChange={(payload) => {
                    if (Array.isArray(payload) || payload === null) {
                        setCurrentValue(payload);
                        handleChange(payload);
                    } else if (payload && typeof payload === 'object' && 'value' in payload) {
                        const nextValue = payload.value as AudioFeatureDescriptor[] | null;
                        setCurrentValue(nextValue);
                        handleChange(payload);
                    }
                }}
            />
        );
    };
    render(<Controlled />);
}

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
        channelAliases: channels > 1 ? ['Left', 'Right', 'Center', 'LFE'].slice(0, channels) : ['Mono'],
        analysisProfileId: 'default',
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
                    channelAliases: (() => {
                        const overrideChannels = overrides.channels ?? baseTrack.channels;
                        if (overrides.channelAliases) {
                            return overrides.channelAliases;
                        }
                        if (overrideChannels > 1) {
                            return baseTrack.channelAliases.length >= overrideChannels
                                ? baseTrack.channelAliases.slice(0, overrideChannels)
                                : Array.from({ length: overrideChannels }, (_, index) => `Channel ${index + 1}`);
                        }
                        return baseTrack.channelAliases;
                    })(),
                    analysisProfileId: overrides.analysisProfileId ?? 'default',
                },
            ]),
        ),
    };
    return {
        version: 3,
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
        analysisProfiles: {
            default: {
                id: 'default',
                windowSize: 256,
                hopSize: 128,
                overlap: 2,
                sampleRate: 48000,
            },
        },
        defaultAnalysisProfileId: 'default',
        channelAliases: channels > 1 ? ['Left', 'Right', 'Center', 'LFE'].slice(0, channels) : ['Mono'],
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
    it('adds descriptors when selecting alternate features', () => {
        const handleChange = vi.fn();
        renderControlled(
            [{ featureKey: 'rms', calculatorId: 'mvmnt.rms', channel: null, bandIndex: null }],
            { trackId: 'audioTrack' },
            handleChange,
        );
        handleChange.mockClear();
        const featureSelect = screen.getByLabelText(/Feature descriptor/i) as HTMLSelectElement;
        fireEvent.change(featureSelect, { target: { value: 'waveform' } });
        const payload = handleChange.mock.calls.at(-1)?.[0] as AudioFeatureDescriptor[];
        expect(payload).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ featureKey: 'rms' }),
                expect.objectContaining({ featureKey: 'waveform' }),
            ]),
        );
    });

    it('supports multi-channel selection with alias chips', () => {
        const handleChange = vi.fn();
        renderControlled(
            [{ featureKey: 'waveform', calculatorId: 'calc.waveform', channel: null, bandIndex: null }],
            { trackId: 'audioTrack' },
            handleChange,
        );
        handleChange.mockClear();
        const leftCheckbox = screen.getByLabelText('Left') as HTMLInputElement;
        fireEvent.click(leftCheckbox);
        const rightCheckbox = screen.getByLabelText('Right') as HTMLInputElement;
        fireEvent.click(rightCheckbox);
        const matchedCall = handleChange.mock.calls.find(([arg]) => {
            if (!Array.isArray(arg)) return false;
            const hasLeft = arg.some(
                (descriptor) => descriptor.featureKey === 'waveform' && descriptor.channel === 'Left',
            );
            const hasRight = arg.some(
                (descriptor) => descriptor.featureKey === 'waveform' && descriptor.channel === 'Right',
            );
            return hasLeft && hasRight;
        });
        expect(matchedCall).toBeDefined();
        expect(screen.getByText(/Waveform – Left/i)).toBeInTheDocument();
        expect(screen.getByText(/Waveform – Right/i)).toBeInTheDocument();
    });

    it('emits profile suggestions when cache analysis profile differs', () => {
        const handleChange = vi.fn();
        useTimelineStore.getState().ingestAudioFeatureCache(
            'audioTrack',
            createCache('audioTrack', 1, {
                loudness: { metadata: { label: 'Loudness' }, analysisProfileId: 'wideband' },
            }),
        );
        renderControlled(
            null,
            { trackId: 'audioTrack', profileValue: 'default', profilePropertyKey: 'analysisProfileId' },
            handleChange,
        );
        handleChange.mockClear();
        const featureSelect = screen.getByLabelText(/Feature descriptor/i) as HTMLSelectElement;
        fireEvent.change(featureSelect, { target: { value: 'loudness' } });
        const suggestionCall = handleChange.mock.calls.find(([arg]) => {
            return (
                arg &&
                typeof arg === 'object' &&
                !Array.isArray(arg) &&
                'meta' in arg &&
                (arg as { meta?: { linkedUpdates?: Record<string, string> } }).meta?.linkedUpdates?.analysisProfileId ===
                    'wideband'
            );
        }) as { value: AudioFeatureDescriptor[]; meta?: { linkedUpdates?: Record<string, string> } } | undefined;
        expect(suggestionCall).toBeDefined();
        expect(screen.getAllByText(/analysis profile/i).length).toBeGreaterThan(0);
    });

    it('shows conflict messaging when selected features require different analysis profiles', () => {
        const handleChange = vi.fn();
        const cache = createCache('audioTrack', 1, {
            loudness: { metadata: { label: 'Loudness' }, analysisProfileId: 'wideband' },
        });
        cache.analysisProfiles = {
            ...(cache.analysisProfiles ?? {}),
            wideband: {
                id: 'wideband',
                windowSize: 512,
                hopSize: 256,
                overlap: 2,
                sampleRate: 48000,
            },
        };
        useTimelineStore.getState().ingestAudioFeatureCache('audioTrack', cache);
        renderControlled(
            [
                { featureKey: 'rms', calculatorId: 'mvmnt.rms', channel: null, bandIndex: null },
                { featureKey: 'loudness', calculatorId: 'calc.loudness', channel: null, bandIndex: null },
            ],
            { trackId: 'audioTrack' },
            handleChange,
        );
        expect(
            screen.getByText(/Selected features require different analysis profiles/i),
        ).toBeInTheDocument();
    });
});
