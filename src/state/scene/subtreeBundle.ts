import {
    createOpaqueChannelId,
    encodePropertyTarget,
    rebuildAutomationTargetIndex,
    type AutomationChannel,
    type AutomationState,
    type PropertyTarget,
} from '@automation/types';
import {
    cloneSceneGraph,
    subtreeNodeIds,
    validateSceneGraph,
    type SceneGraphState,
    type SceneNode,
} from '@state/scene-graph';
import { createDuplicateName } from '@context/duplicateElementName';
import type {
    BindingState,
    ElementBindings,
    SceneImportPayload,
    SceneSerializedElement,
    SceneSerializedMacros,
    SceneStoreState,
} from '@state/sceneStore';

export interface SceneSubtreeBundle {
    format: 'mvmnt.scene-subtree';
    version: 1;
    roots: string[];
    nodes: Record<string, SceneNode>;
    elements: Record<string, SceneSerializedElement>;
    nodeBindings: Record<string, ElementBindings>;
    automation: AutomationState;
    macros: SceneSerializedMacros;
    dependencies: {
        elementTypes: string[];
        /** Asset, timeline-track, and plugin binary payloads remain document-level references. */
        externalReferences: Array<{ owner: PropertyTarget['owner']; propertyPath: string; value: unknown }>;
    };
}

export interface SceneSubtreeImportOptions {
    parentId?: string;
    targetIndex?: number;
}

function cloneValue<T>(value: T): T {
    return structuredClone(value);
}

function normalizedRoots(graph: SceneGraphState, nodeIds: readonly string[]): string[] {
    const selected = new Set(nodeIds.filter((id) => id !== graph.rootId && Boolean(graph.nodesById[id])));
    return [...selected].filter((id) => {
        let parentId = graph.nodesById[id]?.parentId;
        while (parentId) {
            if (selected.has(parentId)) return false;
            parentId = graph.nodesById[parentId]?.parentId ?? null;
        }
        return true;
    });
}

function collectExternalReferences(
    owner: PropertyTarget['owner'],
    bindings: ElementBindings,
    result: SceneSubtreeBundle['dependencies']['externalReferences']
): void {
    for (const [propertyPath, binding] of Object.entries(bindings)) {
        if (binding.type !== 'constant') continue;
        if (!/(asset|track|source|font)/i.test(propertyPath)) continue;
        result.push({ owner: { ...owner }, propertyPath, value: cloneValue(binding.value) });
    }
}

export function createSceneSubtreeBundle(state: SceneStoreState, nodeIds: readonly string[]): SceneSubtreeBundle {
    const roots = normalizedRoots(state.graph, nodeIds);
    if (!roots.length) throw new Error('SceneSubtreeBundle requires at least one non-root node');
    const includedNodeIds = new Set(subtreeNodeIds(state.graph, roots));
    const includedElementIds = new Set<string>();
    const nodes: Record<string, SceneNode> = {};
    for (const nodeId of includedNodeIds) {
        const node = state.graph.nodesById[nodeId];
        if (!node) continue;
        const cloned = cloneValue(node);
        if (roots.includes(nodeId)) cloned.parentId = null;
        nodes[nodeId] = cloned;
        if (node.kind === 'element') includedElementIds.add(node.elementId);
    }

    const draft = state.exportSceneDraft();
    const elements = Object.fromEntries(
        [...includedElementIds].flatMap((id) => (draft.elements[id] ? [[id, cloneValue(draft.elements[id])]] : []))
    );
    const nodeBindings = Object.fromEntries(
        [...includedNodeIds].flatMap((id) => (state.nodeBindings[id] ? [[id, cloneValue(state.nodeBindings[id])]] : []))
    );
    const channels: Record<string, AutomationChannel> = {};
    const usedMacroIds = new Set<string>();
    const externalReferences: SceneSubtreeBundle['dependencies']['externalReferences'] = [];
    for (const elementId of includedElementIds) {
        const bindings = state.bindings.byElement[elementId] ?? {};
        collectExternalReferences({ kind: 'element', id: elementId }, bindings, externalReferences);
        for (const binding of Object.values(bindings)) {
            if (binding.type === 'macro') usedMacroIds.add(binding.macroId);
            if (binding.type === 'keyframes' && state.automation.channels[binding.channelId]) {
                channels[binding.channelId] = cloneValue(state.automation.channels[binding.channelId]);
            }
        }
    }
    for (const [nodeId, bindings] of Object.entries(nodeBindings)) {
        collectExternalReferences({ kind: 'node', id: nodeId }, bindings, externalReferences);
        for (const binding of Object.values(bindings)) {
            if (binding.type === 'macro') usedMacroIds.add(binding.macroId);
            if (binding.type === 'keyframes' && state.automation.channels[binding.channelId]) {
                channels[binding.channelId] = cloneValue(state.automation.channels[binding.channelId]);
            }
        }
    }
    const macros = Object.fromEntries(
        [...usedMacroIds].flatMap((id) => (state.macros.byId[id] ? [[id, cloneValue(state.macros.byId[id])]] : []))
    );
    return {
        format: 'mvmnt.scene-subtree',
        version: 1,
        roots,
        nodes,
        elements,
        nodeBindings,
        automation: { channels, channelIdByTarget: rebuildAutomationTargetIndex(channels) },
        macros: { macros, allIds: [...usedMacroIds], exportedAt: Date.now() },
        dependencies: {
            elementTypes: [...new Set(Object.values(elements).map((element) => element.type))].sort(),
            externalReferences,
        },
    };
}

