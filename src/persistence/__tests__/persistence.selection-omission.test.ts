import { describe, it, expect, beforeEach } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { exportScene } from '@persistence/export';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';

describe('Persistence - selection omission & undo triggers', () => {
    beforeEach(() => {
        // Reset store to initial state
        useTimelineStore.setState((s: any) => ({
            ...s,
            tracks: {},
            tracksOrder: [],
        }));
        useSelectionStore.getState().clearSelection();
    });

    it('exported scene does not contain selection field', async () => {
        // Add a track (selection may change during usage but we ignore it)
        await useTimelineStore.getState().addMidiTrack({ name: 'Track 1' });
        const result = await exportScene();
        if (!result.ok) throw new Error('export failed or disabled');
        const json = JSON.stringify(result.envelope);
        expect(json.includes('selection')).toBe(false);
    });

    it('exports omit transient selection state', async () => {
        const store = useTimelineStore.getState();
        const trackId = await store.addMidiTrack({ name: 'Selection Test' });
        useSelectionStore.getState().selectTracks([trackId]);
        const result = await exportScene();
        if (!result.ok) throw new Error('export failed or disabled');
        expect(JSON.stringify(result.envelope).includes('selectedTrackIds')).toBe(false);
    });
});
