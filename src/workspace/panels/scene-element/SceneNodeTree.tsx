import React, { useMemo, useState } from 'react';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { isNodeEffectivelyLocked, type SceneGraphState, type SceneNode } from '@state/scene-graph';

export type DropPosition = 'before' | 'inside' | 'after';

export function resolveTreeDropTarget(
    node: SceneNode,
    siblingIds: readonly string[],
    position: DropPosition
): { parentId: string; targetIndex: number } | null {
    if (position === 'inside' && node.kind === 'group') {
        return { parentId: node.id, targetIndex: node.children.length };
    }
    if (!node.parentId) return null;
    const canonicalIndex = siblingIds.indexOf(node.id);
    if (canonicalIndex < 0) return null;
    // The tree is front-to-back, while commands use canonical back-to-front indexes.
    return { parentId: node.parentId, targetIndex: canonicalIndex + (position === 'before' ? 1 : 0) };
}

function visibleRows(graph: SceneGraphState, containerId: string, expanded: Record<string, boolean>): string[] {
    const container = graph.nodesById[containerId];
    if (!container || !('children' in container)) return [];
    const result: string[] = [];
    const stack = [...container.children];
    while (stack.length) {
        const id = stack.pop()!;
        const node = graph.nodesById[id];
        if (!node) continue;
        result.push(id);
        if (node.kind === 'group' && expanded[id] !== false) stack.push(...node.children);
    }
    return result;
}

interface NodeRowProps {
    graph: SceneGraphState;
    node: SceneNode;
    siblingIds: string[];
    depth: number;
}

function NodeRow({ graph, node, siblingIds, depth }: NodeRowProps) {
    const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
    const expandedNodeIds = useSelectionStore((state) => state.expandedNodeIds);
    const toggleNodeExpanded = useSelectionStore((state) => state.toggleNodeExpanded);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
    const {
        selectNode,
        duplicateSelectedNodes,
        deleteSelectedNodes,
        reorderSelectedNodes,
        reparentSelectedNodes,
        enterGroup,
    } = useSceneSelection();
    const expanded = node.kind === 'group' && expandedNodeIds[node.id] !== false;
    const selected = selectedNodeIds.includes(node.id);
    const effectivelyLocked = isNodeEffectivelyLocked(graph, node.id);
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
    const updateDropPosition = (event: React.DragEvent) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
        setDropPosition(
            node.kind === 'group' && ratio > 0.25 && ratio < 0.75 ? 'inside' : ratio <= 0.5 ? 'before' : 'after'
        );
    };
    const drop = (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const target = dropPosition ? resolveTreeDropTarget(node, siblingIds, dropPosition) : null;
        if (target) reparentSelectedNodes(target.parentId, target.targetIndex);
        setDropPosition(null);
    };

    return (
        <>
            <div
                className={`scene-node-row flex items-center gap-1 rounded px-1 py-1 ${selected ? 'bg-[#1177bb] text-white' : ''} ${dropPosition ? `drop-${dropPosition}` : ''}`}
                style={{
                    paddingLeft: `${depth * 14 + 4}px`,
                    borderTop: dropPosition === 'before' ? '2px solid #1177bb' : undefined,
                    borderBottom: dropPosition === 'after' ? '2px solid #1177bb' : undefined,
                    outline: dropPosition === 'inside' ? '2px solid #1177bb' : undefined,
                }}
                role="treeitem"
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                aria-expanded={node.kind === 'group' ? expanded : undefined}
                draggable={!effectivelyLocked}
                onClick={select}
                onDoubleClick={() => node.kind === 'group' && enterGroup(node.id)}
                onDragStart={(event) => {
                    if (!selected) selectNode(node.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-mvmnt-scene-nodes', node.id);
                }}
                onDragOver={updateDropPosition}
                onDragLeave={() => setDropPosition(null)}
                onDrop={drop}
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
                    disabled={effectivelyLocked || canonicalIndex === siblingIds.length - 1}
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
                    disabled={effectivelyLocked || canonicalIndex === 0}
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
                    disabled={effectivelyLocked}
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
                    disabled={effectivelyLocked}
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
                              graph={graph}
                              node={graph.nodesById[childId]}
                              siblingIds={node.children}
                              depth={depth + 1}
                          />
                      ))
                : null}
        </>
    );
}

export function SceneNodeTree() {
    const graph = useSceneStore((state) => state.graph);
    const expandedNodeIds = useSelectionStore((state) => state.expandedNodeIds);
    const setEditingContainerId = useSelectionStore((state) => state.setEditingContainerId);
    const {
        groupSelectedNodes,
        ungroupSelectedNodes,
        enterGroup,
        exitGroup,
        editingContainerId,
        activeNodeId,
        selectNode,
    } = useSceneSelection();
    const editing = graph.nodesById[editingContainerId];
    const rows = useMemo(() => (editing && 'children' in editing ? [...editing.children].reverse() : []), [editing]);
    const visible = useMemo(
        () => visibleRows(graph, editingContainerId, expandedNodeIds),
        [graph, editingContainerId, expandedNodeIds]
    );
    const breadcrumbs = useMemo(() => {
        const ids: string[] = [];
        let id: string | null = editingContainerId;
        while (id) {
            ids.push(id);
            id = graph.nodesById[id]?.parentId ?? null;
        }
        return ids.reverse();
    }, [editingContainerId, graph]);

    const navigate = (event: React.KeyboardEvent) => {
        if (!activeNodeId) return;
        const index = visible.indexOf(activeNodeId);
        let target: string | undefined;
        if (event.key === 'ArrowUp') target = visible[index - 1];
        if (event.key === 'ArrowDown') target = visible[index + 1];
        if (event.key === 'Home') target = visible[0];
        if (event.key === 'End') target = visible.at(-1);
        const active = graph.nodesById[activeNodeId];
        if (event.key === 'ArrowRight' && active?.kind === 'group') {
            if (expandedNodeIds[active.id] === false) useSelectionStore.getState().toggleNodeExpanded(active.id);
            else enterGroup(active.id);
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowLeft') {
            if (active?.kind === 'group' && expandedNodeIds[active.id] !== false) {
                useSelectionStore.getState().toggleNodeExpanded(active.id);
            } else if (active?.parentId && active.parentId !== editingContainerId) {
                selectNode(active.parentId);
            } else if (editingContainerId !== graph.rootId) {
                exitGroup();
            }
            event.preventDefault();
            return;
        }
        if (target) {
            event.preventDefault();
            selectNode(target);
            requestAnimationFrame(() =>
                document.querySelector<HTMLElement>(`[role="treeitem"][aria-selected="true"]`)?.focus()
            );
        }
    };

    return (
        <div className="scene-node-tree" role="tree" aria-label="Scene hierarchy" onKeyDown={navigate}>
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
            <nav className="mb-2 flex flex-wrap gap-1 text-xs" aria-label="Scene group path">
                {breadcrumbs.map((id, index) => (
                    <React.Fragment key={id}>
                        {index ? <span>/</span> : null}
                        <button onClick={() => setEditingContainerId(id)}>{graph.nodesById[id]?.name ?? id}</button>
                    </React.Fragment>
                ))}
            </nav>
            <p className="mb-2 text-xs opacity-70">
                Frontmost nodes are shown first. Drag before, inside, or after a row to move subtrees.
            </p>
            {rows.map((nodeId) => (
                <NodeRow
                    key={nodeId}
                    graph={graph}
                    node={graph.nodesById[nodeId]}
                    siblingIds={(editing as any).children}
                    depth={0}
                />
            ))}
        </div>
    );
}
