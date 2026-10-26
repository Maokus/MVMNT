import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
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
                    notesRaw: [{ note: 60, channel: 0, startTick: 0, endTick: 240, durationTicks: 240, velocity: 100 }],
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
            <TrackRowBlock trackId="midi1" trackIndex={0} laneWidth={1000} laneHeight={60} onHoverSnapX={() => {}} />
        );

        expect(container.querySelectorAll('[data-clip="1"]')).toHaveLength(2);
    });

    it('selects a clicked MIDI clip without selecting the track', () => {
        const { container } = render(
            <TrackRowBlock trackId="midi1" trackIndex={0} laneWidth={1000} laneHeight={60} onHoverSnapX={() => {}} />
        );

        const firstClip = container.querySelector('[data-clip="1"]');
        expect(firstClip).toBeTruthy();
        fireEvent.pointerDown(firstClip as Element, { button: 0, clientX: 20 });

        expect(useSelectionStore.getState().activeTarget).toBe('clipTimeline');
        expect(useSelectionStore.getState().clipTimelineSelection).toEqual({
            type: 'clips',
            clips: [{ trackId: 'midi1', clipId: 'clip-a' }],
        });
        expect(useSelectionStore.getState().selectedTrackIds).toEqual([]);
    });

    it('prevents native browser drag behaviour on MIDI clips', () => {
        const { container } = render(
            <TrackRowBlock trackId="midi1" trackIndex={0} laneWidth={1000} laneHeight={60} onHoverSnapX={() => {}} />
        );

        const firstClip = container.querySelector('[data-clip="1"]');
        expect(firstClip).toBeTruthy();

        const pointerDown = new MouseEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 20,
        });
        act(() => {
            firstClip?.dispatchEvent(pointerDown);
        });
        expect(pointerDown.defaultPrevented).toBe(true);

        const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
        act(() => {
            firstClip?.dispatchEvent(dragStart);
        });
        expect(dragStart.defaultPrevented).toBe(true);
        expect((firstClip as HTMLElement).draggable).toBe(false);
    });

    it('builds live move previews for every selected clip on same-track drag', () => {
        const { container } = render(
            <TrackRowBlock trackId="midi1" trackIndex={0} laneWidth={1000} laneHeight={60} onHoverSnapX={() => {}} />
        );

        const clips = container.querySelectorAll('[data-clip="1"]');
        const firstClip = clips[0] as Element;
        const secondClip = clips[1] as Element;

        // Select clip-a, shift-select clip-b, then grab clip-a for a horizontal drag.
        // Native mouse events: this jsdom lacks PointerEvent init support, so
        // fireEvent would drop the clientX/clientY/shiftKey the drag needs.
        const dispatch = (target: Element, type: string, init: MouseEventInit) => {
            act(() => {
                target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
            });
        };
        dispatch(firstClip, 'pointerdown', { button: 0, clientX: 20, clientY: 30 });
        dispatch(secondClip, 'pointerdown', { button: 0, shiftKey: true, clientX: 620, clientY: 30 });
        dispatch(firstClip, 'pointerdown', { button: 0, clientX: 20, clientY: 30 });
        // +100px on a 1000px lane over a 1600-tick view = +160 ticks, no vertical movement.
        dispatch(firstClip, 'pointermove', { clientX: 120, clientY: 30 });

        const drag = useTimelineStore.getState()._crossTrackDrag;
        expect(drag?.previews).toHaveLength(2);
        expect(drag?.previews.map((p) => p.previewOffsetTicks).sort((a, b) => a - b)).toEqual([160, 1120]);
    });
});
