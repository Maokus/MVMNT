/**
 * Derived selectors for the automation timeline UI.
 */

import type { AutomationChannel } from './types';

/** Minimal store shape needed by these selectors (avoids importing the full store type). */
interface AutomationStoreSlice {
    automation: { channels: Record<string, AutomationChannel> };
    elements: Record<string, { id: string; type: string }>;
    order: string[];
    interaction: {
        automationExpandedElements: string[];
        automationExpandedCurves: string[];
    };
}

export interface AutomatedElementView {
    elementId: string;
    elementType: string;
    channels: AutomationChannel[];
}

/** Returns an ordered list of elements that have at least one automation channel. */
export function selectAutomatedElements(state: AutomationStoreSlice): AutomatedElementView[] {
    const channelsByElement = new Map<string, AutomationChannel[]>();

    for (const channel of Object.values(state.automation.channels)) {
        const existing = channelsByElement.get(channel.elementId);
        if (existing) {
            existing.push(channel);
        } else {
            channelsByElement.set(channel.elementId, [channel]);
        }
    }

    const result: AutomatedElementView[] = [];
    for (const elementId of state.order) {
        const channels = channelsByElement.get(elementId);
        if (!channels || channels.length === 0) continue;
        const element = state.elements[elementId];
        if (!element) continue;
        // Sort channels by property key for stable ordering
        channels.sort((a, b) => a.propertyKey.localeCompare(b.propertyKey));
        result.push({
            elementId,
            elementType: element.type,
            channels,
        });
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
