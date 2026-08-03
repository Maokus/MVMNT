import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaLink } from 'react-icons/fa';
import {
    channelForTarget,
    elementPropertyTarget,
    encodePropertyOwner,
    findKeyframeAtTick,
    nodePropertyTarget,
} from '@automation/types';
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
import { dispatchPropertyEdits, propertyEditMergeKey } from '@state/scene/propertyEditing';
import { effectiveValueForTarget } from '@state/scene/propertyEditing';
import { elementPropertyDescriptors, hostPropertyDescriptors } from '@state/scene/propertyCatalog';
import { resolveAutomationValueType } from './KeyframeControl';
import { aggregateTransformDelta } from './aggregateTransformDelta';
import { hoveredPropertyRef } from './hoveredPropertyRef';

const fields = HOST_NODE_PROPERTY_SCHEMA.filter(
    (field): field is (typeof HOST_NODE_PROPERTY_SCHEMA)[number] & { path: keyof NodeTransform } =>
        field.path !== 'localVisible' && field.path !== 'localOpacity'
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
    uncommitted?: boolean;
    hoverProperty?: { owner: { kind: 'node'; id: string }; propertyKey: string; propertyType: string };
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
    uncommitted = false,
    hoverProperty,
}: TransformRowProps) {
    return (
        <PropertyControlRow
            label={suffix ? `${label} (${suffix})` : label}
            animationControl={automation}
            macroControl={macro}
            className={uncommitted ? 'ae-property-uncommitted' : undefined}
            onMouseEnter={
                hoverProperty
                    ? () => {
                          hoveredPropertyRef.current = hoverProperty;
                      }
                    : undefined
            }
            onMouseLeave={
                hoverProperty
                    ? () => {
                          if (
                              hoveredPropertyRef.current?.owner.kind === 'node' &&
                              hoveredPropertyRef.current.owner.id === hoverProperty.owner.id &&
                              hoveredPropertyRef.current.propertyKey === hoverProperty.propertyKey
                          )
                              hoveredPropertyRef.current = null;
                      }
                    : undefined
            }
        >
            {mixed ? (
                <input
                    className="node-transform-mixed"
                    defaultValue=""
                    placeholder="Mixed"
                    disabled={readOnly}
                    onBlur={(event) => {
                        const next = Number(event.currentTarget.value);
                        if (event.currentTarget.value.trim() && Number.isFinite(next)) onChange?.(next);
                        event.currentTarget.value = '';
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                />
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
    hasAssignment = Boolean(bindingMacroId),
}: {
    path: string;
    bindingMacroId?: string;
    macros: ReturnType<typeof useSceneStore.getState>['macros'];
    options: string[];
    onAssign: (macroId: string) => void;
    hasAssignment?: boolean;
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
                className={`ae-macro-trigger${hasAssignment ? ' assigned' : ''}`}
                title={
                    bindingMacroId
                        ? `Macro: ${macros.byId[bindingMacroId]?.name ?? bindingMacroId}`
                        : hasAssignment
                          ? 'Mixed macro assignments'
                          : 'Assign macro'
                }
                aria-label={`${path} macro`}
                onClick={() => setOpen((value) => !value)}
            >
                <span className="ae-macro-label-text">
                    {bindingMacroId ? (
                        `🎵 ${macros.byId[bindingMacroId]?.name ?? bindingMacroId}`
                    ) : hasAssignment ? (
                        '🎵 Mixed'
                    ) : (
                        <FaLink />
                    )}
                </span>
                {(options.length > 0 || hasAssignment) && <span className="ae-macro-caret">▼</span>}
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
                        {hasAssignment ? (
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

function TransformSection({
    title,
    children,
    ownerKey,
}: {
    title: string;
    children: React.ReactNode;
    ownerKey?: string;
}) {
    const [localCollapsed, setLocalCollapsed] = useState(false);
    const storedCollapsed = useSceneStore((state) =>
        ownerKey ? state.interaction.expandedPropertyGroups[ownerKey]?.[title] : undefined
    );
    const setPropertyGroupCollapseState = useSceneStore((state) => state.setPropertyGroupCollapseState);
    const collapsed = storedCollapsed ?? localCollapsed;
    const toggle = () => {
        if (ownerKey) setPropertyGroupCollapseState(ownerKey, title, !collapsed);
        else setLocalCollapsed(!collapsed);
    };
    return (
        <section className="ae-property-group">
            <button
                type="button"
                className="ae-group-header"
                onClick={toggle}
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
    const transientNodeTransforms = useSceneStore((state) => state.transientNodeTransforms);
    const macros = useSceneStore((state) => state.macros);
    const tick = useTimelineStore((state) => state.timeline.currentTick);
    const autoKeying = useTimelineStore((state) => state.transport.autoKeying);
    const { visualizer } = useSceneSelection();
    const aggregateSessionValues = useRef(new Map<string, number>());
    const [aggregateInputRevision, setAggregateInputRevision] = useState(0);
    const nodes = nodeIds.map((id) => graph.nodesById[id]).filter(Boolean);
    const geometry = useMemo(
        () => visualizer?.getNodeSelectionAtTime?.(nodeIds, visualizer.getCurrentTime?.() ?? 0) ?? null,
        [visualizer, nodeIds, graph.revision]
    );
    if (!nodes.length) return null;

    const singleNode = nodes.length === 1 ? nodes[0] : null;
    const inspectorOwnerKey = singleNode
        ? encodePropertyOwner({ kind: 'node', id: singleNode.id })
        : `selection:${nodeIds.slice().sort().join('|')}`;
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
    const valueFor = (path: keyof NodeTransform | 'localVisible' | 'localOpacity', fallback: unknown) => {
        if (!singleNode) return fallback;
        const transient = transientNodeTransforms[singleNode.id]?.[path as keyof NodeTransform];
        if (typeof transient === 'number') return transient;
        const binding = nodeBindings[singleNode.id]?.[path];
        if (!binding) return fallback;
        if (binding.type === 'constant') return binding.value;
        if (binding.type === 'macro') return macros.byId[binding.macroId]?.value ?? fallback;
        return automationEvaluator.evaluate(binding.channelId, tick) ?? fallback;
    };
    const editNodeProperty = (
        nodeId: string,
        path: keyof NodeTransform | 'localVisible' | 'localOpacity',
        value: unknown,
        valueType: 'number' | 'boolean',
        change?: FormInputChange
    ) => {
        const session = change?.meta?.mergeSession;
        const target = nodePropertyTarget(nodeId, path);
        dispatchPropertyEdits([{ target, value, valueType }], {
            tick,
            autoKey: autoKeying,
            source: 'NodeTransformPanel',
            mergeKey: session ? propertyEditMergeKey([target], session.id) : undefined,
            transient: session ? !session.finalize : undefined,
        });
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
    const aggregateDelta = (
        next: number,
        neutral: number,
        change: FormInputChange | undefined,
        mode: 'add' | 'multiply'
    ) => {
        const session = change?.meta?.mergeSession;
        const previous = session ? (aggregateSessionValues.current.get(session.id) ?? neutral) : neutral;
        if (session) {
            if (session.finalize) {
                aggregateSessionValues.current.delete(session.id);
                setAggregateInputRevision((revision) => revision + 1);
            } else aggregateSessionValues.current.set(session.id, next);
        } else {
            setAggregateInputRevision((revision) => revision + 1);
        }
        return aggregateTransformDelta(next, neutral, previous, mode);
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
                <MultiSelectionCommonContent nodes={nodes} />
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
                <TransformSection title="Position & Bounds" ownerKey={inspectorOwnerKey}>
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
                <TransformSection title="Rotation & Scale" ownerKey={inspectorOwnerKey}>
                    <TransformRow
                        key={`rotation-${aggregateInputRevision}`}
                        label="Rotate by"
                        id="node-selection-rotation"
                        value={0}
                        suffix="°"
                        onChange={(degrees, change) =>
                            applyWorldDelta(
                                matrixAroundPoint(
                                    rotationMatrix((aggregateDelta(degrees, 0, change, 'add') * Math.PI) / 180),
                                    pivot.x,
                                    pivot.y
                                ),
                                `selection-rotation:${nodeIds.join(',')}`,
                                change
                            )
                        }
                    />
                    <TransformRow
                        key={`scale-${aggregateInputRevision}`}
                        label="Scale by"
                        id="node-selection-scale"
                        value={100}
                        suffix="%"
                        schema={{ step: 1 }}
                        onChange={(percent, change) =>
                            applyWorldDelta(
                                matrixAroundPoint(
                                    scaleMatrix(aggregateDelta(percent, 100, change, 'multiply')),
                                    pivot.x,
                                    pivot.y
                                ),
                                `selection-scale:${nodeIds.join(',')}`,
                                change
                            )
                        }
                    />
                </TransformSection>
                <TransformSection title="Selection Pivot" ownerKey={inspectorOwnerKey}>
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
                <MultiSelectionCommonContent nodes={nodes} />
            </div>
        );
    }

    return (
        <div className="node-transform-inspector ae-style">
            {(['translationX', 'translationY'] as const).map((path, index) => {
                const raw = Number(valueFor(path, nodes[0].userNodeTransform[path]));
                return index === 0 ? (
                    <TransformSection key="position" title="Position" ownerKey={inspectorOwnerKey}>
                        {renderSingleField('translationX', raw)}
                        {renderSingleField(
                            'translationY',
                            Number(valueFor('translationY', nodes[0].userNodeTransform.translationY))
                        )}
                    </TransformSection>
                ) : null;
            })}
            <TransformSection title="Rotation & Scale" ownerKey={inspectorOwnerKey}>
                {renderSingleField('rotation', Number(valueFor('rotation', nodes[0].userNodeTransform.rotation)))}
                {renderSingleField('scaleX', Number(valueFor('scaleX', nodes[0].userNodeTransform.scaleX)))}
                {renderSingleField('scaleY', Number(valueFor('scaleY', nodes[0].userNodeTransform.scaleY)))}
            </TransformSection>
            <TransformSection title="Pivot" ownerKey={inspectorOwnerKey}>
                {renderSingleField('pivotX', Number(valueFor('pivotX', nodes[0].userNodeTransform.pivotX)))}
                {renderSingleField('pivotY', Number(valueFor('pivotY', nodes[0].userNodeTransform.pivotY)))}
            </TransformSection>
            <TransformSection title="Node State" ownerKey={inspectorOwnerKey}>
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
                        disabled={nodeBindings[nodes[0].id]?.localVisible?.type === 'macro'}
                        schema={{}}
                        onChange={(value) => {
                            const visible = Boolean(valueOf(value));
                            editNodeProperty(nodes[0].id, 'localVisible', visible, 'boolean');
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
                <PropertyControlRow
                    label="Opacity"
                    animationControl={
                        <BindingControls
                            path="localOpacity"
                            raw={Number(valueFor('localOpacity', nodes[0].localOpacity))}
                            type="number"
                        />
                    }
                    macroControl={macroControlFor(
                        'localOpacity',
                        Number(valueFor('localOpacity', nodes[0].localOpacity)),
                        'number'
                    )}
                >
                    <FormInput
                        id={`node-${nodes[0].id}-opacity`}
                        type="number"
                        value={Number(valueFor('localOpacity', nodes[0].localOpacity))}
                        schema={{ min: 0, max: 1, step: 0.01 }}
                        disabled={nodeBindings[nodes[0].id]?.localOpacity?.type === 'macro'}
                        onChange={(change) => {
                            const opacity = Number(valueOf(change));
                            if (Number.isFinite(opacity)) {
                                editNodeProperty(
                                    nodes[0].id,
                                    'localOpacity',
                                    opacity,
                                    'number',
                                    change as FormInputChange
                                );
                            }
                        }}
                    />
                </PropertyControlRow>
            </TransformSection>
        </div>
    );

    function renderSingleField(path: keyof NodeTransform, raw: number) {
        const field = fields.find((candidate) => candidate.path === path)!;
        const descriptor = hostPropertyDescriptors(nodes[0].id).find((candidate) => candidate.definition.key === path)!;
        const displayValue = descriptor.presentation.toDisplay(raw);
        const display = typeof displayValue === 'number' ? displayValue : raw;
        const hasUncommittedPreview = typeof transientNodeTransforms[nodes[0].id]?.[path] === 'number';
        return (
            <TransformRow
                label={field.label}
                id={`node-${nodes[0].id}-${path}`}
                value={display}
                suffix={descriptor.presentation.unit}
                schema={{ ...descriptor.definition }}
                readOnly={nodeBindings[nodes[0].id]?.[path]?.type === 'macro'}
                automation={<BindingControls path={path} raw={raw} type="number" />}
                macro={macroControlFor(path, raw, 'number')}
                uncommitted={hasUncommittedPreview}
                hoverProperty={{ owner: { kind: 'node', id: nodes[0].id }, propertyKey: path, propertyType: 'number' }}
                onChange={(displayValue, change) => {
                    const canonical = descriptor.presentation.fromDisplay(displayValue);
                    const next = typeof canonical === 'number' ? canonical : displayValue;
                    if (
                        (path === 'pivotX' || path === 'pivotY') &&
                        !autoKeying &&
                        !nodeBindings[nodes[0].id]?.pivotX &&
                        !nodeBindings[nodes[0].id]?.pivotY &&
                        !nodeBindings[nodes[0].id]?.translationX &&
                        !nodeBindings[nodes[0].id]?.translationY
                    ) {
                        const original = nodes[0].userNodeTransform;
                        const preserved = matrixToNodeTransform(
                            nodeTransformToMatrix(original),
                            path === 'pivotX' ? next : original.pivotX,
                            path === 'pivotY' ? next : original.pivotY,
                            original
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
                    editNodeProperty(nodes[0].id, path, next, 'number', change);
                }}
            />
        );
    }

    function BindingControls({
        path,
        raw,
        type,
    }: {
        path: keyof NodeTransform | 'localVisible' | 'localOpacity';
        raw: number | boolean;
        type: 'number' | 'boolean';
    }) {
        return (
            <KeyframeControl target={nodePropertyTarget(nodes[0].id, path)} propertyType={type} currentValue={raw} />
        );
    }

    function macroControlFor(
        path: keyof NodeTransform | 'localVisible' | 'localOpacity',
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

/** Optional bulk-local editor for extensions; the main inspector omits it because those host fields are shown above. */
export function MultiSelectionCommonProperties({ nodes }: { nodes: SceneNode[] }) {
    const tick = useTimelineStore((state) => state.timeline.currentTick);
    const autoKey = useTimelineStore((state) => state.transport.autoKeying);
    const nodeBindings = useSceneStore((state) => state.nodeBindings);
    const channels = useSceneStore((state) => state.automation.channels);
    const macros = useSceneStore((state) => state.macros);
    const descriptors = hostPropertyDescriptors('__multi__').filter(
        (descriptor) => descriptor.definition.type === 'number'
    );

    const valuesFor = (path: string) =>
        nodes.map((node) => effectiveValueForTarget(useSceneStore.getState(), nodePropertyTarget(node.id, path), tick));
    const commonValue = (values: unknown[]) =>
        values.every((value) => Object.is(value, values[0])) ? values[0] : undefined;

    const editAll = (path: string, displayValue: unknown, change?: FormInputChange) => {
        const descriptor = descriptors.find((candidate) => candidate.definition.key === path);
        if (!descriptor) return;
        const value = descriptor.presentation.fromDisplay(displayValue);
        const targets = nodes.map((node) => nodePropertyTarget(node.id, path));
        const session = change?.meta?.mergeSession;
        dispatchPropertyEdits(
            targets.map((target) => ({
                target,
                value,
                valueType: descriptor.definition.type === 'number' ? ('number' as const) : ('boolean' as const),
                automatable: descriptor.capabilities.automatable,
            })),
            {
                tick,
                autoKey,
                source: 'NodeTransformPanel.common',
                mergeKey: session ? propertyEditMergeKey(targets, session.id) : undefined,
                transient: session ? !session.finalize : undefined,
            }
        );
    };

    return (
        <TransformSection title="Common Local Properties">
            {descriptors.map((descriptor) => {
                const path = descriptor.definition.key;
                const targetValues = valuesFor(path);
                const shared = commonValue(targetValues);
                const display = descriptor.presentation.toDisplay(shared);
                const valueType = descriptor.definition.type === 'number' ? 'number' : 'boolean';
                const targetBindings = nodes.map((node) => nodeBindings[node.id]?.[path]);
                const firstBinding = targetBindings[0];
                const commonMacroId =
                    targetBindings.every(
                        (binding) =>
                            binding?.type === 'macro' &&
                            firstBinding?.type === 'macro' &&
                            binding.macroId === firstBinding.macroId
                    ) && firstBinding?.type === 'macro'
                        ? firstBinding.macroId
                        : undefined;
                const macroOptions = macros.allIds.filter((id) => macros.byId[id]?.type === valueType);

                return (
                    <TransformRow
                        key={path}
                        label={descriptor.definition.label}
                        id={`node-multi-${path}`}
                        value={typeof display === 'number' ? display : 0}
                        mixed={shared === undefined}
                        suffix={descriptor.presentation.unit}
                        schema={{ ...descriptor.definition }}
                        readOnly={targetBindings.some((binding) => binding?.type === 'macro')}
                        automation={
                            descriptor.capabilities.automatable ? (
                                <BulkKeyframeControl
                                    nodes={nodes}
                                    path={path}
                                    values={targetValues}
                                    valueType={valueType}
                                />
                            ) : null
                        }
                        macro={
                            descriptor.capabilities.macroAssignable ? (
                                <NodeMacroControl
                                    path={path}
                                    bindingMacroId={commonMacroId}
                                    hasAssignment={targetBindings.some((binding) => binding?.type === 'macro')}
                                    macros={macros}
                                    options={macroOptions}
                                    onAssign={(macroId) => {
                                        const commands: SceneCommand[] = nodes.map((node, index) => ({
                                            type: 'updatePropertyTargetBinding',
                                            target: nodePropertyTarget(node.id, path),
                                            binding: macroId
                                                ? { type: 'macro', macroId }
                                                : { type: 'constant', value: targetValues[index] },
                                        }));
                                        dispatchSceneCommand(
                                            { type: 'batch', commands },
                                            { source: 'NodeTransformPanel.common.macro' }
                                        );
                                    }}
                                />
                            ) : null
                        }
                        onChange={(value, change) => editAll(path, value, change)}
                    />
                );
            })}
        </TransformSection>
    );

    function BulkKeyframeControl({
        nodes: selectedNodes,
        path,
        values,
        valueType,
    }: {
        nodes: SceneNode[];
        path: string;
        values: unknown[];
        valueType: 'number' | 'boolean';
    }) {
        const targets = selectedNodes.map((node) => nodePropertyTarget(node.id, path));
        const targetChannels = targets.map((target) => channelForTarget({ channels }, target));
        const automatedCount = targetChannels.filter(Boolean).length;
        const keysHere = targetChannels.filter(
            (channel) => channel && findKeyframeAtTick(channel.keyframes, tick)
        ).length;
        const allKeyed = keysHere === targets.length;
        const stateClass = automatedCount === 0 ? 'inactive' : allKeyed ? 'active' : 'automated';
        const title =
            automatedCount === 0
                ? 'Enable automation for selection'
                : allKeyed
                  ? 'Remove playhead keys from selection'
                  : `Add playhead keys (${automatedCount}/${targets.length} already automated)`;

        return (
            <button
                type="button"
                className={`ae-keyframe-toggle ${stateClass}`}
                title={title}
                aria-label={title}
                onClick={(event) => {
                    event.stopPropagation();
                    if (allKeyed) {
                        const commands: SceneCommand[] = targetChannels.flatMap((channel) =>
                            channel ? [{ type: 'removeKeyframe' as const, channelId: channel.id, tick }] : []
                        );
                        dispatchSceneCommand(
                            { type: 'batch', commands },
                            { source: 'NodeTransformPanel.common.keyframe' }
                        );
                        useSceneStore.getState().clearTransientNodeTransforms(
                            selectedNodes.map((node) => node.id),
                            [path as keyof NodeTransform]
                        );
                        return;
                    }
                    dispatchPropertyEdits(
                        targets.map((target, index) => ({ target, value: values[index], valueType })),
                        { tick, autoKey: true, source: 'NodeTransformPanel.common.keyframe' }
                    );
                    useSceneStore.getState().clearTransientNodeTransforms(
                        selectedNodes.map((node) => node.id),
                        [path as keyof NodeTransform]
                    );
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const commands: SceneCommand[] = targetChannels.flatMap((channel, index) =>
                        channel
                            ? [
                                  {
                                      type: 'disablePropertyAutomation' as const,
                                      target: targets[index],
                                      fallbackValue: values[index],
                                  },
                              ]
                            : []
                    );
                    if (commands.length) {
                        dispatchSceneCommand(commands.length === 1 ? commands[0] : { type: 'batch', commands }, {
                            source: 'NodeTransformPanel.common.keyframe',
                        });
                    }
                }}
            >
                {automatedCount === 0 ? (
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        className="ae-keyframe-stopwatch"
                        aria-hidden="true"
                    >
                        <rect x="3.5" y="0.5" width="3" height="1.2" rx="0.6" fill="currentColor" />
                        <line x1="5" y1="1.7" x2="5" y2="2.8" stroke="currentColor" strokeWidth="1" />
                        <circle cx="5" cy="6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1" />
                        <line x1="5" y1="6" x2="5" y2="4" stroke="currentColor" strokeWidth="1" />
                        <line x1="5" y1="6" x2="7" y2="6" stroke="currentColor" strokeWidth="1" />
                    </svg>
                ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-diamond" aria-hidden="true">
                        <path d="M5 0 L10 5 L5 10 L0 5 Z" />
                    </svg>
                )}
            </button>
        );
    }
}

function MultiSelectionCommonContent({ nodes }: { nodes: SceneNode[] }) {
    const elements = useSceneStore((state) => state.elements);
    const bindings = useSceneStore((state) => state.bindings.byElement);
    const macros = useSceneStore((state) => state.macros);
    const tick = useTimelineStore((state) => state.timeline.currentTick);
    const autoKey = useTimelineStore((state) => state.transport.autoKeying);
    const elementNodes = nodes.filter(
        (node): node is Extract<SceneNode, { kind: 'element' }> => node.kind === 'element'
    );
    if (elementNodes.length !== nodes.length) return null;
    const elementTypes = elementNodes.map((node) => elements[node.elementId]?.type).filter(Boolean);
    if (!elementTypes.length || !elementTypes.every((type) => type === elementTypes[0])) return null;

    const descriptors = elementPropertyDescriptors(elementNodes[0].elementId, elementTypes[0]).filter((descriptor) =>
        ['number', 'boolean', 'string', 'longString', 'color', 'colorAlpha', 'select', 'font'].includes(
            descriptor.definition.type
        )
    );
    const groups = new Map<string, typeof descriptors>();
    for (const descriptor of descriptors) {
        const key = `${descriptor.tab.id}:${descriptor.group.id}`;
        groups.set(key, [...(groups.get(key) ?? []), descriptor]);
    }

    return (
        <>
            {[...groups.entries()].map(([groupKey, groupDescriptors]) => (
                <TransformSection key={groupKey} title={`Common Content · ${groupDescriptors[0].group.label}`}>
                    {groupDescriptors.map((template) => {
                        const targets = elementNodes.map((node) =>
                            elementPropertyTarget(node.elementId, template.definition.key)
                        );
                        const values = targets.map((target) =>
                            effectiveValueForTarget(useSceneStore.getState(), target, tick)
                        );
                        const shared = values.every((value) => Object.is(value, values[0])) ? values[0] : undefined;
                        const targetBindings = elementNodes.map(
                            (node) => bindings[node.elementId]?.[template.definition.key]
                        );
                        const firstBinding = targetBindings[0];
                        const commonMacroId =
                            firstBinding?.type === 'macro' &&
                            targetBindings.every(
                                (binding) => binding?.type === 'macro' && binding.macroId === firstBinding.macroId
                            )
                                ? firstBinding.macroId
                                : undefined;
                        const valueType = resolveAutomationValueType(template.definition.type);
                        const inputType = template.definition.type === 'string' ? 'text' : template.definition.type;
                        const write = (payload: unknown) => {
                            const change =
                                payload && typeof payload === 'object' && 'value' in payload
                                    ? (payload as FormInputChange)
                                    : null;
                            const value = change ? change.value : payload;
                            const session = change?.meta?.mergeSession;
                            dispatchPropertyEdits(
                                targets.map((target) => ({ target, value, valueType })),
                                {
                                    tick,
                                    autoKey,
                                    source: 'NodeTransformPanel.commonContent',
                                    mergeKey: session ? propertyEditMergeKey(targets, session.id) : undefined,
                                    transient: session ? !session.finalize : undefined,
                                }
                            );
                        };

                        return (
                            <PropertyControlRow
                                key={template.definition.key}
                                label={template.definition.label}
                                description={template.definition.description}
                                animationControl={
                                    valueType ? (
                                        <BulkTargetKeyframeControl
                                            targets={targets}
                                            values={values}
                                            valueType={valueType}
                                        />
                                    ) : null
                                }
                                macroControl={
                                    template.capabilities.macroAssignable ? (
                                        <NodeMacroControl
                                            path={template.definition.key}
                                            bindingMacroId={commonMacroId}
                                            hasAssignment={targetBindings.some((binding) => binding?.type === 'macro')}
                                            macros={macros}
                                            options={macros.allIds.filter(
                                                (id) => macros.byId[id]?.type === template.definition.type
                                            )}
                                            onAssign={(macroId) => {
                                                const commands: SceneCommand[] = targets.map((target, index) => ({
                                                    type: 'updatePropertyTargetBinding',
                                                    target,
                                                    binding: macroId
                                                        ? { type: 'macro', macroId }
                                                        : { type: 'constant', value: values[index] },
                                                }));
                                                dispatchSceneCommand(
                                                    { type: 'batch', commands },
                                                    { source: 'NodeTransformPanel.commonContent.macro' }
                                                );
                                            }}
                                        />
                                    ) : null
                                }
                            >
                                {shared === undefined && template.definition.type !== 'boolean' ? (
                                    <input
                                        className="node-transform-mixed"
                                        defaultValue=""
                                        placeholder="Mixed"
                                        disabled={targetBindings.some((binding) => binding?.type === 'macro')}
                                        onBlur={(event) => {
                                            if (!event.currentTarget.value.trim()) return;
                                            write(
                                                template.definition.type === 'number'
                                                    ? Number(event.currentTarget.value)
                                                    : event.currentTarget.value
                                            );
                                            event.currentTarget.value = '';
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') event.currentTarget.blur();
                                        }}
                                    />
                                ) : (
                                    <FormInput
                                        id={`common-content-${template.definition.key}`}
                                        type={inputType}
                                        value={shared ?? false}
                                        schema={template.definition}
                                        disabled={targetBindings.some((binding) => binding?.type === 'macro')}
                                        onChange={write}
                                    />
                                )}
                            </PropertyControlRow>
                        );
                    })}
                </TransformSection>
            ))}
        </>
    );
}

function BulkTargetKeyframeControl({
    targets,
    values,
    valueType,
}: {
    targets: ReturnType<typeof elementPropertyTarget>[];
    values: unknown[];
    valueType: NonNullable<ReturnType<typeof resolveAutomationValueType>>;
}) {
    const tick = useTimelineStore((state) => state.timeline.currentTick);
    const channels = useSceneStore((state) => state.automation.channels);
    const targetChannels = targets.map((target) => channelForTarget({ channels }, target));
    const automatedCount = targetChannels.filter(Boolean).length;
    const keyedCount = targetChannels.filter(
        (channel) => channel && findKeyframeAtTick(channel.keyframes, tick)
    ).length;
    const allKeyed = keyedCount === targets.length;
    const title =
        automatedCount === 0
            ? 'Enable automation for selection'
            : allKeyed
              ? 'Remove playhead keys from selection'
              : `Add playhead keys (${automatedCount}/${targets.length} already automated)`;
    return (
        <button
            type="button"
            className={`ae-keyframe-toggle ${automatedCount === 0 ? 'inactive' : allKeyed ? 'active' : 'automated'}`}
            title={title}
            aria-label={title}
            onClick={(event) => {
                event.stopPropagation();
                if (allKeyed) {
                    const commands: SceneCommand[] = targetChannels.flatMap((channel) =>
                        channel ? [{ type: 'removeKeyframe' as const, channelId: channel.id, tick }] : []
                    );
                    dispatchSceneCommand({ type: 'batch', commands }, { source: 'common-content-keyframe' });
                    return;
                }
                dispatchPropertyEdits(
                    targets.map((target, index) => ({ target, value: values[index], valueType })),
                    { tick, autoKey: true, source: 'common-content-keyframe' }
                );
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                const commands: SceneCommand[] = targetChannels.flatMap((channel, index) =>
                    channel
                        ? [
                              {
                                  type: 'disablePropertyAutomation' as const,
                                  target: targets[index],
                                  fallbackValue: values[index],
                              },
                          ]
                        : []
                );
                if (commands.length) {
                    dispatchSceneCommand(commands.length === 1 ? commands[0] : { type: 'batch', commands }, {
                        source: 'common-content-keyframe',
                    });
                }
            }}
        >
            {automatedCount === 0 ? (
                <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-stopwatch" aria-hidden="true">
                    <rect x="3.5" y="0.5" width="3" height="1.2" rx="0.6" fill="currentColor" />
                    <line x1="5" y1="1.7" x2="5" y2="2.8" stroke="currentColor" strokeWidth="1" />
                    <circle cx="5" cy="6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1" />
                    <line x1="5" y1="6" x2="5" y2="4" stroke="currentColor" strokeWidth="1" />
                    <line x1="5" y1="6" x2="7" y2="6" stroke="currentColor" strokeWidth="1" />
                </svg>
            ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-diamond" aria-hidden="true">
                    <path d="M5 0 L10 5 L5 10 L0 5 Z" />
                </svg>
            )}
        </button>
    );
}
