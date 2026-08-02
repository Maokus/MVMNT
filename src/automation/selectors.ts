/**
 * Derived selectors for the automation timeline UI.
 */

import type { AutomationChannel } from './types';
import { traverseSceneGraph, type SceneGraphState } from '@state/scene-graph';

/** Minimal store shape needed by these selectors (avoids importing the full store type). */
interface AutomationStoreSlice {
    automation: { channels: Record<string, AutomationChannel> };
    elements: Record<string, { id: string; type: string }>;
    graph: SceneGraphState;
    interaction: {
        automationExpandedOwners: string[];
        automationExpandedCurves: string[];
    };
}

export interface AutomatedOwnerView {
    ownerId: string;
    ownerType: string;
    ownerKind: 'element' | 'node';
    channels: AutomationChannel[];
}

/** Returns an ordered list of property owners that have at least one automation channel. */
export function selectAutomatedOwners(state: AutomationStoreSlice): AutomatedOwnerView[] {
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

    const result: AutomatedOwnerView[] = [];
    for (const node of traverseSceneGraph(state.graph)) {
        if (node.kind !== 'element') continue;
        const elementId = node.elementId;
        const channels = channelsByElement.get(`element:${elementId}`);
        if (!channels || channels.length === 0) continue;
        const element = state.elements[elementId];
        if (!element) continue;
        // Sort channels by property key for stable ordering
        channels.sort((a, b) => a.target.propertyPath.localeCompare(b.target.propertyPath));
        result.push({
            ownerId: elementId,
            ownerType: element.type,
            ownerKind: 'element',
            channels,
        });
    }
    for (const node of traverseSceneGraph(state.graph)) {
        if (node.kind === 'root') continue;
        const channels = channelsByElement.get(`node:${node.id}`);
        if (!channels?.length) continue;
        channels.sort((a, b) => a.target.propertyPath.localeCompare(b.target.propertyPath));
        result.push({ ownerId: node.id, ownerType: '__host_node__', ownerKind: 'node', channels });
    }

    return result;
}

/** Count the total visible automation rows (headers + expanded channel rows). */
export function selectVisibleAutomationRowCount(state: AutomationStoreSlice): number {
    const elements = selectAutomatedOwners(state);
    if (elements.length === 0) return 0;

    let count = 0; // No section header row — we use a simple divider
    const expanded = new Set(state.interaction.automationExpandedOwners);

    for (const el of elements) {
        count += 1; // Element header row
        if (expanded.has(el.ownerId)) {
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
