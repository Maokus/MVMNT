import { describe, it, expect } from 'vitest';
import { HybridSceneBuilder } from '@core/scene-builder';
import { useTimelineStore } from '@state/timelineStore';

describe('SceneBuilder purity (no store writes)', () => {
    it('updateSceneSettings does not mutate timeline store tempo/meter', () => {
        const apiBefore = useTimelineStore.getState();
        const bpmBefore = apiBefore.timeline.globalBpm;
        const meterBefore = apiBefore.timeline.beatsPerBar;
        const sb = new HybridSceneBuilder();
        sb.updateSceneSettings({ tempo: bpmBefore + 20, beatsPerBar: meterBefore + 1 });
        const apiAfter = useTimelineStore.getState();
        // Store should remain unchanged
        expect(apiAfter.timeline.globalBpm).toBe(bpmBefore);
        expect(apiAfter.timeline.beatsPerBar).toBe(meterBefore);
    });
});
