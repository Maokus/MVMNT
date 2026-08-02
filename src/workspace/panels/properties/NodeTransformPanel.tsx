import React, { useCallback } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import type { NodeTransform } from '@state/scene-graph';

const fields: Array<{ key: keyof NodeTransform; label: string; step: number; degrees?: boolean }> = [
    { key: 'translationX', label: 'X', step: 1 },
    { key: 'translationY', label: 'Y', step: 1 },
    { key: 'rotation', label: 'Rotation', step: 1, degrees: true },
    { key: 'uniformScale', label: 'Scale', step: 0.01 },
    { key: 'pivotX', label: 'Pivot X', step: 1 },
    { key: 'pivotY', label: 'Pivot Y', step: 1 },
];

export function NodeTransformPanel({ elementId }: { elementId: string }) {
    const nodeId = useSceneStore(useCallback((state) => state.nodeIdByElementId[elementId], [elementId]));
    const node = useSceneStore(useCallback((state) => (nodeId ? state.graph.nodesById[nodeId] : undefined), [nodeId]));
    if (!node || node.kind !== 'element') return null;

    const update = (key: keyof NodeTransform, displayValue: number, degrees = false) => {
        const value = degrees ? (displayValue * Math.PI) / 180 : displayValue;
        dispatchSceneCommand(
            { type: 'updateNodeTransform', nodeId: node.id, transform: { [key]: value } },
            { source: 'NodeTransformPanel', mergeKey: `node-transform:${node.id}:${key}` }
        );
    };

    return (
        <section className="property-group node-transform-panel" aria-label="Host transform">
            <h3>Transform (host)</h3>
            <p className="property-description">Applied before the element’s content transform.</p>
            <div className="property-grid">
                {fields.map((field) => {
                    const raw = node.userNodeTransform[field.key];
                    const value = field.degrees ? (raw * 180) / Math.PI : raw;
                    return (
                        <label key={field.key}>
                            <span>{field.label}</span>
                            <input
                                type="number"
                                step={field.step}
                                value={Number(value.toFixed(4))}
                                onChange={(event) => update(field.key, Number(event.target.value), field.degrees)}
                            />
                        </label>
                    );
                })}
            </div>
            <label>
                <input
                    type="checkbox"
                    checked={node.localVisible}
                    onChange={(event) =>
                        dispatchSceneCommand(
                            { type: 'setNodeVisibility', nodeId: node.id, visible: event.target.checked },
                            { source: 'NodeTransformPanel' }
                        )
                    }
                />{' '}
                Visible
            </label>
            <label>
                <input
                    type="checkbox"
                    checked={node.localLocked}
                    onChange={(event) =>
                        dispatchSceneCommand(
                            { type: 'setNodeLocked', nodeId: node.id, locked: event.target.checked },
                            { source: 'NodeTransformPanel' }
                        )
                    }
                />{' '}
                Locked
            </label>
        </section>
    );
}
