import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';

describe('Tempo automation store actions', () => {
    beforeEach(() => {
        useTimelineStore.getState().resetTimeline();
    });

    it('enableTempoAutomation seeds keyframe at tick 0 with current globalBpm', () => {
        useTimelineStore.getState().setGlobalBpm(130);
        useTimelineStore.getState().enableTempoAutomation();
        const ta = useTimelineStore.getState().timeline.tempoAutomation;
        expect(ta?.enabled).toBe(true);
        expect(ta?.keyframes).toHaveLength(1);
        expect(ta?.keyframes[0]).toEqual({ tick: 0, bpm: 130 });
    });

    it('enableTempoAutomation sets masterTempoMap', () => {
        useTimelineStore.getState().enableTempoAutomation();
        const map = useTimelineStore.getState().timeline.masterTempoMap;
        expect(map).toBeDefined();
        expect(map!.length).toBeGreaterThanOrEqual(1);
        expect(map![0].bpm).toBe(120); // default bpm
    });

    it('addTempoKeyframe inserts and rebuilds masterTempoMap', () => {
        useTimelineStore.getState().enableTempoAutomation();
        useTimelineStore.getState().addTempoKeyframe(1920, 140);
        useTimelineStore.getState().addTempoKeyframe(3840, 100);

        const ta = useTimelineStore.getState().timeline.tempoAutomation!;
        expect(ta.keyframes).toHaveLength(3); // tick 0 + 2 added
        // Verify sorted
        expect(ta.keyframes[0].tick).toBe(0);
        expect(ta.keyframes[1].tick).toBe(1920);
        expect(ta.keyframes[2].tick).toBe(3840);

        const map = useTimelineStore.getState().timeline.masterTempoMap!;
        expect(map.length).toBeGreaterThanOrEqual(3);
        // Contains expected BPM values
        const bpms = map.map((e) => e.bpm);
        expect(bpms).toContain(120);
        expect(bpms).toContain(140);
        expect(bpms).toContain(100);
        // Times are ascending
        for (let i = 1; i < map.length; i++) {
            expect(map[i].time).toBeGreaterThanOrEqual(map[i - 1].time);
        }
    });

    it('disableTempoAutomation clears map and keyframes', () => {
        useTimelineStore.getState().enableTempoAutomation();
        useTimelineStore.getState().addTempoKeyframe(1920, 140);
        useTimelineStore.getState().disableTempoAutomation();

        const ta = useTimelineStore.getState().timeline.tempoAutomation!;
        expect(ta.enabled).toBe(false);
        expect(ta.keyframes).toHaveLength(0);
        expect(useTimelineStore.getState().timeline.masterTempoMap).toBeUndefined();
    });

    it('removeTempoKeyframe removes and rebuilds map', () => {
        useTimelineStore.getState().enableTempoAutomation();
        useTimelineStore.getState().addTempoKeyframe(1920, 140);
        useTimelineStore.getState().removeTempoKeyframe(1920);

        const ta = useTimelineStore.getState().timeline.tempoAutomation!;
        expect(ta.keyframes).toHaveLength(1); // only tick 0 remains
        expect(ta.keyframes[0].tick).toBe(0);
    });

    it('moveTempoKeyframe repositions and re-sorts', () => {
        useTimelineStore.getState().enableTempoAutomation();
        useTimelineStore.getState().addTempoKeyframe(1920, 140);
        useTimelineStore.getState().addTempoKeyframe(3840, 100);
        useTimelineStore.getState().moveTempoKeyframe(1920, 5760);

        const ta = useTimelineStore.getState().timeline.tempoAutomation!;
        const ticks = ta.keyframes.map((kf) => kf.tick);
        expect(ticks).toEqual([0, 3840, 5760]); // re-sorted
        // Moved keyframe retains BPM
        const moved = ta.keyframes.find((kf) => kf.tick === 5760)!;
        expect(moved.bpm).toBe(140);
    });

    it('updateTempoKeyframeBpm updates BPM without moving', () => {
        useTimelineStore.getState().enableTempoAutomation();
        useTimelineStore.getState().addTempoKeyframe(1920, 140);
        useTimelineStore.getState().updateTempoKeyframeBpm(1920, 160);

        const ta = useTimelineStore.getState().timeline.tempoAutomation!;
        const kf = ta.keyframes.find((k) => k.tick === 1920)!;
        expect(kf.bpm).toBe(160);
    });

    it('batchSetTempoKeyframes replaces all keyframes', () => {
        useTimelineStore.getState().enableTempoAutomation();
        useTimelineStore.getState().addTempoKeyframe(1920, 140);

        useTimelineStore.getState().batchSetTempoKeyframes([
            { tick: 0, bpm: 80 },
            { tick: 960, bpm: 90 },
        ]);

        const ta = useTimelineStore.getState().timeline.tempoAutomation!;
        expect(ta.keyframes).toHaveLength(2);
        expect(ta.keyframes[0]).toEqual({ tick: 0, bpm: 80 });
        expect(ta.keyframes[1]).toEqual({ tick: 960, bpm: 90 });
    });

    it('resetTimeline clears tempoAutomation', () => {
        useTimelineStore.getState().enableTempoAutomation();
        useTimelineStore.getState().addTempoKeyframe(1920, 140);
        useTimelineStore.getState().resetTimeline();

        const ta = useTimelineStore.getState().timeline.tempoAutomation;
        expect(ta?.enabled).toBe(false);
        expect(ta?.keyframes).toEqual([]);
        expect(useTimelineStore.getState().timeline.masterTempoMap).toBeUndefined();
    });
});
