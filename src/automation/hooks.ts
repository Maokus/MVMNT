/**
 * React hooks for the automation system.
 *
 * These hooks subscribe to the scene and timeline stores to provide
 * reactive access to automation channels and the current tick.
 */

import { useCallback, useMemo } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import {
    channelForTarget,
    elementPropertyTarget,
    encodePropertyOwner,
    encodePropertyTarget,
    findKeyframeAtTick,
} from './types';
import type { AutomationChannel, AutomationKeyframe, PropertyOwner, PropertyTarget } from './types';
import { selectAutomatedOwners, selectAutomationSceneNodes } from './selectors';

/** Returns the automation channel for an element property, or null if not automated. */
export function useAutomationChannel(elementId: string, propertyKey: string): AutomationChannel | null {
    return useAutomationTargetChannel(elementPropertyTarget(elementId, propertyKey));
}

export function useAutomationTargetChannel(target: PropertyTarget): AutomationChannel | null {
    const targetKey = encodePropertyTarget(target);
    return useSceneStore(
        useCallback(
            (state) => channelForTarget(state.automation, target) ?? null,
            // targetKey is the stable semantic dependency; callers may create a target inline.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [targetKey]
        )
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
            [channelId, tick]
        )
    );
}

/** Returns the current timeline tick (playhead position). */
export function useCurrentTick(): number {
    return useTimelineStore(useCallback((state) => state.timeline.currentTick, []));
}

/** Convenience: returns whether a given property is automated. */
export function useIsPropertyAutomated(elementId: string, propertyKey: string): boolean {
    const channel = useAutomationChannel(elementId, propertyKey);
    return channel !== null;
}

/** Returns all automation channels for an element or node owner, sorted by property path. */
export function useOwnerChannels(owner: PropertyOwner): AutomationChannel[] {
    const ownerKey = encodePropertyOwner(owner);
    return useSceneStore(
        useCallback(
            (state) => {
                const channels: AutomationChannel[] = [];
                for (const channel of Object.values(state.automation.channels)) {
                    if (encodePropertyOwner(channel.target.owner) === ownerKey) {
                        channels.push(channel);
                    }
                }
                channels.sort((a, b) => a.target.propertyPath.localeCompare(b.target.propertyPath));
                return channels;
            },
            [ownerKey]
        )
    );
}

/** Returns owner IDs that have at least one automation channel. */
export function useAutomatedOwnerIds(): string[] {
    return useSceneStore(
        useCallback((state) => {
            return selectAutomatedOwners(state).map((e) => e.ownerId);
        }, [])
    );
}

export function useAutomatedOwners() {
    return useSceneStore(useCallback((state) => selectAutomatedOwners(state), []));
}

export function useAutomationSceneNodes() {
    return useSceneStore(useCallback((state) => selectAutomationSceneNodes(state), []));
}

/** Returns whether an owner is expanded in the automation section. */
export function useAutomationExpanded(owner: PropertyOwner): boolean {
    const ownerKey = encodePropertyOwner(owner);
    return useSceneStore(
        useCallback(
            (state) =>
                state.interaction.automationExpandedOwners.includes(ownerKey) ||
                state.interaction.automationExpandedOwners.includes(owner.id),
            [ownerKey, owner.id]
        )
    );
}

/** Returns whether a channel's curve editor is expanded. */
export function useCurveEditorExpanded(channelId: string): boolean {
    return useSceneStore(
        useCallback((state) => state.interaction.automationExpandedCurves.includes(channelId), [channelId])
    );
}
