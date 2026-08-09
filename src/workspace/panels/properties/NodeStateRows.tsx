import React from 'react';
import type { SceneCommand } from '@state/scene';
import type { SceneNode } from '@state/scene-graph';
import { PropertyControlRow } from './PropertyControlRow';
import { TransformSection } from './TransformSection';

export function NodeStateRows({
    nodes,
    common,
    dispatchForAll,
}: {
    nodes: SceneNode[];
    common: <T>(read: (node: SceneNode) => T) => T | undefined;
    dispatchForAll: (commands: SceneCommand[], mergeKey?: string) => void;
}) {
    return (
        <TransformSection title="Node State">
            {(['localVisible', 'localLocked'] as const).map((key) => {
                const value = common((node) => node[key]);
                return (
                    <PropertyControlRow key={key} label={key === 'localVisible' ? 'Visible' : 'Locked'}>
                        <input
                            type="checkbox"
                            checked={value ?? false}
                            ref={(input) => {
                                if (input) input.indeterminate = value === undefined;
                            }}
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
                        />
                    </PropertyControlRow>
                );
            })}
        </TransformSection>
    );
}
