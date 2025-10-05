import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { dispatchTimelineCommandDescriptor, timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import type { AddTrackCommandResult } from '@state/timeline/commands/addTrackCommand';
import {
    registerTimelineCommandListener,
    clearTimelineCommandListeners,
    type TimelineCommandTelemetryEvent,
} from '@state/timeline/timelineTelemetry';

function resetTimelineState() {
    const store = useTimelineStore.getState();
    store.resetTimeline();
    store.clearAllTracks();
}

describe('timeline command gateway', () => {
    beforeEach(() => {
        resetTimelineState();
        clearTimelineCommandListeners();
    });

    afterEach(() => {
        clearTimelineCommandListeners();
    });

    it('adds a midi track via command dispatch', async () => {
        const result = await timelineCommandGateway.dispatchById<AddTrackCommandResult>('timeline.addTrack', {
            type: 'midi',
            name: 'Command Track',
        });

        const trackId = result.result?.trackId;
        expect(trackId).toBeDefined();
        const state = useTimelineStore.getState();
        expect(state.tracksOrder).toContain(trackId);
        expect(state.tracks[trackId!]?.type).toBe('midi');
        expect(result.metadata.undoLabel).toBe('Add Track');
    });

    it('removes tracks and updates store state', async () => {
        const added = await timelineCommandGateway.dispatchById<AddTrackCommandResult>('timeline.addTrack', {
            type: 'midi',
            name: 'Remove Me',
        });
        const trackId = added.result?.trackId;
        expect(trackId).toBeDefined();

        await timelineCommandGateway.dispatchById('timeline.removeTracks', {
            trackIds: [trackId!],
        });

        const state = useTimelineStore.getState();
        expect(state.tracks[trackId!]).toBeUndefined();
        expect(state.tracksOrder).not.toContain(trackId);
    });

    it('executes serialized descriptors', async () => {
        const descriptor = {
            type: 'timeline.addTrack' as const,
            version: 1,
            payload: { type: 'midi', name: 'Descriptor Track' },
            options: { source: 'descriptor-test' },
        };

        const result = await dispatchTimelineCommandDescriptor<AddTrackCommandResult>(descriptor);
        const trackId = result.result?.trackId;
        expect(trackId).toBeDefined();
        expect(useTimelineStore.getState().tracks[trackId!]).toBeDefined();
    });

    it('emits telemetry matching command schema', async () => {
        const events: TimelineCommandTelemetryEvent[] = [];
        const unsubscribe = registerTimelineCommandListener((event) => events.push(event));

        await timelineCommandGateway.dispatchById<AddTrackCommandResult>('timeline.addTrack', {
            type: 'midi',
            name: 'Telemetry Track',
        });

        unsubscribe();
        expect(events).toHaveLength(1);
        const event = events[0];
        expect(event.success).toBe(true);
        expect(typeof event.durationMs).toBe('number');
        expect(event.command).toBeDefined();
        expect(event.patch).toBeDefined();
        expect(event.source).toBeTruthy();
        expect(event.undoLabel).toBeTruthy();
        expect(event.telemetryEvent).toBeTruthy();
        expect(event).toHaveProperty('mergeKey');
        expect(event).toHaveProperty('transient');
        expect(event).toHaveProperty('canMergeWith');
    });

    it('updates track properties via command', async () => {
        const added = await timelineCommandGateway.dispatchById<AddTrackCommandResult>('timeline.addTrack', {
            type: 'midi',
            name: 'Props Track',
        });
        const trackId = added.result?.trackId ?? '';
        expect(trackId).toBeTruthy();

        await timelineCommandGateway.dispatchById('timeline.setTrackProperties', {
            updates: [
                { trackId, patch: { mute: true, regionStartTick: 120 } },
            ],
        });

        const state = useTimelineStore.getState();
        expect(state.tracks[trackId]?.mute).toBe(true);
        expect(state.tracks[trackId]?.regionStartTick).toBe(120);
    });

    it('reorders tracks via command dispatch', async () => {
        const first = await timelineCommandGateway.dispatchById<AddTrackCommandResult>('timeline.addTrack', {
            type: 'midi',
            name: 'First',
        });
        const second = await timelineCommandGateway.dispatchById<AddTrackCommandResult>('timeline.addTrack', {
            type: 'midi',
            name: 'Second',
        });
        const ids = [first.result?.trackId ?? '', second.result?.trackId ?? ''];
        expect(ids[0]).not.toBe(ids[1]);

        await timelineCommandGateway.dispatchById('timeline.reorderTracks', {
            order: [ids[1], ids[0]].filter(Boolean),
        });

        const order = useTimelineStore.getState().tracksOrder;
        expect(order[0]).toBe(ids[1]);
        expect(order[1]).toBe(ids[0]);
    });
});
