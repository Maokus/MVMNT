import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import { DocumentGateway } from '@persistence/document-gateway';

describe('Tempo & meter restoration', () => {
    it('does not overwrite restored timeline tempo with stale sceneSettings', () => {
        const api: any = useTimelineStore.getState();
        api.setGlobalBpm(200);
        api.setBeatsPerBar(9);
        const doc = DocumentGateway.build({ includeEphemeral: false });
        // Simulate stale scene settings inside document
        (doc as any).scene.sceneSettings = { tempo: 120, beatsPerBar: 4 };
        DocumentGateway.apply(doc as any);
        const tl = useTimelineStore.getState().timeline;
        expect(tl.globalBpm).toBe(200);
        expect(tl.beatsPerBar).toBe(9);
    });
});
