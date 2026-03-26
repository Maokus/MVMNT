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
import { selectAutomatedElements } from './selectors';

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

/** Returns all automation channels for an element, sorted by property key. */
export function useElementChannels(elementId: string): AutomationChannel[] {
    return useSceneStore(
        useCallback(
            (state) => {
                const channels: AutomationChannel[] = [];
                for (const channel of Object.values(state.automation.channels)) {
                    if (channel.elementId === elementId) {
                        channels.push(channel);
                    }
                }
                channels.sort((a, b) => a.propertyKey.localeCompare(b.propertyKey));
                return channels;
            },
            [elementId],
        ),
    );
}

/** Returns element IDs that have at least one automation channel. */
export function useAutomatedElementIds(): string[] {
    return useSceneStore(
        useCallback((state) => {
            return selectAutomatedElements(state).map((e) => e.elementId);
        }, []),
    );
}

/** Returns whether an element is expanded in the automation section. */
export function useAutomationExpanded(elementId: string): boolean {
    return useSceneStore(
        useCallback(
            (state) => state.interaction.automationExpandedElements.includes(elementId),
            [elementId],
        ),
    );
}

/** Returns whether a channel's curve editor is expanded. */
export function useCurveEditorExpanded(channelId: string): boolean {
    return useSceneStore(
        useCallback(
            (state) => state.interaction.automationExpandedCurves.includes(channelId),
            [channelId],
        ),
    );
}
