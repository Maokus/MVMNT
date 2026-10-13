import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateCommandSurface } from '@context/commands/commandContext';
import { resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { useTimelineStore } from '@state/timelineStore';
import { useTimelinePointerControls } from './useTimelinePointerControls';
import { useTransportBridge } from '@context/visualizer/useTransportBridge';

function Harness() {
    const controls = useTimelinePointerControls();
    useTransportBridge({ visualizer: null, setIsPlaying: vi.fn() });
    return (
        <div
            data-testid="timeline"
            ref={controls.setRightPaneEl}
            onPointerDown={controls.onRightPointerDown}
            onPointerMove={controls.onRightPointerMove}
            onPointerUp={controls.onRightPointerUp}
        />
    );
}

afterEach(() => {
    cleanup();
    resetGlobalShortcutsForTest();
    vi.restoreAllMocks();
});

describe('timeline Space playback', () => {
    it('toggles playback on keydown in both timeline tabs without a drag gesture or repeat', () => {
        const togglePlay = vi.spyOn(useTimelineStore.getState(), 'togglePlay').mockImplementation(() => undefined);
        render(<Harness />);
        activateCommandSurface('timeline-clips');

        fireEvent.keyDown(window, { key: ' ', code: 'Space' });
        expect(togglePlay).toHaveBeenCalledOnce();

        const timeline = screen.getByTestId('timeline');
        const setPointerCapture = vi.fn();
        Object.assign(timeline, { setPointerCapture, releasePointerCapture: vi.fn() });
        const viewBefore = useTimelineStore.getState().timelineView;
        const pointerDown = new Event('pointerdown', { bubbles: true });
        Object.defineProperties(pointerDown, {
            button: { value: 0 },
            pointerId: { value: 1 },
            clientX: { value: 100 },
        });
        fireEvent(timeline, pointerDown);
        const pointerMove = new Event('pointermove', { bubbles: true });
        Object.defineProperties(pointerMove, { pointerId: { value: 1 }, clientX: { value: 150 } });
        fireEvent(timeline, pointerMove);
        expect(setPointerCapture).not.toHaveBeenCalled();
        expect(useTimelineStore.getState().timelineView).toEqual(viewBefore);
        fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
        fireEvent.keyUp(window, { key: ' ', code: 'Space' });
        expect(togglePlay).toHaveBeenCalledOnce();

        activateCommandSurface('timeline-automation');
        fireEvent.keyDown(window, { key: ' ', code: 'Space' });
        expect(togglePlay).toHaveBeenCalledTimes(2);
    });
});
