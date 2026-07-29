import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import TrackLanes from '../tracks/TrackLanes';
import { useTimelineStore } from '@state/timelineStore';

// Mocks for jsdom environment
class RO {
    observe() {
        /* noop */
    }
    disconnect() {
        /* noop */
    }
}
// @ts-ignore
global.ResizeObserver = RO;
// Canvas stub
// @ts-ignore
HTMLCanvasElement.prototype.getContext = function () {
    return {
        canvas: this,
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fillText: () => {},
        scale: () => {},
        strokeRect: () => {},
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
    } as any;
};

// Minimal mock setup: we assume timeline store is Zustand; we can directly set state.
// This test verifies that the AudioWaveform canvas appears for audio tracks.

describe('AudioWaveform integration in TrackLanes', () => {
    beforeEach(() => {
        // Create a minimal fake AudioBuffer-like object (only properties we might access)
        const fakeAudioBuffer: any = {
            sampleRate: 44100,
            numberOfChannels: 1,
            length: 44100,
            duration: 1,
            getChannelData: () => new Float32Array(44100).fill(0),
        };

        useTimelineStore.setState(
            {
                tracks: {
                    audio1: {
                        id: 'audio1',
                        name: 'Audio Track 1',
                        type: 'audio',
                        clips: [{ id: 'clip1', type: 'audio', sourceId: 'audio1', offsetTicks: 0 }],
                        enabled: true,
                        mute: false,
                        solo: false,
                        gain: 1,
                    },
                    midi1: {
                        id: 'midi1',
                        name: 'MIDI Track 1',
                        type: 'midi',
                        clips: [],
                        enabled: true,
                        mute: false,
                        solo: false,
                    },
                },
                audioCache: {
                    audio1: {
                        waveform: {
                            version: 1,
                            channelPeaks: new Float32Array(
                                Array.from({ length: 128 }, (_, i) => Math.sin(i / 8) * 0.5 + 0.5).map((v) =>
                                    Math.max(0, Math.min(1, v))
                                )
                            ),
                            sampleStep: 1024,
                        },
                        durationSeconds: 1,
                        durationSamples: 44100,
                        audioBuffer: fakeAudioBuffer,
                        sampleRate: 44100,
                        channels: 1,
                    },
                },
                audioFeatureCaches: {},
                audioFeatureCacheStatus: {},
                midiCache: {},
                timeline: { id: 'tl1', name: 'Test', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
                timelineView: { startTick: 0, endTick: 800 },
                transport: {
                    state: 'idle',
                    isPlaying: false,
                    loopEnabled: false,
                    rate: 1,
                    quantize: 'bar',
                    adaptiveSnap: false,
                    arbitrarySnapN: 8,
                    autoKeying: false,
                },
                rowHeight: 60,
            },
            true
        );
    });

    it('renders a canvas for audio track waveform', () => {
        const { container } = render(<TrackLanes trackIds={['audio1']} activeTab="clips" />);
        const canvas = container.querySelector('canvas[data-track="audio1"]');
        expect(canvas).toBeTruthy();
    });

    it('uses subtle type-specific background colors for audio and MIDI lanes', () => {
        const { container } = render(<TrackLanes trackIds={['audio1', 'midi1']} activeTab="clips" />);

        expect(container.getElementsByClassName('bg-emerald-950/20')).toHaveLength(1);
        expect(container.getElementsByClassName('bg-sky-950/15')).toHaveLength(1);
    });
});
