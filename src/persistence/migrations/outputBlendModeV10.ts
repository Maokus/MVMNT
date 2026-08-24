import { isElementOutputBlendMode, normalizeElementOutputBlendMode } from '@utils/blend-modes';

export const OUTPUT_BLEND_MODE_SCHEMA_VERSION = 10;

const MIGRATED_ELEMENT_TYPES = new Set(['basicShapes', 'audioSpectrum', 'audioVolumeMeter']);

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function bindingValue(binding: unknown): unknown {
    if (isRecord(binding) && binding.type === 'constant') return binding.value;
    return binding;
}

/** Move whole-element built-in blend controls to the host-owned element node. */
export function migrateOutputBlendModeV10<T extends Record<string, any>>(envelope: T): T {
    if (Number(envelope.schemaVersion) >= OUTPUT_BLEND_MODE_SCHEMA_VERSION) return envelope;
    const scene = isRecord(envelope.scene) ? envelope.scene : {};
    const graph = isRecord(scene.graph) ? scene.graph : {};
    const rawNodes = isRecord(graph.nodesById) ? graph.nodesById : {};
    const rawElements = isRecord(scene.elements) ? scene.elements : {};
    const nodesById = Object.fromEntries(
        Object.entries(rawNodes).map(([id, node]) => [
            id,
            isRecord(node) && node.kind === 'element'
                ? { ...node, outputBlendMode: normalizeElementOutputBlendMode(node.outputBlendMode) }
                : node,
        ])
    );
    const nodeBindings = isRecord(scene.nodeBindings)
        ? Object.fromEntries(
              Object.entries(scene.nodeBindings).map(([id, bindings]) => [
                  id,
                  isRecord(bindings) ? { ...bindings } : {},
              ])
          )
        : {};
    const elements: Record<string, any> = { ...rawElements };
    let automation = scene.automation;

    for (const [elementId, rawElement] of Object.entries(rawElements)) {
        if (!isRecord(rawElement) || !MIGRATED_ELEMENT_TYPES.has(rawElement.type)) continue;
        const properties = isRecord(rawElement.properties) ? rawElement.properties : {};
        if (!Object.prototype.hasOwnProperty.call(properties, 'blendMode')) continue;
        const nodeEntry = Object.entries(nodesById).find(
            ([, node]) => isRecord(node) && node.kind === 'element' && node.elementId === elementId
        );
        if (!nodeEntry) continue;
        const [nodeId, rawNode] = nodeEntry;
        const node = rawNode as Record<string, any>;
        const binding = properties.blendMode;
        const hadHostValue =
            (isRecord(rawNodes[nodeId]) &&
                isElementOutputBlendMode(rawNodes[nodeId].outputBlendMode) &&
                rawNodes[nodeId].outputBlendMode !== 'source-over') ||
            Object.prototype.hasOwnProperty.call(nodeBindings[nodeId] ?? {}, 'outputBlendMode');

        if (!hadHostValue && isElementOutputBlendMode(bindingValue(binding))) {
            node.outputBlendMode = bindingValue(binding);
        } else if (!hadHostValue && isRecord(binding) && (binding.type === 'macro' || binding.type === 'keyframes')) {
            nodeBindings[nodeId] = { ...(nodeBindings[nodeId] ?? {}), outputBlendMode: binding };
            if (binding.type === 'keyframes' && isRecord(automation) && isRecord(automation.channels)) {
                const channel = automation.channels[binding.channelId];
                if (isRecord(channel)) {
                    automation = {
                        ...automation,
                        channels: {
                            ...automation.channels,
                            [binding.channelId]: {
                                ...channel,
                                target: {
                                    owner: { kind: 'node', id: nodeId },
                                    propertyPath: 'outputBlendMode',
                                },
                            },
                        },
                    };
                }
            }
        }

        const { blendMode: _retired, ...nextProperties } = properties;
        elements[elementId] = { ...rawElement, properties: nextProperties };
    }

    return {
        ...envelope,
        schemaVersion: OUTPUT_BLEND_MODE_SCHEMA_VERSION,
        scene: {
            ...scene,
            elements,
            graph: { ...graph, nodesById },
            ...(Object.keys(nodeBindings).length ? { nodeBindings } : { nodeBindings: undefined }),
            ...(automation ? { automation } : {}),
        },
    } as T;
}
