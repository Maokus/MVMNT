import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AutomationChannel } from '@automation/types';
import { useTimelineStore } from '@state/timelineStore';
import { CurveHeightProvider } from '../context/curveHeightContext';
import { CurveRangeProvider } from '../context/curveRangeContext';
import { TempoRangeProvider, fitTempoRange, useTempoRange } from '../context/tempoRangeContext';
import AutomationCurvePane from './AutomationCurvePane';
import TempoAutomationLane from './TempoAutomationLane';
import TempoLaneHeader from './TempoLaneHeader';
import { isValueRangeWheel } from './valueRangeWheel';

const originalTimeline = useTimelineStore.getState().timeline;

afterEach(() => {
    act(() => useTimelineStore.setState({ timeline: originalTimeline }));
});

function RangeReadout() {
    const { autoRange, range } = useTempoRange();
    return <output data-testid="range">{`${autoRange}:${range.min}:${range.max}`}</output>;
}

describe('tempo range controls', () => {
    it('fits the full valid BPM range with padding', () => {
        expect(
            fitTempoRange([
                { tick: 0, bpm: 1 },
                { tick: 960, bpm: 999 },
            ])
        ).toEqual({ min: -199, max: 1199 });
        expect(fitTempoRange([{ tick: 0, bpm: 120 }])).toEqual({ min: 110, max: 130 });
    });

    it('pans on vertical wheel, holds the manual range, and returns to auto fit', () => {
        act(() =>
            useTimelineStore.setState({
                timeline: {
                    ...originalTimeline,
                    tempoAutomation: { enabled: true, keyframes: [{ tick: 0, bpm: 120 }] },
                },
            })
        );
        render(
            <TempoRangeProvider>
                <div data-testid="parent">
                    <TempoLaneHeader />
                    <TempoAutomationLane width={500} height={120} />
                </div>
                <RangeReadout />
            </TempoRangeProvider>
        );
        expect(screen.getByTestId('range').textContent).toBe('true:110:130');
        const chart = screen.getByLabelText('Tempo BPM chart');
        const parent = screen.getByTestId('parent');
        const parentWheel = vi.fn();
        parent.addEventListener('wheel', parentWheel);

        fireEvent.wheel(chart, { deltaY: 100 });
        expect(screen.getByTestId('range').textContent).toBe('false:116:136');
        expect(screen.getByLabelText('Minimum visible BPM')).toHaveProperty('value', '116.0');
        expect(screen.getByLabelText('Auto fit BPM range')).toHaveAttribute('aria-pressed', 'false');
        expect(parentWheel).not.toHaveBeenCalled();
        expect(useTimelineStore.getState().timeline.tempoAutomation?.keyframes).toEqual([{ tick: 0, bpm: 120 }]);

        act(() =>
            useTimelineStore.setState((state) => ({
                timeline: {
                    ...state.timeline,
                    tempoAutomation: {
                        enabled: true,
                        keyframes: [
                            { tick: 0, bpm: 120 },
                            { tick: 960, bpm: 240 },
                        ],
                    },
                },
            }))
        );
        expect(screen.getByTestId('range').textContent).toBe('false:116:136');

        fireEvent.click(screen.getByLabelText('Auto fit BPM range'));
        expect(screen.getByTestId('range').textContent).toBe('true:96:264');
        expect(screen.getByLabelText('Maximum visible BPM')).toHaveProperty('value', '264.0');

        act(() =>
            useTimelineStore.setState((state) => ({
                timeline: {
                    ...state.timeline,
                    tempoAutomation: {
                        enabled: true,
                        keyframes: [
                            { tick: 0, bpm: 120 },
                            { tick: 960, bpm: 300 },
                        ],
                    },
                },
            }))
        );
        expect(screen.getByTestId('range').textContent).toBe('true:84:336');

        fireEvent.wheel(chart, { deltaX: 40, deltaY: 1 });
        fireEvent.wheel(chart, { ctrlKey: true, deltaY: 40 });
        expect(parentWheel).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('range').textContent).toBe('true:84:336');
    });

    it('allows valid manual bounds and rejects a range narrower than 20 BPM', () => {
        act(() =>
            useTimelineStore.setState({
                timeline: {
                    ...originalTimeline,
                    tempoAutomation: { enabled: true, keyframes: [{ tick: 0, bpm: 120 }] },
                },
            })
        );
        render(
            <TempoRangeProvider>
                <TempoLaneHeader />
                <RangeReadout />
            </TempoRangeProvider>
        );
        fireEvent.click(screen.getByLabelText('Auto fit BPM range'));
        const minInput = screen.getByLabelText('Minimum visible BPM');
        fireEvent.change(minInput, { target: { value: '100' } });
        fireEvent.blur(minInput);
        expect(screen.getByTestId('range').textContent).toBe('false:100:130');
        fireEvent.change(minInput, { target: { value: '120' } });
        fireEvent.blur(minInput);
        expect(screen.getByTestId('range').textContent).toBe('false:100:130');
        expect(minInput).toHaveProperty('value', '100.0');
    });
});

