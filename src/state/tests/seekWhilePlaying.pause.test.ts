import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';

/** Ensures seeking while playing pauses the transport. */

describe('seek while playing pauses', () => {
    it('seekTick pauses transport when playing', () => {
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        api.play();
        
        const beforeSeek = useTimelineStore.getState();
        expect(beforeSeek.transport.isPlaying).toBe(true);
        
        // Seek to a different position
        api.seekTick(1000);
        
        const afterSeek = useTimelineStore.getState();
        expect(afterSeek.transport.isPlaying).toBe(false);
        expect(afterSeek.timeline.currentTick).toBe(1000);
    });

    it('seekTick when already paused stays paused', () => {
        const api = useTimelineStore.getState();
        api.setCurrentTick(0, 'user');
        api.pause();
        
        const beforeSeek = useTimelineStore.getState();
        expect(beforeSeek.transport.isPlaying).toBe(false);
        
        // Seek to a different position
        api.seekTick(1000);
        
        const afterSeek = useTimelineStore.getState();
        expect(afterSeek.transport.isPlaying).toBe(false);
        expect(afterSeek.timeline.currentTick).toBe(1000);
    });
});
