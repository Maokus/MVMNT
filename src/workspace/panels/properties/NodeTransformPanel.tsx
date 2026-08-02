import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaLink } from 'react-icons/fa';
import { nodePropertyTarget, createKeyframe } from '@automation/types';
import { automationEvaluator } from '@automation/automation-evaluator';
import { useSceneSelection } from '@context/SceneSelectionContext';
import FormInput, { type FormInputChange } from '@workspace/forms/inputs/FormInput';
import { useSceneStore } from '@state/sceneStore';
import { useSelectionStore } from '@state/selectionStore';
import { dispatchSceneCommand, type SceneCommand } from '@state/scene';
import {
    matrixAroundPoint,
    matrixToNodeTransform,
    nodeTransformToMatrix,
    rotationMatrix,
    scaleMatrix,
    translationMatrix,
    type NodeTransform,
    type SceneNode,
} from '@state/scene-graph';
import { HOST_NODE_PROPERTY_SCHEMA } from '@state/scene/nodePropertySchema';
import { useTimelineStore } from '@state/timelineStore';
import KeyframeControl from './KeyframeControl';
import { PropertyControlRow } from './PropertyControlRow';

const fields = HOST_NODE_PROPERTY_SCHEMA.filter(
    (field): field is (typeof HOST_NODE_PROPERTY_SCHEMA)[number] & { path: keyof NodeTransform } =>
        field.path !== 'localVisible'
);

function valueOf(change: unknown): unknown {
    return change && typeof change === 'object' && 'value' in change ? (change as FormInputChange).value : change;
}

interface TransformRowProps {
    label: string;
    id: string;
    value: number;
    schema?: Record<string, unknown>;
    suffix?: string;
    readOnly?: boolean;
    mixed?: boolean;
    onChange?: (value: number, change?: FormInputChange) => void;
    automation?: React.ReactNode;
    macro?: React.ReactNode;
}

function TransformRow({
    label,
    id,
    value,
    schema,
    suffix,
    readOnly,
    mixed,
    onChange,
    automation,
    macro,
}: TransformRowProps) {
    return (
        <PropertyControlRow
            label={suffix ? `${label} (${suffix})` : label}
            animationControl={automation}
            macroControl={macro}
        >
            {mixed ? (
                <input className="node-transform-mixed" value="" placeholder="Mixed" readOnly />
            ) : (
                <FormInput
                    id={id}
                    type="number"
                    value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
                    schema={schema ?? { step: 1 }}
                    disabled={readOnly}
                    onChange={(change) => {
                        const next = Number(valueOf(change));
                        if (Number.isFinite(next)) onChange?.(next, change as FormInputChange);
                    }}
                />
            )}
        </PropertyControlRow>
    );
}