describe('tempo keyframe selection', () => {
    it('selects a point on the first click without changing its tempo', () => {
        const keyframes = [
            { tick: 0, bpm: 120 },
            { tick: 960, bpm: 160 },
        ];
        act(() =>
            useTimelineStore.setState({
                timeline: { ...originalTimeline, tempoAutomation: { enabled: true, keyframes } },
            })
        );
        const { container } = render(
            <TempoRangeProvider>
                <TempoAutomationLane width={500} height={120} />
            </TempoRangeProvider>
        );
        const chart = screen.getByLabelText('Tempo BPM chart');
        Object.assign(chart, { setPointerCapture: vi.fn() });
        const point = container.querySelector('[data-tempo-keyframe-tick="960"]');
        expect(point).not.toBeNull();

        const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
        Object.defineProperties(pointerDown, {
            button: { value: 0 },
            pointerId: { value: 1 },
            clientX: { value: 100 },
            clientY: { value: 50 },
        });
        fireEvent(point!, pointerDown);
        expect(screen.getByLabelText('Tempo point BPM')).toHaveProperty('value', '160');
        fireEvent.pointerUp(window, { pointerId: 1 });
        fireEvent.click(point!);

        expect(screen.getByLabelText('Tempo point tick')).toHaveProperty('value', '960');
        expect(useTimelineStore.getState().timeline.tempoAutomation?.keyframes).toEqual(keyframes);
    });
});

describe('curve wheel routing', () => {
    it('reserves only vertical unmodified wheel input for value panning', () => {
        expect(isValueRangeWheel({ deltaX: 0, deltaY: 20, ctrlKey: false, metaKey: false })).toBe(true);
        expect(isValueRangeWheel({ deltaX: 20, deltaY: 1, ctrlKey: false, metaKey: false })).toBe(false);
        expect(isValueRangeWheel({ deltaX: 0, deltaY: 20, ctrlKey: true, metaKey: false })).toBe(false);
        expect(isValueRangeWheel({ deltaX: 0, deltaY: 20, ctrlKey: false, metaKey: true })).toBe(false);
    });

    it('lets horizontal pan and Ctrl/Cmd zoom leave the property curve', () => {
        const channel: AutomationChannel = {
            id: 'test-range',
            target: { owner: { kind: 'node', id: 'test-node' }, propertyPath: 'opacity' },
            valueType: 'number',
            keyframes: [{ tick: 0, value: 0.5, segmentInterpolation: { mode: 'constant', direction: 'auto' } }],
        };
        const { container } = render(
            <div data-testid="parent">
                <CurveHeightProvider>
                    <CurveRangeProvider>
                        <AutomationCurvePane channel={channel} width={500} />
                    </CurveRangeProvider>
                </CurveHeightProvider>
            </div>
        );
        const curve = container.querySelector('.ae-curve-pane');
        expect(curve).not.toBeNull();
        const parentWheel = vi.fn();
        screen.getByTestId('parent').addEventListener('wheel', parentWheel);

        fireEvent.wheel(curve!, { deltaY: 100 });
        expect(parentWheel).not.toHaveBeenCalled();
        fireEvent.wheel(curve!, { deltaX: 50, deltaY: 1 });
        fireEvent.wheel(curve!, { metaKey: true, deltaY: 50 });
        expect(parentWheel).toHaveBeenCalledTimes(2);
    });
});
