import React from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { dispatchSceneCommand, type SceneCommand } from '@state/scene';
import type { NodeTransform } from '@state/scene-graph';

const fields: Array<{ key: keyof NodeTransform; label: string; step: number; degrees?: boolean }> = [
    { key: 'translationX', label: 'X', step: 1 },
    { key: 'translationY', label: 'Y', step: 1 },
    { key: 'rotation', label: 'Rotation', step: 1, degrees: true },
    { key: 'uniformScale', label: 'Scale', step: 0.01 },
    { key: 'pivotX', label: 'Pivot X', step: 1 },
    { key: 'pivotY', label: 'Pivot Y', step: 1 },
];

export function NodeTransformPanel() {
    const nodeIds = useSelectionStore((state) => state.selectedNodeIds);
    const graph = useSceneStore((state) => state.graph);
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
                    const raw = common((node) => node.userNodeTransform[field.key]);
                    const value = raw === undefined ? '' : field.degrees ? (raw * 180) / Math.PI : raw;
                    return (
                        <label key={field.key}>
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
                                    dispatchForAll(
                                        nodes.map((node) => ({
                                            type: 'updateNodeTransform',
                                            nodeId: node.id,
                                            transform: { [field.key]: next },
                                        })),
                                        `node-transform:${nodeIds.join(',')}:${field.key}`
                                    );
                                }}
                            />
                        </label>
                    );
                })}
            </div>
            {(['localVisible', 'localLocked'] as const).map((key) => {
                const value = common((node) => node[key]);
                return (
                    <label key={key}>
                        <input
                            type="checkbox"
                            checked={value ?? false}
                            aria-checked={value === undefined ? 'mixed' : value}
                            onChange={(event) =>
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
                                )
                            }
                        />{' '}
                        {key === 'localVisible' ? 'Visible' : 'Locked'} {value === undefined ? '(mixed)' : ''}
                    </label>
                );
            })}
        </section>
    );
}
