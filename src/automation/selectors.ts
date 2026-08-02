/**
 * Derived selectors for the automation timeline UI.
 */

import type { AutomationChannel } from './types';
import { traverseSceneGraph, type SceneGraphState } from '@state/scene-graph';

/** Minimal store shape needed by these selectors (avoids importing the full store type). */
interface AutomationStoreSlice {
    automation: { channels: Record<string, AutomationChannel> };
    elements: Record<string, { id: string; type: string }>;
    order: string[];
    graph: SceneGraphState;
    interaction: {
        automationExpandedElements: string[];
        automationExpandedCurves: string[];
    };
}

export interface AutomatedElementView {
    elementId: string;
    elementType: string;
    ownerKind: 'element' | 'node';
    channels: AutomationChannel[];
}

/** Returns an ordered list of elements that have at least one automation channel. */
export function selectAutomatedElements(state: AutomationStoreSlice): AutomatedElementView[] {
    const channelsByElement = new Map<string, AutomationChannel[]>();

    for (const channel of Object.values(state.automation.channels)) {
        const ownerKey = `${channel.target.owner.kind}:${channel.target.owner.id}`;
        const existing = channelsByElement.get(ownerKey);
        if (existing) {
            existing.push(channel);
        } else {
            channelsByElement.set(ownerKey, [channel]);
        }
    }

    const result: AutomatedElementView[] = [];
    for (const elementId of state.order) {
        const channels = channelsByElement.get(`element:${elementId}`);
        if (!channels || channels.length === 0) continue;
        const element = state.elements[elementId];
        if (!element) continue;
        // Sort channels by property key for stable ordering
        channels.sort((a, b) => a.target.propertyPath.localeCompare(b.target.propertyPath));
        result.push({
            elementId,
            elementType: element.type,
            ownerKind: 'element',
            channels,
        });
    }
    for (const node of traverseSceneGraph(state.graph)) {
        if (node.kind === 'root') continue;
        const channels = channelsByElement.get(`node:${node.id}`);
        if (!channels?.length) continue;
        channels.sort((a, b) => a.target.propertyPath.localeCompare(b.target.propertyPath));
        result.push({ elementId: node.id, elementType: '__host_node__', ownerKind: 'node', channels });
    }

    return result;
}

/** Count the total visible automation rows (headers + expanded channel rows). */
export function selectVisibleAutomationRowCount(state: AutomationStoreSlice): number {
    const elements = selectAutomatedElements(state);
    if (elements.length === 0) return 0;

    let count = 0; // No section header row — we use a simple divider
    const expanded = new Set(state.interaction.automationExpandedElements);

    for (const el of elements) {
        count += 1; // Element header row
        if (expanded.has(el.elementId)) {
            count += el.channels.length; // Channel rows
            // Count expanded curve editors
            for (const ch of el.channels) {
                if (state.interaction.automationExpandedCurves.includes(ch.id)) {
                    count += 4; // Curve editor takes ~4x the space of a regular row
                }
            }
        }
    }

    return count;
}
