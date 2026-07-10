import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useSelectionStore } from '@state/selectionStore';
import { useTimelineStore } from '@state/timelineStore';
import TrackRowBlock from '../TrackRowBlock';

class ResizeObserverStub {
    observe() {}
    disconnect() {}
}

describe('TrackRowBlock MIDI clips', () => {
    beforeEach(() => {
        (globalThis as any).ResizeObserver = ResizeObserverStub;
        (HTMLElement.prototype as any).setPointerCapture = () => {};
        (HTMLElement.prototype as any).releasePointerCapture = () => {};
        (HTMLCanvasElement.prototype as any).getContext = () => ({
            save: () => {},
            restore: () => {},
            scale: () => {},
            clearRect: () => {},
            fillRect: () => {},
            setLineDash: () => {},
            strokeRect: () => {},
            beginPath: () => {},
            rect: () => {},
            roundRect: () => {},
            fill: () => {},
            stroke: () => {},
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
        });
        useSelectionStore.getState().clearSelection();
        useTimelineStore.setState({
            tracks: {
                midi1: {
                    id: 'midi1',
                    name: 'MIDI 1',
                    type: 'midi',
                    enabled: true,
                    mute: false,
                    solo: false,
                    clips: [
                        { id: 'clip-a', type: 'midi', sourceId: 'src-a', offsetTicks: 0 },
                        { id: 'clip-b', type: 'midi', sourceId: 'src-a', offsetTicks: 960 },
                    ],
                },
            },
            tracksOrder: ['midi1'],
            midiCache: {
                'src-a': {
                    midiData: {} as any,
                    ticksPerQuarter: 960,
                    notesRaw: [
                        { note: 60, channel: 0, startTick: 0, endTick: 240, durationTicks: 240, velocity: 100 },
                    ],
                    ccRaw: [],
                    bounds: { minTick: 0, maxTick: 240, minNote: 60, maxNote: 60, maxDurationTicks: 240 },
                },
            },
            timelineView: { startTick: 0, endTick: 1600 },
            timeline: { id: 'tl', name: 'Timeline', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
            transport: {
                state: 'idle',
                isPlaying: false,
                loopEnabled: false,
                rate: 1,
                quantize: 'off',
                adaptiveSnap: false,
                arbitrarySnapN: 8,
                autoKeying: false,
            },
            rowHeight: 60,
        } as any);
    });

    it('renders one MIDI block per visible clip', () => {
        const { container } = render(
            <TrackRowBlock trackId="midi1" laneWidth={1000} laneHeight={60} onHoverSnapX={() => {}} />
        );

        expect(container.querySelectorAll('[data-clip="1"]')).toHaveLength(2);
    });

    it('selects a clicked MIDI clip without selecting the track', () => {
        const { container } = render(
            <TrackRowBlock trackId="midi1" laneWidth={1000} laneHeight={60} onHoverSnapX={() => {}} />
        );

        const firstClip = container.querySelector('[data-clip="1"]');
        expect(firstClip).toBeTruthy();
        fireEvent.pointerDown(firstClip as Element, { button: 0, clientX: 20 });

        expect(useSelectionStore.getState().activeTarget).toBe('timelineClips');
        expect(useSelectionStore.getState().selectedTimelineClips).toEqual([{ trackId: 'midi1', clipId: 'clip-a' }]);
        expect(useSelectionStore.getState().selectedTrackIds).toEqual([]);
    });
});
