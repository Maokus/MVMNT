import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    FaChevronDown,
    FaChevronRight,
    FaClone,
    FaEye,
    FaEyeSlash,
    FaFolder,
    FaLayerGroup,
    FaLock,
    FaObjectGroup,
    FaObjectUngroup,
    FaPen,
    FaShapes,
    FaTrash,
    FaUnlock,
} from 'react-icons/fa';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { dispatchSceneCommand } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import {
    isNodeAncestor,
    isNodeEffectivelyLocked,
    normalizeNodeSelection,
    type SceneGraphState,
    type SceneNode,
} from '@state/scene-graph';

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
    return { parentId: node.parentId, targetIndex: canonicalIndex + (position === 'before' ? 1 : 0) };
}

function visibleRows(graph: SceneGraphState, expanded: Record<string, boolean>): string[] {
    const root = graph.nodesById[graph.rootId];
    if (!root || !('children' in root)) return [];
    const result: string[] = [];
    const stack = [...root.children];
    while (stack.length) {
        const id = stack.pop()!;
        const node = graph.nodesById[id];
        if (!node) continue;
        result.push(id);
        if (node.kind === 'group' && expanded[id] !== false) stack.push(...node.children);
    }
    return result;
}

function hasSelectedDescendant(graph: SceneGraphState, nodeId: string, selected: readonly string[]) {
    return selected.some((id) => isNodeAncestor(graph, nodeId, id));
}

interface NodeRowProps {
    graph: SceneGraphState;
    node: SceneNode;
    siblingIds: string[];
    depth: number;
}

