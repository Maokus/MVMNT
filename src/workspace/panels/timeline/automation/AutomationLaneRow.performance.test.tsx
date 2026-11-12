import React, { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationLaneRow from './AutomationLaneRow';
import { createChannel, createKeyframe, elementPropertyTarget } from '@automation/types';
import { useTimelineStore } from '@state/timelineStore';

afterEach(() => {
    cleanup();
    useTimelineStore.getState().resetTimeline();
});
beforeEach(() => useTimelineStore.getState().resetTimeline());

describe('automation lane rendering', () => {
    it('updates playhead highlighting only when its highlighted keyframe changes', () => {
        const channel = createChannel(elementPropertyTarget('text', 'fontSize'), 'number');
        channel.keyframes = [createKeyframe(0, 20), createKeyframe(100, 30)];
        useTimelineStore.getState().setCurrentTick(50, 'user');
        const committed = vi.fn();
        const { container } = render(
            <Profiler id="lane" onRender={committed}>
                <AutomationLaneRow channel={channel} width={600} />
            </Profiler>
        );
        committed.mockClear();
        act(() => useTimelineStore.getState().setCurrentTick(60, 'clock'));
        expect(committed).not.toHaveBeenCalled();
        act(() => useTimelineStore.getState().setCurrentTick(0, 'user'));
        expect(committed).toHaveBeenCalled();
        expect(container.querySelector('circle[fill="#f87171"]')).toBeInTheDocument();
    });

    it('bounds SVG keyframes and segments to the visible horizontal window', () => {
        const channel = createChannel(elementPropertyTarget('text', 'fontSize'), 'number');
        channel.keyframes = Array.from({ length: 10000 }, (_, index) => createKeyframe(index * 10, index));
        useTimelineStore.setState((state) => ({
            timelineView: { ...state.timelineView, startTick: 50000, endTick: 50100 },
        }));
        const { container } = render(<AutomationLaneRow channel={channel} width={600} />);
        expect(container.querySelectorAll('[data-kf]').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('[data-kf]').length).toBeLessThan(20);
        expect(container.querySelectorAll('[data-seg]').length).toBeLessThan(20);
    });
});
