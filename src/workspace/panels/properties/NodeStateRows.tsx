import React from 'react';
import type { SceneCommand } from '@state/scene';
import type { SceneNode } from '@state/scene-graph';
import { PropertyControlRow } from './PropertyControlRow';
import { TransformSection } from './TransformSection';
import { propertyVisibleForSearch, sectionVisibleForSearch } from './propertySearch';

const SECTION_TITLE = 'Node State';
const NODE_STATE_FIELDS = [
    { key: 'localVisible', label: 'Visible' },
    { key: 'localLocked', label: 'Locked' },
] as const;

export function NodeStateRows({
    nodes,
    common,
    dispatchForAll,
    searchTerm = '',
}: {
    nodes: SceneNode[];
    common: <T>(read: (node: SceneNode) => T) => T | undefined;
    dispatchForAll: (commands: SceneCommand[], mergeKey?: string) => void;
    searchTerm?: string;
}) {
    if (
        !sectionVisibleForSearch(
            searchTerm,
            SECTION_TITLE,
            NODE_STATE_FIELDS.map((field) => field.label)
        )
    )
        return null;

    return (
        <TransformSection title={SECTION_TITLE}>
            {NODE_STATE_FIELDS.filter(({ key, label }) =>
                propertyVisibleForSearch(searchTerm, SECTION_TITLE, label, key)
            ).map(({ key, label }) => {
                const value = common((node) => node[key]);
                return (
                    <PropertyControlRow key={key} label={label}>
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