function NodeMacroControl({
    path,
    bindingMacroId,
    macros,
    options,
    onAssign,
}: {
    path: string;
    bindingMacroId?: string;
    macros: ReturnType<typeof useSceneStore.getState>['macros'];
    options: string[];
    onAssign: (macroId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    return (
        <div ref={rootRef} className="ae-macro-assignment">
            <button
                type="button"
                className={`ae-macro-trigger${bindingMacroId ? ' assigned' : ''}`}
                title={
                    bindingMacroId ? `Macro: ${macros.byId[bindingMacroId]?.name ?? bindingMacroId}` : 'Assign macro'
                }
                aria-label={`${path} macro`}
                onClick={() => setOpen((value) => !value)}
            >
                <span className="ae-macro-label-text">
                    {bindingMacroId ? `🎵 ${macros.byId[bindingMacroId]?.name ?? bindingMacroId}` : <FaLink />}
                </span>
                {(options.length > 0 || bindingMacroId) && <span className="ae-macro-caret">▼</span>}
            </button>
            {open ? (
                <div className="ae-macro-menu">
                    <div className="ae-macro-options">
                        {options.map((id) => (
                            <button
                                key={id}
                                type="button"
                                className="ae-macro-option"
                                onClick={() => {
                                    onAssign(id);
                                    setOpen(false);
                                }}
                            >
                                {macros.byId[id]?.name ?? id}
                            </button>
                        ))}
                        {bindingMacroId ? (
                            <>
                                <div className="ae-macro-divider" />
                                <button
                                    type="button"
                                    className="ae-macro-option danger"
                                    onClick={() => {
                                        onAssign('');
                                        setOpen(false);
                                    }}
                                >
                                    Remove Macro
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function TransformSection({ title, children }: { title: string; children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <section className="ae-property-group">
            <button
                type="button"
                className="ae-group-header"
                onClick={() => setCollapsed((value) => !value)}
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title} group`}
            >
                <span className={`ae-collapse-trigger ${collapsed ? 'collapsed' : 'expanded'}`} aria-hidden="true">
                    <span className={`ae-collapse-icon ${collapsed ? 'collapsed' : 'expanded'}`}>▼</span>
                </span>
                <div className="ae-group-meta">
                    <div className="ae-group-title-row">
                        <span className="ae-group-label">{title}</span>
                    </div>
                </div>
            </button>
            {!collapsed ? <div className="ae-property-list">{children}</div> : null}
        </section>
    );
}

export function NodeTransformPanel() {
    const nodeIds = useSelectionStore((state) => state.selectedNodeIds);
    const selectionPivot = useSelectionStore((state) => state.selectionPivot);
    const setSelectionPivot = useSelectionStore((state) => state.setSelectionPivot);
    const graph = useSceneStore((state) => state.graph);
    const nodeBindings = useSceneStore((state) => state.nodeBindings);
    const macros = useSceneStore((state) => state.macros);
    const tick = useTimelineStore((state) => state.timeline.currentTick);
    const autoKeying = useTimelineStore((state) => state.transport.autoKeying);
    const { visualizer } = useSceneSelection();
    const nodes = nodeIds.map((id) => graph.nodesById[id]).filter(Boolean);
    const geometry = useMemo(
        () => visualizer?.getNodeSelectionAtTime?.(nodeIds, visualizer.getCurrentTime?.() ?? 0) ?? null,
        [visualizer, nodeIds, graph.revision]
    );
    if (!nodes.length) return null;

    const singleNode = nodes.length === 1 ? nodes[0] : null;
    const pivot = selectionPivot ?? geometry?.pivot ?? { x: 0, y: 0 };
    const dispatchForAll = (commands: SceneCommand[], mergeKey?: string, change?: FormInputChange) => {
        const session = change?.meta?.mergeSession;
        return dispatchSceneCommand(commands.length === 1 ? commands[0] : { type: 'batch', commands }, {
            source: 'NodeTransformPanel',
            mergeKey: session && mergeKey ? `${mergeKey}:${session.id}` : mergeKey,
            transient: session ? !session.finalize : undefined,
        });
    };
    const common = <T,>(read: (node: (typeof nodes)[number]) => T): T | undefined => {
        const first = read(nodes[0]);
        return nodes.every((node) => Object.is(read(node), first)) ? first : undefined;
    };
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
    const updateAnimatedValue = (nodeId: string, path: string, value: unknown, change?: FormInputChange) => {
        const session = change?.meta?.mergeSession;
        const binding = useSceneStore.getState().nodeBindings[nodeId]?.[path];
        if (binding?.type === 'keyframes') {
            if (autoKeying) {
                dispatchSceneCommand(
                    { type: 'addKeyframe', channelId: binding.channelId, keyframe: createKeyframe(tick, value) },
                    {
                        source: 'NodeTransformPanel',
                        mergeKey: `node-keyframe:${nodeId}:${path}${session ? `:${session.id}` : ''}`,
                        transient: session ? !session.finalize : undefined,
                    }
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
                {
                    source: 'NodeTransformPanel',
                    mergeKey: `node-binding:${nodeId}:${path}${session ? `:${session.id}` : ''}`,
                    transient: session ? !session.finalize : undefined,
                }
            );
            return true;
        }
        return false;
    };
    const macroOptions = (type: 'number' | 'boolean') => macros.allIds.filter((id) => macros.byId[id]?.type === type);
    const applyWorldDelta = (
        matrix: ReturnType<typeof translationMatrix>,
        mergeKey: string,
        change?: FormInputChange
    ) => {
        const session = change?.meta?.mergeSession;
        return dispatchSceneCommand(
            { type: 'transformNodes', nodeIds, worldDelta: matrix },
            {
                source: 'NodeTransformPanel.aggregate',
                mergeKey: session ? `${mergeKey}:${session.id}` : mergeKey,
                transient: session ? !session.finalize : undefined,
            }
        );
    };

    if (!singleNode && !geometry) {
        return (
            <div className="node-transform-inspector ae-style">
                <div className="node-transform-identity">
                    <span>{nodes.length} nodes selected</span>
                    <small>No visible bounds</small>
                </div>
                <p className="node-transform-empty-geometry">
                    Show at least one selected node to use aggregate position, rotation, scale, and pivot controls.
                </p>
                <NodeStateRows nodes={nodes} common={common} dispatchForAll={dispatchForAll} />
            </div>
        );
    }

    if (!singleNode && geometry) {
        return (
            <div className="node-transform-inspector ae-style">
                <div className="node-transform-identity">
                    <span>{nodes.length} nodes selected</span>
                    <small>World selection</small>
                </div>
                <TransformSection title="Position & Bounds">
                    <TransformRow
                        label="X"
                        id="node-selection-x"
                        value={geometry.pivot.x}
                        onChange={(next, change) =>
                            applyWorldDelta(
                                translationMatrix(next - geometry.pivot.x, 0),
                                `selection-x:${nodeIds.join(',')}`,
                                change
                            )
                        }
                    />
                    <TransformRow
                        label="Y"
                        id="node-selection-y"
                        value={geometry.pivot.y}
                        onChange={(next, change) =>
                            applyWorldDelta(
                                translationMatrix(0, next - geometry.pivot.y),
                                `selection-y:${nodeIds.join(',')}`,
                                change
                            )
                        }
                    />
                    <TransformRow label="Width" id="node-selection-width" value={geometry.bounds.width} readOnly />
                    <TransformRow label="Height" id="node-selection-height" value={geometry.bounds.height} readOnly />
                </TransformSection>
                <TransformSection title="Rotation & Scale">
                    <TransformRow
                        key={`rotation-${graph.revision}`}
                        label="Rotate by"
                        id="node-selection-rotation"
                        value={0}
                        suffix="°"
                        onChange={(degrees, change) =>
                            applyWorldDelta(
                                matrixAroundPoint(rotationMatrix((degrees * Math.PI) / 180), pivot.x, pivot.y),
                                `selection-rotation:${nodeIds.join(',')}`,
                                change
                            )
                        }
                    />
                    <TransformRow
                        key={`scale-${graph.revision}`}
                        label="Scale by"
                        id="node-selection-scale"
                        value={100}
                        suffix="%"
                        schema={{ step: 1, min: 0.1 }}
                        onChange={(percent, change) =>
                            applyWorldDelta(
                                matrixAroundPoint(scaleMatrix(Math.max(0.001, percent / 100)), pivot.x, pivot.y),
                                `selection-scale:${nodeIds.join(',')}`,
                                change
                            )
                        }
                    />
                </TransformSection>
                <TransformSection title="Selection Pivot">
                    <TransformRow
                        label="Pivot X"
                        id="node-selection-pivot-x"
                        value={pivot.x}
                        onChange={(x) => setSelectionPivot({ x, y: pivot.y })}
                    />
                    <TransformRow
                        label="Pivot Y"
                        id="node-selection-pivot-y"
                        value={pivot.y}
                        onChange={(y) => setSelectionPivot({ x: pivot.x, y })}
                    />
                </TransformSection>
                <NodeStateRows nodes={nodes} common={common} dispatchForAll={dispatchForAll} />
            </div>
        );
    }

    return (
        <div className="node-transform-inspector ae-style">
            <div className="node-transform-identity">
                <input
                    aria-label="Node name"
                    value={nodes[0].name}
                    onChange={(event) =>
                        dispatchSceneCommand(
                            { type: 'setNodeName', nodeId: nodes[0].id, name: event.target.value },
                            { source: 'NodeTransformPanel', mergeKey: `node-name:${nodes[0].id}` }
                        )
                    }
                />
                <small>{nodes[0].kind === 'group' ? 'Group · Local transform' : 'Element · Local transform'}</small>
            </div>
            {(['translationX', 'translationY'] as const).map((path, index) => {
                const raw = Number(valueFor(path, nodes[0].userNodeTransform[path]));
                return index === 0 ? (
                    <TransformSection key="position" title="Position">
                        {renderSingleField('translationX', raw)}
                        {renderSingleField(
                            'translationY',
                            Number(valueFor('translationY', nodes[0].userNodeTransform.translationY))
                        )}
                    </TransformSection>
                ) : null;
            })}
            <TransformSection title="Rotation & Scale">
                {renderSingleField('rotation', Number(valueFor('rotation', nodes[0].userNodeTransform.rotation)))}
                {renderSingleField(
                    'uniformScale',
                    Number(valueFor('uniformScale', nodes[0].userNodeTransform.uniformScale))
                )}
            </TransformSection>
            <TransformSection title="Pivot">
                {renderSingleField('pivotX', Number(valueFor('pivotX', nodes[0].userNodeTransform.pivotX)))}
                {renderSingleField('pivotY', Number(valueFor('pivotY', nodes[0].userNodeTransform.pivotY)))}
            </TransformSection>
            <TransformSection title="Node State">
                <PropertyControlRow
                    label="Visible"
                    animationControl={
                        <BindingControls
                            path="localVisible"
                            raw={Boolean(valueFor('localVisible', nodes[0].localVisible))}
                            type="boolean"
                        />
                    }
                    macroControl={macroControlFor(
                        'localVisible',
                        Boolean(valueFor('localVisible', nodes[0].localVisible)),
                        'boolean'
                    )}
                >
                    <FormInput
                        id={`node-${nodes[0].id}-visible`}
                        type="boolean"
                        value={Boolean(valueFor('localVisible', nodes[0].localVisible))}
                        schema={{}}
                        onChange={(value) => {
                            const visible = Boolean(valueOf(value));
                            if (updateAnimatedValue(nodes[0].id, 'localVisible', visible)) return;
                            dispatchForAll([{ type: 'setNodeVisibility', nodeId: nodes[0].id, visible }]);
                        }}
                    />
                </PropertyControlRow>
                <PropertyControlRow label="Locked">
                    <FormInput
                        id={`node-${nodes[0].id}-locked`}
                        type="boolean"
                        value={nodes[0].localLocked}
                        schema={{}}
                        onChange={(value) =>
                            dispatchForAll([
                                { type: 'setNodeLocked', nodeId: nodes[0].id, locked: Boolean(valueOf(value)) },
                            ])
                        }
                    />
                </PropertyControlRow>
            </TransformSection>
        </div>
    );

    function renderSingleField(path: keyof NodeTransform, raw: number) {
        const field = fields.find((candidate) => candidate.path === path)!;
        const display = field.degrees ? (raw * 180) / Math.PI : path === 'uniformScale' ? raw * 100 : raw;
        return (
            <TransformRow
                label={field.label}
                id={`node-${nodes[0].id}-${path}`}
                value={display}
                suffix={field.degrees ? '°' : path === 'uniformScale' ? '%' : undefined}
                schema={{
                    step: path === 'uniformScale' ? 1 : field.step,
                    ...(path === 'uniformScale' ? { min: 0.1 } : {}),
                }}
                automation={<BindingControls path={path} raw={raw} type="number" />}
                macro={macroControlFor(path, raw, 'number')}
                onChange={(displayValue, change) => {
                    const next = field.degrees
                        ? (displayValue * Math.PI) / 180
                        : path === 'uniformScale'
                          ? Math.max(0.001, displayValue / 100)
                          : displayValue;
                    if (
                        (path === 'pivotX' || path === 'pivotY') &&
                        !nodeBindings[nodes[0].id]?.pivotX &&
                        !nodeBindings[nodes[0].id]?.pivotY &&
                        !nodeBindings[nodes[0].id]?.translationX &&
                        !nodeBindings[nodes[0].id]?.translationY
                    ) {
                        const original = nodes[0].userNodeTransform;
                        const preserved = matrixToNodeTransform(
                            nodeTransformToMatrix(original),
                            path === 'pivotX' ? next : original.pivotX,
                            path === 'pivotY' ? next : original.pivotY
                        );
                        if (preserved) {
                            dispatchForAll(
                                [{ type: 'updateNodeTransform', nodeId: nodes[0].id, transform: preserved }],
                                `node-transform:${nodes[0].id}:pivot`,
                                change
                            );
                            return;
                        }
                    }
                    if (updateAnimatedValue(nodes[0].id, path, next, change)) return;
                    dispatchForAll(
                        [{ type: 'updateNodeTransform', nodeId: nodes[0].id, transform: { [path]: next } }],
                        `node-transform:${nodes[0].id}:${path}`,
                        change
                    );
                }}
            />
        );
    }

    function BindingControls({
        path,
        raw,
        type,
    }: {
        path: keyof NodeTransform | 'localVisible';
        raw: number | boolean;
        type: 'number' | 'boolean';
    }) {
        return (
            <KeyframeControl target={nodePropertyTarget(nodes[0].id, path)} propertyType={type} currentValue={raw} />
        );
    }

    function macroControlFor(
        path: keyof NodeTransform | 'localVisible',
        raw: number | boolean,
        type: 'number' | 'boolean'
    ) {
        const binding = nodeBindings[nodes[0].id]?.[path];
        return (
            <NodeMacroControl
                path={path}
                bindingMacroId={binding?.type === 'macro' ? binding.macroId : undefined}
                macros={macros}
                options={macroOptions(type)}
                onAssign={(macroId) =>
                    dispatchSceneCommand(
                        {
                            type: 'updatePropertyTargetBinding',
                            target: nodePropertyTarget(nodes[0].id, path),
                            binding: macroId ? { type: 'macro', macroId } : { type: 'constant', value: raw },
                        },
                        { source: 'NodeTransformPanel.macro' }
                    )
                }
            />
        );
    }
}

function NodeStateRows({
    nodes,
    common,
    dispatchForAll,
}: {
    nodes: SceneNode[];
    common: <T>(read: (node: (typeof nodes)[number]) => T) => T | undefined;
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
