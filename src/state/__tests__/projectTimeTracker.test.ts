import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectTimeTracker } from '../projectTimeTracker';

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
});
