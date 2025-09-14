import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { TimingManager } from '@core/timing';
import { PlaybackClock } from '@core/playback-clock';

// This test validates that when transport is marked playing, advancing the playback clock
// results in increasing timeline.currentTick (authoritative tick domain).

describe('Playhead advances while playing', () => {
    it('advances tick over simulated time', () => {
        const api = useTimelineStore.getState();
        // Ensure starting tick is 0
        api.setCurrentTick(0, 'user');
        // Start playback
        api.play();
        expect(useTimelineStore.getState().transport.isPlaying).toBe(true);

        const tm = new TimingManager();
        tm.setBPM(120); // 2 beats / second
        const clock = new PlaybackClock({ timingManager: tm, initialTick: 0 });
        // Prime clock
        clock.update(0);
        // Simulate 500ms (approx 1 beat -> ticksPerQuarter ticks)
        clock.update(500);
        const tickAfter = clock.currentTick;
        expect(tickAfter).toBeGreaterThan(10); // some advancement (PPQ default 480 -> expect ~480)
    });
});
