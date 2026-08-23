import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateCommandSurface } from '@context/commands/commandContext';
import { resetGlobalShortcutsForTest } from '@context/shortcuts/shortcutRegistry';
import { useTimelineStore } from '@state/timelineStore';
import { useTimelinePointerControls } from './useTimelinePointerControls';

function Harness() {
    const controls = useTimelinePointerControls();
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

describe('timeline Space gesture', () => {
    it('toggles playback for a tap but not for a Space-drag pan', () => {
        const togglePlay = vi.spyOn(useTimelineStore.getState(), 'togglePlay').mockImplementation(() => undefined);
        render(<Harness />);
        activateCommandSurface('timeline-clips');

        fireEvent.keyDown(window, { key: ' ', code: 'Space' });
        fireEvent.keyUp(window, { key: ' ', code: 'Space' });
        expect(togglePlay).toHaveBeenCalledOnce();

        togglePlay.mockClear();
        const timeline = screen.getByTestId('timeline');
        Object.assign(timeline, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
        fireEvent.keyDown(window, { key: ' ', code: 'Space' });
        const pointerDown = new Event('pointerdown', { bubbles: true });
        Object.defineProperties(pointerDown, {
            button: { value: 0 },
            pointerId: { value: 1 },
            clientX: { value: 100 },
        });
        fireEvent(timeline, pointerDown);
        fireEvent.keyUp(window, { key: ' ', code: 'Space' });
        expect(togglePlay).not.toHaveBeenCalled();
    });
});
