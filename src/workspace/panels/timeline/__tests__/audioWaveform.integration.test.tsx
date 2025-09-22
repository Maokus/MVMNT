import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import TrackLanes from '../TrackLanes';
import { useTimelineStore } from '@state/timelineStore';

// Mocks for jsdom environment
class RO {
    observe() { /* noop */ }
    disconnect() { /* noop */ }
}
// @ts-ignore
global.ResizeObserver = RO;
// Canvas stub
// @ts-ignore
HTMLCanvasElement.prototype.getContext = function () {
    return {
        canvas: this,
        clearRect: () => { },
        fillRect: () => { },
        beginPath: () => { },
        moveTo: () => { },
        lineTo: () => { },
        stroke: () => { },
        fillText: () => { },
        scale: () => { },
        strokeRect: () => { },
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

        useTimelineStore.setState({
            tracks: {
                'audio1': {
                    id: 'audio1',
                    name: 'Audio Track 1',
                    type: 'audio',
                    offsetTicks: 0,
                    enabled: true,
                    mute: false,
                    solo: false,
                    gain: 1,
                    regionStartTick: 0,
                    regionEndTick: 400,
                }
            },
            audioCache: {
                'audio1': {
                    peakData: new Float32Array(Array.from({ length: 128 }, (_, i) => Math.sin(i / 8) * 0.5 + 0.5).map(v => Math.max(0, Math.min(1, v)))),
                    durationTicks: 400,
                    audioBuffer: fakeAudioBuffer,
                    sampleRate: 44100,
                    channels: 1,
                }
            },
            midiCache: {},
            selection: { selectedTrackIds: [] },
            timeline: { id: 'tl1', name: 'Test', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
            timelineView: { startTick: 0, endTick: 800 },
            transport: { state: 'idle', isPlaying: false, loopEnabled: false, rate: 1, quantize: 'bar' },
            rowHeight: 60,
        }, true);
    });

    it('renders a canvas for audio track waveform', () => {
        const { container } = render(<TrackLanes trackIds={['audio1']} />);
        const canvas = container.querySelector('canvas[data-track="audio1"]');
        expect(canvas).toBeTruthy();
    });
});
