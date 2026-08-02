import React, { useMemo } from 'react';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import type { SceneNode } from '@state/scene-graph';

function NodeRow({ node, siblingIds, depth }: { node: SceneNode; siblingIds: string[]; depth: number }) {
    const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
    const expandedNodeIds = useSelectionStore((state) => state.expandedNodeIds);
    const toggleNodeExpanded = useSelectionStore((state) => state.toggleNodeExpanded);
    const { selectNode, duplicateSelectedNodes, deleteSelectedNodes, reorderSelectedNodes, enterGroup } =
        useSceneSelection();
    const expanded = node.kind === 'group' && expandedNodeIds[node.id] !== false;
    const selected = selectedNodeIds.includes(node.id);
    const canonicalIndex = siblingIds.indexOf(node.id);

    const select = (event: React.MouseEvent) => {
        selectNode(node.id, {
            toggle: event.metaKey || event.ctrlKey,
            range: event.shiftKey,
            siblingIds: [...siblingIds].reverse(),
        });
    };
    const command = (type: 'visible' | 'locked') => {
        dispatchSceneCommand(
            type === 'visible'
                ? { type: 'setNodeVisibility', nodeId: node.id, visible: !node.localVisible }
                : { type: 'setNodeLocked', nodeId: node.id, locked: !node.localLocked },
            { source: 'SceneNodeTree' }
        );
    };

    return (
        <>
            <div
                className={`scene-node-row flex items-center gap-1 rounded px-1 py-1 ${selected ? 'bg-[#1177bb] text-white' : ''}`}
                style={{ paddingLeft: `${depth * 14 + 4}px` }}
                role="treeitem"
                aria-selected={selected}
                aria-expanded={node.kind === 'group' ? expanded : undefined}
                onClick={select}
                onDoubleClick={() => node.kind === 'group' && enterGroup(node.id)}
            >
                {node.kind === 'group' ? (
                    <button
                        aria-label={expanded ? 'Collapse group' : 'Expand group'}
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleNodeExpanded(node.id);
                        }}
                    >
                        {expanded ? '▾' : '▸'}
                    </button>
                ) : (
                    <span className="w-4" />
                )}
                <span className="min-w-0 flex-1 truncate" title={node.name}>
                    {node.kind === 'group' ? 'Group: ' : ''}
                    {node.name}
                </span>
                <button
                    aria-label="Toggle visibility"
                    onClick={(event) => (event.stopPropagation(), command('visible'))}
                >
                    {node.localVisible ? '◉' : '○'}
                </button>
                <button aria-label="Toggle lock" onClick={(event) => (event.stopPropagation(), command('locked'))}>
                    {node.localLocked ? '🔒' : '🔓'}
                </button>
                <button
                    aria-label="Move toward front"
                    disabled={canonicalIndex === siblingIds.length - 1}
                    onClick={(event) => {
                        event.stopPropagation();
                        selectNode(node.id);
                        reorderSelectedNodes(node.parentId!, canonicalIndex + 2);
                    }}
                >
                    ↑
                </button>
                <button
                    aria-label="Move toward back"
                    disabled={canonicalIndex === 0}
                    onClick={(event) => {
                        event.stopPropagation();
                        selectNode(node.id);
                        reorderSelectedNodes(node.parentId!, canonicalIndex - 1);
                    }}
                >
                    ↓
                </button>
                <button
                    aria-label="Duplicate node"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (!selected) selectNode(node.id);
                        duplicateSelectedNodes();
                    }}
                >
                    ⧉
                </button>
                <button
                    aria-label="Delete node"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (!selected) selectNode(node.id);
                        deleteSelectedNodes();
                    }}
                >
                    ×
                </button>
            </div>
            {node.kind === 'group' && expanded
                ? [...node.children]
                      .reverse()
                      .map((childId) => (
                          <NodeRow
                              key={childId}
                              node={useSceneStore.getState().graph.nodesById[childId]}
                              siblingIds={node.children}
                              depth={depth + 1}
                          />
                      ))
                : null}
        </>
    );
}

export default function SceneNodeTree() {
    const graph = useSceneStore((state) => state.graph);
    const { groupSelectedNodes, ungroupSelectedNodes, enterGroup, exitGroup, editingContainerId, activeNodeId } =
        useSceneSelection();
    const root = graph.nodesById[graph.rootId];
    const editing = graph.nodesById[editingContainerId];
    const rows = useMemo(() => (root && 'children' in root ? [...root.children].reverse() : []), [root]);

    return (
        <div className="scene-node-tree" role="tree" aria-label="Scene hierarchy">
            <div className="mb-2 flex flex-wrap gap-1">
                <button onClick={groupSelectedNodes}>Group</button>
                <button onClick={ungroupSelectedNodes}>Ungroup</button>
                <button disabled={!activeNodeId} onClick={() => activeNodeId && enterGroup(activeNodeId)}>
                    Enter
                </button>
                <button disabled={editingContainerId === graph.rootId} onClick={exitGroup}>
                    Exit
                </button>
            </div>
            {editingContainerId !== graph.rootId ? (
                <button className="mb-2 text-left text-xs" onClick={exitGroup}>
                    Scene / {editing?.name ?? 'Group'}
                </button>
            ) : null}
            <p className="mb-2 text-xs opacity-70">
                Frontmost nodes are shown first. Grouping can change intervening stacking.
            </p>
            {rows.map((nodeId) => (
                <NodeRow key={nodeId} node={graph.nodesById[nodeId]} siblingIds={(root as any).children} depth={0} />
            ))}
        </div>
    );
}
