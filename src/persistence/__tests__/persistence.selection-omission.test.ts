import { describe, it, expect, beforeEach } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { exportScene } from '@persistence/export';
import { useTimelineStore } from '@state/timelineStore';
import type { ExportSceneResult, ExportSceneResultInline } from '@persistence/export';

function requireInline(result: ExportSceneResult): ExportSceneResultInline {
    if (!result.ok || result.mode !== 'inline-json') {
        throw new Error('Expected inline-json export result');
    }
    return result;
}

describe('Persistence - selection omission & undo triggers', () => {
    beforeEach(() => {
        // Reset store to initial state
        useTimelineStore.setState((s: any) => ({
            ...s,
            tracks: {},
            tracksOrder: [],
            selection: { selectedTrackIds: [] },
        }));
    });

    it('exported scene does not contain selection field', async () => {
        // Add a track (selection may change during usage but we ignore it)
        await useTimelineStore.getState().addMidiTrack({ name: 'Track 1' });
        const result = requireInline(await exportScene());
        if (!result.ok) throw new Error('export failed or disabled');
        const json = result.json;
        expect(json.includes('selection')).toBe(false);
    });

    it('exports omit transient selection state', async () => {
        const store = useTimelineStore.getState();
        const trackId = await store.addMidiTrack({ name: 'Selection Test' });
        store.selectTracks([trackId]);
        const result = requireInline(await exportScene());
        if (!result.ok) throw new Error('export failed or disabled');
        expect(result.json.includes('selectedTrackIds')).toBe(false);
    });
});