function allocateId(base: string, occupied: Set<string>): string {
    let candidate = base;
    let suffix = 2;
    while (occupied.has(candidate)) candidate = `${base} copy ${suffix++}`;
    occupied.add(candidate);
    return candidate;
}

function remapBinding(
    binding: BindingState,
    channelIds: Readonly<Record<string, string>>,
    macroIds: Readonly<Record<string, string>>
): BindingState {
    if (binding.type === 'keyframes') {
        const channelId = channelIds[binding.channelId];
        if (!channelId) throw new Error(`Subtree binding references missing channel '${binding.channelId}'`);
        return { ...binding, channelId };
    }
    if (binding.type === 'macro') {
        const macroId = macroIds[binding.macroId];
        if (!macroId) throw new Error(`Subtree binding references missing macro '${binding.macroId}'`);
        return { ...binding, macroId };
    }
    return cloneValue(binding);
}

export function buildSceneSubtreeImport(
    state: SceneStoreState,
    bundle: SceneSubtreeBundle,
    options: SceneSubtreeImportOptions = {}
): { payload: SceneImportPayload; importedRootIds: string[] } {
    if (bundle.format !== 'mvmnt.scene-subtree' || bundle.version !== 1) {
        throw new Error('Unsupported SceneSubtreeBundle');
    }
    for (const rootId of bundle.roots) {
        if (!bundle.nodes[rootId] || bundle.nodes[rootId].parentId !== null) {
            throw new Error(`Detached subtree root '${rootId}' is invalid`);
        }
    }

    const nodeIds: Record<string, string> = {};
    const elementIds: Record<string, string> = {};
    const macroIds: Record<string, string> = {};
    const channelIds: Record<string, string> = {};
    const occupiedNodes = new Set(Object.keys(state.graph.nodesById));
    const occupiedElements = new Set(Object.keys(state.elements));
    const occupiedMacros = new Set(Object.keys(state.macros.byId));
    const occupiedChannels = new Set(Object.keys(state.automation.channels));
    const occupiedNames = new Set(Object.values(state.graph.nodesById).map((node) => node.name));
    for (const id of Object.keys(bundle.nodes)) nodeIds[id] = allocateId(id, occupiedNodes);
    for (const id of Object.keys(bundle.elements)) elementIds[id] = allocateId(id, occupiedElements);
    for (const id of Object.keys(bundle.macros.macros)) macroIds[id] = allocateId(id, occupiedMacros);
    for (const id of Object.keys(bundle.automation.channels)) {
        const allocated = createOpaqueChannelId(occupiedChannels);
        occupiedChannels.add(allocated);
        channelIds[id] = allocated;
    }

    const draft = state.exportSceneDraft();
    const elements = { ...draft.elements };
    for (const [oldId, element] of Object.entries(bundle.elements)) {
        const id = elementIds[oldId];
        elements[id] = {
            ...cloneValue(element),
            id,
            properties: Object.fromEntries(
                Object.entries(element.properties).map(([path, binding]) => [
                    path,
                    remapBinding(binding as BindingState, channelIds, macroIds),
                ])
            ),
        };
    }

    const graph = cloneSceneGraph(state.graph);
    const parentId = options.parentId ?? graph.rootId;
    const parent = graph.nodesById[parentId];
    if (!parent || !('children' in parent)) throw new Error(`Import parent '${parentId}' is not a container`);
    for (const [oldId, node] of Object.entries(bundle.nodes)) {
        const id = nodeIds[oldId];
        const cloned = cloneValue(node) as SceneNode;
        cloned.id = id;
        cloned.parentId = node.parentId ? nodeIds[node.parentId] : parentId;
        if ('children' in cloned) cloned.children = cloned.children.map((childId) => nodeIds[childId]);
        if (cloned.kind === 'element') {
            cloned.elementId = elementIds[cloned.elementId];
            cloned.name = cloned.elementId;
        } else if (cloned.kind === 'group') {
            cloned.name = createDuplicateName(cloned.name, occupiedNames);
        }
        occupiedNames.add(cloned.name);
        graph.nodesById[id] = cloned;
    }
    const importedRootIds = bundle.roots.map((id) => nodeIds[id]);
    parent.children.splice(
        Math.max(0, Math.min(parent.children.length, options.targetIndex ?? parent.children.length)),
        0,
        ...importedRootIds
    );
    graph.revision += 1;
    const graphValidation = validateSceneGraph(graph, Object.keys(elements));
    if (!graphValidation.ok) throw new Error(graphValidation.errors[0]?.message ?? 'Imported graph is invalid');

    const channels = cloneValue(draft.automation?.channels ?? {});
    for (const [oldId, channel] of Object.entries(bundle.automation.channels)) {
        const target = cloneValue(channel.target);
        const ownerId = target.owner.kind === 'node' ? nodeIds[target.owner.id] : elementIds[target.owner.id];
        if (!ownerId) throw new Error(`Subtree channel '${oldId}' targets an owner outside the bundle`);
        target.owner.id = ownerId;
        channels[channelIds[oldId]] = { ...cloneValue(channel), id: channelIds[oldId], target };
    }
    const nodeBindings = cloneValue(draft.nodeBindings ?? {});
    for (const [oldId, bindings] of Object.entries(bundle.nodeBindings)) {
        nodeBindings[nodeIds[oldId]] = Object.fromEntries(
            Object.entries(bindings).map(([path, binding]) => [path, remapBinding(binding, channelIds, macroIds)])
        );
    }
    const currentMacros = draft.macros ?? { macros: {}, allIds: [] };
    const macros = cloneValue(currentMacros.macros);
    const allIds = [...(currentMacros.allIds ?? Object.keys(macros))];
    for (const [oldId, macro] of Object.entries(bundle.macros.macros)) {
        const id = macroIds[oldId];
        macros[id] = { ...cloneValue(macro), name: id };
        allIds.push(id);
    }

    return {
        importedRootIds,
        payload: {
            elements,
            graph,
            sceneSettings: draft.sceneSettings,
            macros: { macros, allIds, exportedAt: Date.now() },
            automation: { channels, channelIdByTarget: rebuildAutomationTargetIndex(channels) },
            nodeBindings,
            fontAssets: draft.fontAssets,
            fontLicensingAcknowledgedAt: draft.fontLicensingAcknowledgedAt,
        },
    };
}

export function propertyTargetKey(target: PropertyTarget): string {
    return encodePropertyTarget(target);
}
