import React from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { dispatchSceneCommand, type SceneCommand } from '@state/scene';
import type { NodeTransform } from '@state/scene-graph';
import { HOST_NODE_PROPERTY_SCHEMA } from '@state/scene/nodePropertySchema';
import { nodePropertyTarget, createKeyframe } from '@automation/types';
import { automationEvaluator } from '@automation/automation-evaluator';
import { useTimelineStore } from '@state/timelineStore';
import KeyframeControl from './KeyframeControl';

const fields = HOST_NODE_PROPERTY_SCHEMA.filter(
    (field): field is (typeof HOST_NODE_PROPERTY_SCHEMA)[number] & { path: keyof NodeTransform } =>
        field.path !== 'localVisible'
);

export function NodeTransformPanel() {
    const nodeIds = useSelectionStore((state) => state.selectedNodeIds);
    const graph = useSceneStore((state) => state.graph);
    const nodeBindings = useSceneStore((state) => state.nodeBindings);
    const macros = useSceneStore((state) => state.macros);
    const tick = useTimelineStore((state) => state.timeline.currentTick);
    const autoKeying = useTimelineStore((state) => state.transport.autoKeying);
    const nodes = nodeIds.map((id) => graph.nodesById[id]).filter(Boolean);
    if (!nodes.length) return null;

    const dispatchForAll = (commands: SceneCommand[], mergeKey?: string) =>
        dispatchSceneCommand(commands.length === 1 ? commands[0] : { type: 'batch', commands }, {
            source: 'NodeTransformPanel',
            mergeKey,
        });
    const common = <T,>(read: (node: (typeof nodes)[number]) => T): T | undefined => {
        const value = read(nodes[0]);
        return nodes.every((node) => Object.is(read(node), value)) ? value : undefined;
    };
    const singleNode = nodes.length === 1 ? nodes[0] : null;
    const valueFor = (path: keyof NodeTransform | 'localVisible', fallback: unknown) => {
        if (!singleNode) return fallback;
        const binding = nodeBindings[singleNode.id]?.[path];
        if (!binding) return fallback;
        if (binding.type === 'constant') return binding.value;
        if (binding.type === 'macro') return macros.byId[binding.macroId]?.value ?? fallback;
        return (
            useSceneStore.getState().propertyOverrides[binding.channelId] ??
            automationEvaluator.evaluate(binding.channelId, tick) ??
            fallback
        );
    };
    const updateAnimatedValue = (nodeId: string, path: string, value: unknown) => {
        const binding = useSceneStore.getState().nodeBindings[nodeId]?.[path];
        if (binding?.type === 'keyframes') {
            if (autoKeying) {
                dispatchSceneCommand(
                    { type: 'addKeyframe', channelId: binding.channelId, keyframe: createKeyframe(tick, value) },
                    { source: 'NodeTransformPanel', mergeKey: `node-keyframe:${nodeId}:${path}` }
                );
            } else {
                useSceneStore.getState().setPropertyOverride(binding.channelId, value);
            }
            return true;
        }
        if (binding) {
            dispatchSceneCommand(
                {
                    type: 'updatePropertyTargetBinding',
                    target: nodePropertyTarget(nodeId, path),
                    binding: { type: 'constant', value },
                },
                { source: 'NodeTransformPanel', mergeKey: `node-binding:${nodeId}:${path}` }
            );
            return true;
        }
        return false;
    };
    const macroOptions = (type: 'number' | 'boolean') => macros.allIds.filter((id) => macros.byId[id]?.type === type);

    return (
        <section className="property-group node-transform-panel" aria-label="Host transform">
            <h3>{nodes.length === 1 ? 'Node' : `${nodes.length} nodes`}</h3>
            {nodes.length === 1 ? (
                <label>
                    <span>Name</span>
                    <input
                        value={nodes[0].name}
                        onChange={(event) =>
                            dispatchSceneCommand(
                                { type: 'setNodeName', nodeId: nodes[0].id, name: event.target.value },
                                { source: 'NodeTransformPanel', mergeKey: `node-name:${nodes[0].id}` }
                            )
                        }
                    />
                </label>
            ) : (
                <p className="property-description">Mixed values are blank. Changes apply to every selected node.</p>
            )}
            <div className="property-grid">
                {fields.map((field) => {
                    const staticRaw = common((node) => node.userNodeTransform[field.path]);
                    const evaluatedRaw = singleNode ? valueFor(field.path, staticRaw) : staticRaw;
                    const raw =
                        typeof evaluatedRaw === 'number' && Number.isFinite(evaluatedRaw) ? evaluatedRaw : staticRaw;
                    const value = raw === undefined ? '' : field.degrees ? (raw * 180) / Math.PI : raw;
                    return (
                        <label key={field.path}>
                            <span>{field.label}</span>
                            <input
                                type="number"
                                step={field.step}
                                value={value === '' ? '' : Number(value.toFixed(4))}
                                placeholder="Mixed"
                                onChange={(event) => {
                                    if (event.target.value === '') return;
                                    const displayValue = Number(event.target.value);
                                    const next = field.degrees ? (displayValue * Math.PI) / 180 : displayValue;
                                    if (singleNode && updateAnimatedValue(singleNode.id, field.path, next)) return;
                                    dispatchForAll(
                                        nodes.map((node) => ({
                                            type: 'updateNodeTransform',
                                            nodeId: node.id,
                                            transform: { [field.path]: next },
                                        })),
                                        `node-transform:${nodeIds.join(',')}:${field.path}`
                                    );
                                }}
                            />
                            {singleNode ? (
                                <KeyframeControl
                                    target={nodePropertyTarget(singleNode.id, field.path)}
                                    propertyType="number"
                                    currentValue={raw}
                                />
                            ) : null}
                            {singleNode ? (
                                <select
                                    aria-label={`${field.label} macro`}
                                    value={
                                        nodeBindings[singleNode.id]?.[field.path]?.type === 'macro'
                                            ? (nodeBindings[singleNode.id][field.path] as any).macroId
                                            : ''
                                    }
                                    onChange={(event) =>
                                        dispatchSceneCommand(
                                            {
                                                type: 'updatePropertyTargetBinding',
                                                target: nodePropertyTarget(singleNode.id, field.path),
                                                binding: event.target.value
                                                    ? { type: 'macro', macroId: event.target.value }
                                                    : { type: 'constant', value: raw },
                                            },
                                            { source: 'NodeTransformPanel' }
                                        )
                                    }
                                >
                                    <option value="">No macro</option>
                                    {macroOptions('number').map((id) => (
                                        <option key={id} value={id}>
                                            {macros.byId[id]?.name ?? id}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                        </label>
                    );
                })}
            </div>
            {(['localVisible', 'localLocked'] as const).map((key) => {
                const staticValue = common((node) => node[key]);
                const value = singleNode && key === 'localVisible' ? Boolean(valueFor(key, staticValue)) : staticValue;
                return (
                    <label key={key}>
                        <input
                            type="checkbox"
                            checked={value ?? false}
                            aria-checked={value === undefined ? 'mixed' : value}
                            onChange={(event) => {
                                if (
                                    singleNode &&
                                    key === 'localVisible' &&
                                    updateAnimatedValue(singleNode.id, key, event.target.checked)
                                )
                                    return;
                                dispatchForAll(
                                    nodes.map((node) =>
                                        key === 'localVisible'
                                            ? {
                                                  type: 'setNodeVisibility',
                                                  nodeId: node.id,
                                                  visible: event.target.checked,
                                              }
                                            : { type: 'setNodeLocked', nodeId: node.id, locked: event.target.checked }
                                    )
                                );
                            }}
                        />{' '}
                        {key === 'localVisible' ? 'Visible' : 'Locked'} {value === undefined ? '(mixed)' : ''}
                        {singleNode && key === 'localVisible' ? (
                            <>
                                <KeyframeControl
                                    target={nodePropertyTarget(singleNode.id, key)}
                                    propertyType="boolean"
                                    currentValue={value}
                                />
                                <select
                                    aria-label="Visible macro"
                                    value={
                                        nodeBindings[singleNode.id]?.localVisible?.type === 'macro'
                                            ? (nodeBindings[singleNode.id].localVisible as any).macroId
                                            : ''
                                    }
                                    onChange={(event) =>
                                        dispatchSceneCommand(
                                            {
                                                type: 'updatePropertyTargetBinding',
                                                target: nodePropertyTarget(singleNode.id, 'localVisible'),
                                                binding: event.target.value
                                                    ? { type: 'macro', macroId: event.target.value }
                                                    : { type: 'constant', value },
                                            },
                                            { source: 'NodeTransformPanel' }
                                        )
                                    }
                                >
                                    <option value="">No macro</option>
                                    {macroOptions('boolean').map((id) => (
                                        <option key={id} value={id}>
                                            {macros.byId[id]?.name ?? id}
                                        </option>
                                    ))}
                                </select>
                            </>
                        ) : null}
                    </label>
                );
            })}
        </section>
    );
}
