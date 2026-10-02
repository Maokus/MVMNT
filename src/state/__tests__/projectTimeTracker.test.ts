import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProjectTimeSpentSeconds, ProjectTimeTracker } from '../projectTimeTracker';

describe('ProjectTimeTracker', () => {
    afterEach(() => vi.restoreAllMocks());

    it('counts focused time and pauses when the workspace loses focus', () => {
        vi.useFakeTimers();
        vi.spyOn(document, 'hasFocus').mockReturnValue(true);
        const addSeconds = vi.fn();
        const tracker = new ProjectTimeTracker(addSeconds);
        tracker.start();
        vi.advanceTimersByTime(30_000);
        expect(addSeconds).toHaveBeenCalledWith(30);

        vi.spyOn(document, 'hasFocus').mockReturnValue(false);
        window.dispatchEvent(new Event('blur'));
        vi.advanceTimersByTime(30_000);
        const counted = addSeconds.mock.calls.reduce((sum, [seconds]) => sum + seconds, 0);
        expect(counted).toBe(30);

        tracker.stop();
        vi.useRealTimers();
    });

    it('reports elapsed time between persistence updates without writing metadata', () => {
        vi.useFakeTimers();
        vi.spyOn(document, 'hasFocus').mockReturnValue(true);
        const addSeconds = vi.fn();
        const tracker = new ProjectTimeTracker(addSeconds);
        tracker.start();

        vi.advanceTimersByTime(1500);
        expect(getProjectTimeSpentSeconds(120)).toBe(121.5);
        expect(addSeconds).not.toHaveBeenCalled();

        tracker.stop();
        vi.useRealTimers();
    });
});