export function NodeRow({ graph, node, siblingIds, depth }: NodeRowProps) {
    const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
    const activeNodeId = useSelectionStore((state) => state.activeNodeId);
    const expandedNodeIds = useSelectionStore((state) => state.expandedNodeIds);
    const toggleNodeExpanded = useSelectionStore((state) => state.toggleNodeExpanded);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
    const [renameValue, setRenameValue] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const renameRef = useRef<HTMLInputElement>(null);
    const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const {
        selectNode,
        groupSelectedNodes,
        ungroupSelectedNodes,
        duplicateSelectedNodes,
        deleteSelectedNodes,
        reparentSelectedNodes,
        updateElementId,
    } = useSceneSelection();
    const rowLabel = node.kind === 'element' ? node.elementId : node.name;
    const expanded = node.kind === 'group' && expandedNodeIds[node.id] !== false;
    const selected = selectedNodeIds.includes(node.id);
    const active = activeNodeId === node.id;
    const descendantSelected = node.kind === 'group' && hasSelectedDescendant(graph, node.id, selectedNodeIds);
    const effectivelyLocked = isNodeEffectivelyLocked(graph, node.id);
    const inheritedLocked = effectivelyLocked && !node.localLocked;
    const contextSelection = normalizeNodeSelection(graph, selectedNodeIds);
    const contextCanGroup =
        contextSelection.length >= 2 &&
        new Set(contextSelection.map((id) => graph.nodesById[id]?.parentId)).size === 1 &&
        contextSelection.every((id) => !isNodeEffectivelyLocked(graph, id));

    const isRenaming = renameValue !== null;
    useEffect(() => {
        if (isRenaming) {
            renameRef.current?.focus();
            renameRef.current?.select();
        }
    }, [isRenaming]);
    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        window.addEventListener('pointerdown', close);
        return () => window.removeEventListener('pointerdown', close);
    }, [contextMenu]);
    useEffect(
        () => () => {
            if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
        },
        []
    );

    const commitRename = () => {
        const name = renameValue?.trim();
        setRenameValue(null);
        if (!name || name === rowLabel) return;
        if (node.kind === 'element') {
            updateElementId(node.elementId, name);
            return;
        }
        dispatchSceneCommand({ type: 'setNodeName', nodeId: node.id, name }, { source: 'SceneNodeTree.rename' });
    };
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
        const selectedRoots = normalizeNodeSelection(graph, useSelectionStore.getState().selectedNodeIds);
        if (
            effectivelyLocked ||
            selectedRoots.includes(node.id) ||
            selectedRoots.some((id) => isNodeAncestor(graph, id, node.id))
        ) {
            event.dataTransfer.dropEffect = 'none';
            setDropPosition(null);
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
        setDropPosition(
            node.kind === 'group' && ratio > 0.25 && ratio < 0.75 ? 'inside' : ratio <= 0.5 ? 'before' : 'after'
        );
        const scroll = event.currentTarget.closest('.inspector-elements-scroll');
        if (scroll) {
            const scrollRect = scroll.getBoundingClientRect();
            if (event.clientY < scrollRect.top + 24) scroll.scrollTop -= 8;
            if (event.clientY > scrollRect.bottom - 24) scroll.scrollTop += 8;
        }
        if (node.kind === 'group' && !expanded && ratio > 0.25 && ratio < 0.75 && !expandTimerRef.current) {
            expandTimerRef.current = setTimeout(() => {
                toggleNodeExpanded(node.id);
                expandTimerRef.current = null;
            }, 600);
        }
    };
    const drop = (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const target = dropPosition ? resolveTreeDropTarget(node, siblingIds, dropPosition) : null;
        if (target) reparentSelectedNodes(target.parentId, target.targetIndex);
        if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
        setDropPosition(null);
    };

    return (
        <>
            <div
                className={`scene-node-row${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}${descendantSelected ? ' has-selected-descendant' : ''}${dropPosition ? ` drop-${dropPosition}` : ''}`}
                style={{ paddingLeft: `${depth * 14 + 5}px` }}
                role="treeitem"
                tabIndex={active ? 0 : -1}
                aria-selected={selected}
                aria-expanded={node.kind === 'group' ? expanded : undefined}
                draggable={!effectivelyLocked && renameValue === null}
                onClick={select}
                onDoubleClick={(event) => {
                    if ((event.target as Element).closest('button')) return;
                    setRenameValue(rowLabel);
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    if (!selected) selectNode(node.id);
                    setContextMenu({ x: event.clientX, y: event.clientY });
                }}
                onDragStart={(event) => {
                    if (!selected) selectNode(node.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-mvmnt-scene-nodes', node.id);
                }}
                onDragOver={updateDropPosition}
                onDragLeave={() => {
                    setDropPosition(null);
                    if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
                    expandTimerRef.current = null;
                }}
                onDrop={drop}
            >
                {node.kind === 'group' ? (
                    <button
                        className="scene-node-disclosure"
                        aria-label={expanded ? 'Collapse group' : 'Expand group'}
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleNodeExpanded(node.id);
                        }}
                    >
                        {expanded ? <FaChevronDown /> : <FaChevronRight />}
                    </button>
                ) : (
                    <span className="scene-node-disclosure" aria-hidden="true" />
                )}
                <span className="scene-node-kind" aria-hidden="true">
                    {node.kind === 'group' ? <FaFolder /> : <FaShapes />}
                </span>
                {renameValue !== null ? (
                    <input
                        ref={renameRef}
                        className="scene-node-rename"
                        value={renameValue}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                            if (event.key === 'Escape') {
                                setRenameValue(null);
                                event.stopPropagation();
                            }
                        }}
                    />
                ) : (
                    <span className="scene-node-name" title={rowLabel}>
                        {rowLabel}
                    </span>
                )}
                <span className="scene-node-type">{node.kind === 'group' ? 'Group' : 'Element'}</span>
                <button
                    className={`scene-node-action${node.localVisible ? ' is-on' : ''}`}
                    aria-label={node.localVisible ? `Hide ${node.name}` : `Show ${node.name}`}
                    title={node.localVisible ? 'Hide' : 'Show'}
                    onClick={(event) => {
                        event.stopPropagation();
                        command('visible');
                    }}
                >
                    {node.localVisible ? <FaEye /> : <FaEyeSlash />}
                </button>
                <button
                    className={`scene-node-action${node.localLocked ? ' is-on' : ''}`}
                    aria-label={node.localLocked ? `Unlock ${node.name}` : `Lock ${node.name}`}
                    title={inheritedLocked ? 'Locked by parent' : node.localLocked ? 'Unlock' : 'Lock'}
                    disabled={inheritedLocked}
                    onClick={(event) => {
                        event.stopPropagation();
                        command('locked');
                    }}
                >
                    {effectivelyLocked ? <FaLock /> : <FaUnlock />}
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
            {contextMenu
                ? createPortal(
                      <div
                          className="scene-node-context-menu"
                          role="menu"
                          style={{ left: contextMenu.x, top: contextMenu.y }}
                          onPointerDown={(event) => event.stopPropagation()}
                      >
                          <button
                              role="menuitem"
                              onClick={() => {
                                  setRenameValue(rowLabel);
                                  setContextMenu(null);
                              }}
                          >
                              <FaPen /> Rename
                          </button>
                          {selectedNodeIds.length >= 2 ? (
                              <button
                                  role="menuitem"
                                  disabled={!contextCanGroup}
                                  onClick={() => (groupSelectedNodes(), setContextMenu(null))}
                              >
                                  <FaObjectGroup /> Group selection
                              </button>
                          ) : null}
                          {node.kind === 'group' ? (
                              <button role="menuitem" onClick={() => (ungroupSelectedNodes(), setContextMenu(null))}>
                                  <FaObjectUngroup /> Ungroup
                              </button>
                          ) : null}
                          <button
                              role="menuitem"
                              disabled={effectivelyLocked}
                              onClick={() => (duplicateSelectedNodes(), setContextMenu(null))}
                          >
                              <FaClone /> Duplicate
                          </button>
                          <div className="scene-node-context-divider" />
                          <button
                              role="menuitem"
                              className="is-danger"
                              disabled={effectivelyLocked}
                              onClick={() => (deleteSelectedNodes(), setContextMenu(null))}
                          >
                              <FaTrash /> Delete
                          </button>
                      </div>,
                      document.body
                  )
                : null}
        </>
    );
}

