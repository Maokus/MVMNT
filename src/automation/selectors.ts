/**
 * Derived selectors for the automation timeline UI.
 */

import type { AutomationChannel } from './types';
import { encodePropertyOwner } from './types';
import { traverseSceneGraph, type SceneGraphState } from '@state/scene-graph';
import { useSceneEditorStore } from '@state/sceneEditorStore';

/** Minimal store shape needed by these selectors (avoids importing the full store type). */
interface AutomationStoreSlice {
    automation: { channels: Record<string, AutomationChannel> };
    elements: Record<string, { id: string; type: string }>;
    graph: SceneGraphState;
}

export interface AutomatedOwnerView {
    ownerId: string;
    ownerType: string;
    ownerKind: 'element' | 'node';
    channels: AutomationChannel[];
}

export interface AutomatedSceneNodeView {
    nodeId: string;
    name: string;
    kind: 'group' | 'element';
    depth: number;
    ancestorNodeIds: string[];
    elementId?: string;
    elementType?: string;
    hostChannels: AutomationChannel[];
    contentChannels: AutomationChannel[];
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

/** Scene-tree ordered automation rows. Ancestors with only automated descendants remain visible for context. */
export function selectAutomationSceneNodes(state: AutomationStoreSlice): AutomatedSceneNodeView[] {
    const channelsByOwner = new Map<string, AutomationChannel[]>();
    for (const channel of Object.values(state.automation.channels)) {
        const key = `${channel.target.owner.kind}:${channel.target.owner.id}`;
        const channels = channelsByOwner.get(key) ?? [];
        channels.push(channel);
        channelsByOwner.set(key, channels);
    }

    const traversed = traverseSceneGraph(state.graph).filter((node) => node.kind !== 'root');
    const included = new Set<string>();
    for (const node of traversed) {
        const elementId = node.kind === 'element' ? node.elementId : undefined;
        const hasDirect =
            Boolean(channelsByOwner.get(`node:${node.id}`)?.length) ||
            Boolean(elementId && channelsByOwner.get(`element:${elementId}`)?.length);
        if (!hasDirect) continue;
        let currentId: string | null = node.id;
        while (currentId && currentId !== state.graph.rootId) {
            included.add(currentId);
            currentId = state.graph.nodesById[currentId]?.parentId ?? null;
        }
    }

    return traversed.flatMap((node) => {
        if (!included.has(node.id)) return [];
        let depth = 0;
        let parentId = node.parentId;
        const ancestorNodeIds: string[] = [];
        while (parentId && parentId !== state.graph.rootId) {
            depth += 1;
            ancestorNodeIds.unshift(parentId);
            parentId = state.graph.nodesById[parentId]?.parentId ?? null;
        }
        const elementId = node.kind === 'element' ? node.elementId : undefined;
        const hostChannels = [...(channelsByOwner.get(`node:${node.id}`) ?? [])];
        const contentChannels = elementId ? [...(channelsByOwner.get(`element:${elementId}`) ?? [])] : [];
        hostChannels.sort((a, b) => a.target.propertyPath.localeCompare(b.target.propertyPath));
        contentChannels.sort((a, b) => a.target.propertyPath.localeCompare(b.target.propertyPath));
        return [
            {
                nodeId: node.id,
                name: node.kind === 'element' ? node.elementId : node.name,
                kind: node.kind,
                depth,
                ancestorNodeIds,
                elementId,
                elementType: elementId ? state.elements[elementId]?.type : undefined,
                hostChannels,
                contentChannels,
            },
        ];
    });
}

/** Count the total visible automation rows (headers + expanded channel rows). */
export function selectVisibleAutomationRowCount(state: AutomationStoreSlice): number {
    const rows = selectAutomationSceneNodes(state);
    if (rows.length === 0) return 0;

    let count = 0; // No section header row — we use a simple divider
    const editor = useSceneEditorStore.getState();
    const expanded = new Set(editor.automationExpandedOwners);

    for (const row of rows) {
        count += 1; // Element header row
        const expandedKey = encodePropertyOwner({ kind: 'node', id: row.nodeId });
        if (expanded.has(expandedKey) || expanded.has(row.nodeId)) {
            const channels = [...row.hostChannels, ...row.contentChannels];
            count += channels.length; // Channel rows
            // Count expanded curve editors
            for (const ch of channels) {
                if (editor.automationExpandedCurves.includes(ch.id)) {
                    count += 4; // Curve editor takes ~4x the space of a regular row
                }
            }
        }
    }

    return count;
}
