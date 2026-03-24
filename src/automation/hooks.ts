/**
 * React hooks for the automation system.
 *
 * These hooks subscribe to the scene and timeline stores to provide
 * reactive access to automation channels and the current tick.
 */

import { useCallback, useMemo } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { makeChannelId, findKeyframeAtTick } from './types';
import type { AutomationChannel, AutomationKeyframe } from './types';

/** Returns the automation channel for an element property, or null if not automated. */
export function useAutomationChannel(elementId: string, propertyKey: string): AutomationChannel | null {
    const channelId = makeChannelId(elementId, propertyKey);
    return useSceneStore(
        useCallback(
            (state) => state.automation.channels[channelId] ?? null,
            [channelId],
        ),
    );
}

/** Returns the keyframe at the given tick on a channel, or null. */
export function useKeyframeAtTick(channelId: string | null, tick: number): AutomationKeyframe | null {
    return useSceneStore(
        useCallback(
            (state) => {
                if (!channelId) return null;
                const channel = state.automation.channels[channelId];
                if (!channel) return null;
                return findKeyframeAtTick(channel.keyframes, tick);
            },
            [channelId, tick],
        ),
    );
}

/** Returns the current timeline tick (playhead position). */
export function useCurrentTick(): number {
    return useTimelineStore(
        useCallback((state) => state.timeline.currentTick, []),
    );
}

/** Convenience: returns whether a given property is automated. */
export function useIsPropertyAutomated(elementId: string, propertyKey: string): boolean {
    const channel = useAutomationChannel(elementId, propertyKey);
    return channel !== null;
}