export function SceneNodeTree() {
    const graph = useSceneStore((state) => state.graph);
    const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
    const activeNodeId = useSelectionStore((state) => state.activeNodeId);
    const expandedNodeIds = useSelectionStore((state) => state.expandedNodeIds);
    const { groupSelectedNodes, ungroupSelectedNodes, duplicateSelectedNodes, deleteSelectedNodes, selectNode } =
        useSceneSelection();
    const rows = useMemo(() => {
        const root = graph.nodesById[graph.rootId];
        return root && 'children' in root ? [...root.children].reverse() : [];
    }, [graph]);
    const visible = useMemo(() => visibleRows(graph, expandedNodeIds), [graph, expandedNodeIds]);
    const normalized = normalizeNodeSelection(graph, selectedNodeIds);
    const parents = new Set(normalized.map((id) => graph.nodesById[id]?.parentId));
    const canGroup =
        normalized.length >= 2 && parents.size === 1 && normalized.every((id) => !isNodeEffectivelyLocked(graph, id));
    const canUngroup =
        normalized.length === 1 &&
        graph.nodesById[normalized[0]]?.kind === 'group' &&
        !isNodeEffectivelyLocked(graph, normalized[0]);
    const canEdit = normalized.length > 0 && normalized.every((id) => !isNodeEffectivelyLocked(graph, id));

    const focusActive = () =>
        requestAnimationFrame(() => document.querySelector<HTMLElement>('.scene-node-row.is-active')?.focus());
    const navigate = (event: React.KeyboardEvent) => {
        if (!activeNodeId) return;
        const index = visible.indexOf(activeNodeId);
        const active = graph.nodesById[activeNodeId];
        let target: string | undefined;
        if (event.key === 'ArrowUp') target = visible[index - 1];
        if (event.key === 'ArrowDown') target = visible[index + 1];
        if (event.key === 'Home') target = visible[0];
        if (event.key === 'End') target = visible.at(-1);
        if (event.key === 'ArrowRight' && active?.kind === 'group') {
            if (expandedNodeIds[active.id] === false) useSelectionStore.getState().toggleNodeExpanded(active.id);
            else target = [...active.children].reverse()[0];
        }
        if (event.key === 'ArrowLeft') {
            if (active?.kind === 'group' && expandedNodeIds[active.id] !== false) {
                useSelectionStore.getState().toggleNodeExpanded(active.id);
                event.preventDefault();
                return;
            }
            if (active?.parentId && active.parentId !== graph.rootId) target = active.parentId;
        }
        if (event.key === ' ' && activeNodeId) {
            event.preventDefault();
            selectNode(activeNodeId, { toggle: event.metaKey || event.ctrlKey });
            return;
        }
        if (event.key === 'F2' && activeNodeId) {
            event.preventDefault();
            document
                .querySelector<HTMLElement>(`.scene-node-row.is-active`)
                ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            return;
        }
        if (target) {
            event.preventDefault();
            selectNode(target);
            focusActive();
        }
    };

    return (
        <div className="scene-node-tree" role="tree" aria-label="Scene hierarchy" onKeyDown={navigate}>
            <div className="scene-node-toolbar" role="toolbar" aria-label="Scene hierarchy actions">
                <span className="scene-node-selection-count">
                    {selectedNodeIds.length ? `${selectedNodeIds.length} selected` : 'No selection'}
                </span>
                <button
                    disabled={!canGroup}
                    onClick={groupSelectedNodes}
                    title={canGroup ? 'Group selected siblings (Ctrl/Cmd+G)' : 'Select two or more unlocked siblings'}
                    aria-label="Group selected nodes"
                >
                    <FaObjectGroup />
                </button>
                <button
                    disabled={!canUngroup}
                    onClick={ungroupSelectedNodes}
                    title="Ungroup selected group (Ctrl/Cmd+Shift+G)"
                    aria-label="Ungroup selected group"
                >
                    <FaObjectUngroup />
                </button>
                <button disabled={!canEdit} onClick={duplicateSelectedNodes} title="Duplicate" aria-label="Duplicate">
                    <FaClone />
                </button>
                <button
                    className="is-danger"
                    disabled={!canEdit}
                    onClick={deleteSelectedNodes}
                    title="Delete"
                    aria-label="Delete"
                >
                    <FaTrash />
                </button>
            </div>
            <div className="scene-node-column-hint" aria-hidden="true">
                <FaLayerGroup /> <span>Front</span>
            </div>
            {rows.map((nodeId) => (
                <NodeRow
                    key={nodeId}
                    graph={graph}
                    node={graph.nodesById[nodeId]}
                    siblingIds={(graph.nodesById[graph.rootId] as Extract<SceneNode, { kind: 'root' }>).children}
                    depth={0}
                />
            ))}
        </div>
    );
}
