import { describe, expect, it, vi } from 'vitest';
import type { TimelineState } from '@state/timelineStore';
import { createPluginHostServices, PLUGIN_CAPABILITIES } from '../host-api/plugin-api';

const state = {
    timeline: { id: 'timeline', name: 'Timeline', currentTick: 0, globalBpm: 120, beatsPerBar: 4 },
    tracks: {},
    tracksOrder: [],
    audioCache: {},
    timelineView: { startTick: 0, endTick: 1920 },
} as unknown as TimelineState;

describe('plugin host services', () => {
    it('constructs the private services used by SDK 2 callback contexts', () => {
        const selectNotesInWindow = vi.fn(() => []);
        const { services, missingCapabilities } = createPluginHostServices({
            timelineStore: { getState: () => state },
            selectNotesInWindow,
            selectTrackById: () => undefined,
            selectTracksByIds: () => [],
            selectMidiTracks: () => [],
            getFeatureData: () => null,
            getFeatureDataRange: () => [],
        });

        expect(missingCapabilities).toEqual([]);
        expect(services.capabilities).toContain(PLUGIN_CAPABILITIES.timelineRead);
        expect(services.capabilities).toContain(PLUGIN_CAPABILITIES.audioFeaturesRead);
        expect(services.timeline.getStateSnapshot()).toBe(state);
        services.timeline.selectNotesInWindow({ trackIds: [], startSec: 0, endSec: 1 });
        expect(selectNotesInWindow).toHaveBeenCalledWith(state, { trackIds: [], startSec: 0, endSec: 1 });
        expect(services.timing.beatsToTicks(2)).toBe(1920);
        expect(services.utilities.midiNoteToName(60)).toBe('C4');
    });

    it('reports unavailable dependencies without installing a global accessor', () => {
        const { services, missingCapabilities } = createPluginHostServices({
            timelineStore: null,
            selectNotesInWindow: null,
            selectTrackById: null,
            selectTracksByIds: null,
            selectMidiTracks: null,
            getFeatureData: null,
            getFeatureDataRange: null,
        });

        expect(missingCapabilities).toEqual([
            PLUGIN_CAPABILITIES.timelineRead,
            PLUGIN_CAPABILITIES.audioFeaturesRead,
            PLUGIN_CAPABILITIES.audioRawRead,
        ]);
        expect(services.timeline.getStateSnapshot()).toBeNull();
        expect(services.audio.sampleFeatureAtTime({ trackId: 'audio', feature: 'rms', time: 0 })).toBeNull();
        expect(services.timing.secondsToTicks(1)).toBeNull();
        expect((globalThis as { MVMNT?: unknown }).MVMNT).toBeUndefined();
    });
});
