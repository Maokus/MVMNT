import React from 'react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TimelineRuler from '../TimelineRuler';
import { useTimelineStore } from '@state/timelineStore';

// jsdom has no layout or pointer capture; both are needed to exercise the brace drag.
class MockResizeObserver {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
        this.cb(
            [{ contentRect: { width: 800, height: 24 } }] as unknown as ResizeObserverEntry[],
            this as unknown as ResizeObserver
        );
    }
    disconnect() {}
}
// @ts-expect-error jsdom lacks ResizeObserver
global.ResizeObserver = MockResizeObserver;
Element.prototype.setPointerCapture = () => {};

// useTickScale pads the view 0..800 by 1% each side -> dispStart -8, range 816.
const xForTick = (tick: number) => ((tick + 8) / 816) * 800;

// fireEvent.pointerDown does not carry clientX, so dispatch a MouseEvent with a pointerId.
const pointer = (el: Element, type: string, tick: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: xForTick(tick) });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    fireEvent(el, event);
};

describe('playback range brace drag', () => {
    let setPlaybackRange: Mock<(startTick?: number, endTick?: number) => void>;

    beforeEach(() => {
        setPlaybackRange = vi.fn<(startTick?: number, endTick?: number) => void>();
        const state = useTimelineStore.getState();
        useTimelineStore.setState({
            timelineView: { startTick: 0, endTick: 800 },
            playbackRange: { startTick: 100, endTick: 300 },
            playbackRangeUserDefined: true,
            transport: { ...state.transport, quantize: 'off', adaptiveSnap: false },
            setPlaybackRangeExplicitTicks: setPlaybackRange,
        });
    });

    it('flips the range when the start edge is dragged past the end', () => {
        const { container } = render(<TimelineRuler />);
        const ruler = container.firstElementChild as HTMLElement;

        pointer(ruler, 'pointerdown', 100);
        pointer(ruler, 'pointermove', 400);

        // Grabbing the start (100) and dragging to 400 anchors the old end (300):
        // the range becomes [300, 400] instead of collapsing to a 1-tick sliver.
        expect(setPlaybackRange).toHaveBeenLastCalledWith(300, 400);
    });

    it('flips the range when the end edge is dragged past the start', () => {
        const { container } = render(<TimelineRuler />);
        const ruler = container.firstElementChild as HTMLElement;

        pointer(ruler, 'pointerdown', 300);
        pointer(ruler, 'pointermove', 50);

        expect(setPlaybackRange).toHaveBeenLastCalledWith(50, 100);
    });
});
