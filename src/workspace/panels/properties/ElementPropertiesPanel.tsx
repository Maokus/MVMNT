import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropertyGroupPanel from './PropertyGroupPanel';
import { EnhancedConfigSchema, PropertyDefinition } from '@fonts/components';
import { useMacros } from '@context/MacroContext';
import type { ElementBindings } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { FormInputChange } from '@workspace/forms/inputs/FormInput';
import { FaCopy, FaPaste, FaRotate } from 'react-icons/fa6';
import { useCurrentTick } from '@automation/hooks';
import { makeChannelId, findKeyframeAtTick, createKeyframe } from '@automation/types';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { automationEvaluator } from '@automation/automation-evaluator';
import { resolveAutomationValueType } from './KeyframeControl';

interface ElementPropertiesPanelProps {
    elementId: string;
    elementType: string;
    schema: EnhancedConfigSchema | null;
    bindings: ElementBindings;
    onConfigChange: (
        elementId: string,
        changes: { [key: string]: any },
        options?: Omit<SceneCommandOptions, 'source'>,
    ) => void;
    refreshToken?: number;
}

interface PropertyValues {
    [key: string]: any;
}

interface MacroAssignments {
    [key: string]: string;
}

const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
    elementId,
    elementType,
    schema,
    bindings,
    onConfigChange,
    refreshToken = 0,
}) => {
    const [enhancedSchema, setEnhancedSchema] = useState<EnhancedConfigSchema | null>(
        () => (schema as EnhancedConfigSchema) ?? null,
    );
    const [propertyValues, setPropertyValues] = useState<PropertyValues>({});
    const [macroAssignments, setMacroAssignments] = useState<MacroAssignments>({});

    // Reset property state synchronously when the element changes, so the panel never briefly
    // shows the previous element's values before the useEffect has a chance to load new ones.
    const [lastRenderedElementId, setLastRenderedElementId] = useState(elementId);
    if (lastRenderedElementId !== elementId) {
        setLastRenderedElementId(elementId);
        setPropertyValues({});
        setMacroAssignments({});
    }
    const [macroListenerKey, setMacroListenerKey] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [elementClipboard, setElementClipboard] = useState<{
        elementType: string;
        values: Record<string, any>;
        macroAssignments: Record<string, string>;
    } | null>(null);

    const { assignListener, macros: macroList } = useMacros();
    const macroLookup = useMemo(() => new Map((macroList as any[]).map((macro: any) => [macro.name, macro])), [macroList]);
    const currentTick = useCurrentTick();
    const automationChannels = useSceneStore(useCallback((s) => s.automation.channels, []));
    const autoKeying = useTimelineStore((s) => s.transport.autoKeying);
    const propertyOverrides = useSceneStore(useCallback((s) => s.propertyOverrides, []));
    const groupCollapseState = useSceneStore(useCallback((s) => s.interaction.expandedPropertyGroups[elementId] ?? {}, [elementId]));
    const setPropertyGroupCollapseState = useSceneStore((s) => s.setPropertyGroupCollapseState);

    // Fast property-type lookup used by auto-keying logic
    const propertyTypeMap = useMemo(() => {
        const map = new Map<string, string>();
        enhancedSchema?.groups.forEach((group) => {
            group.properties.forEach((prop) => map.set(prop.key, prop.type));
        });
        return map;
    }, [enhancedSchema]);

    const bindingsMemo = useMemo(() => ({ ...(bindings ?? {}) }), [bindings, refreshToken]);

    const delinkedKeys = useMemo(() => {
        const keys = new Set<string>();
        if (!enhancedSchema) return keys;
        enhancedSchema.groups.forEach((group) => {
            group.properties.forEach((property) => {
                const binding = bindingsMemo[property.key];
                if (binding?.type === 'keyframes') {
                    const chId = makeChannelId(elementId, property.key);
                    if (propertyOverrides[chId] !== undefined) {
                        keys.add(property.key);
                    }
                }
            });
        });
        return keys;
    }, [enhancedSchema, bindingsMemo, propertyOverrides, elementId]);

    const handleMacroStoreUpdate = useCallback(() => {
        setMacroListenerKey((prev) => prev + 1);
    }, []);

    useEffect(() => {
        const unsubscribe = assignListener(handleMacroStoreUpdate);
        return () => unsubscribe();
    }, [assignListener, handleMacroStoreUpdate]);

    useEffect(() => {
        if (!schema) {
            setEnhancedSchema(null);
            setPropertyValues({});
            setMacroAssignments({});
            return;
        }

        const groupedSchema = schema as EnhancedConfigSchema;
        setEnhancedSchema(groupedSchema);

        const nextValues: PropertyValues = {};
        const nextAssignments: MacroAssignments = {};

        groupedSchema.groups.forEach((group) => {
            group.properties.forEach((property) => {
                const binding = bindingsMemo[property.key];
                if (binding?.type === 'macro') {
                    nextAssignments[property.key] = binding.macroId;
                    const macro = macroLookup.get(binding.macroId);
                    if (macro) {
                        const macroValue = macro.value;
                        nextValues[property.key] = macroValue;
                    } else {
                        nextValues[property.key] = property.default ?? null;
                    }
                } else if (binding?.type === 'keyframes') {
                    // Evaluate automation at current tick for display.
                    // Check transient override first (set when auto key is off and user manually
                    // changes a keyframed property — clears automatically on scrub/play).
                    const chId = makeChannelId(elementId, property.key);
                    const override = propertyOverrides[chId];
                    if (override !== undefined) {
                        nextValues[property.key] = override;
                    } else {
                        // Read directly from automationChannels (hook-captured, always current) first.
                        // This avoids stale evaluator-curve-cache results when a keyframe was just
                        // added/modified at the current tick — the exact-match path bypasses the cache.
                        const channel = automationChannels[chId];
                        if (channel) {
                            const kfAtTick = findKeyframeAtTick(channel.keyframes, currentTick);
                            if (kfAtTick !== null) {
                                nextValues[property.key] = kfAtTick.value;
                            } else {
                                const evaluated = automationEvaluator.evaluate(chId, currentTick);
                                nextValues[property.key] = evaluated ?? property.default;
                            }
                        } else {
                            nextValues[property.key] = property.default ?? null;
                        }
                    }
                } else if (binding?.type === 'constant') {
                    nextValues[property.key] = binding.value ?? property.default;
                } else {
                    nextValues[property.key] = property.default ?? null;
                }
            });
        });

        setPropertyValues(nextValues);
        setMacroAssignments(nextAssignments);

        // Initialize any groups that don't yet have a stored collapse state
        const currentGroupState = useSceneStore.getState().interaction.expandedPropertyGroups[elementId] ?? {};
        groupedSchema.groups.forEach((group) => {
            if (!Object.prototype.hasOwnProperty.call(currentGroupState, group.id) && group.collapsed) {
                setPropertyGroupCollapseState(elementId, group.id, true);
            }
        });
    }, [
        schema,
        bindingsMemo,
        macroLookup,
        macroListenerKey,
        elementId,
        elementType,
        refreshToken,
        currentTick,
        automationChannels,
        propertyOverrides,
        setPropertyGroupCollapseState,
    ]);

    const propertyPassesVisibility = useCallback(
        (property: PropertyDefinition) => {
            if (!property.visibleWhen || property.visibleWhen.length === 0) {
                return true;
            }

            return property.visibleWhen.every((rule) => {
                if ('equals' in rule) {
                    return propertyValues[rule.key] === rule.equals;
                }
                if ('notEquals' in rule) {
                    return propertyValues[rule.key] !== rule.notEquals;
                }
                if ('truthy' in rule) {
                    return Boolean(propertyValues[rule.key]);
                }
                if ('falsy' in rule) {
                    return !propertyValues[rule.key];
                }
                return true;
            });
        },
        [propertyValues],
    );

    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filteredGroups = useMemo(() => {
        if (!enhancedSchema) return [];

        return enhancedSchema.groups
            .map((group) => {
                const groupLabel = group.label?.toLowerCase?.() ?? '';
                const groupDescription = group.description?.toLowerCase?.() ?? '';
                const groupMatchesSearch = normalizedSearch
                    ? groupLabel.includes(normalizedSearch) || groupDescription.includes(normalizedSearch)
                    : true;

                const visibleProperties = group.properties.filter((property) => propertyPassesVisibility(property));

                if (!normalizedSearch || groupMatchesSearch) {
                    return { group, properties: visibleProperties };
                }

                const matchingProperties = visibleProperties.filter((property) => {
                    const label = property.label?.toLowerCase?.() ?? '';
                    const description = property.description?.toLowerCase?.() ?? '';
                    return label.includes(normalizedSearch) || description.includes(normalizedSearch);
                });

                return { group, properties: matchingProperties };
            })
            .filter(({ properties }) => properties.length > 0);
    }, [enhancedSchema, normalizedSearch, propertyPassesVisibility]);

    const elementPresets = useMemo(() => {
        if (!enhancedSchema) return [];

        return enhancedSchema.groups.flatMap((group) =>
            (group.presets ?? []).map((preset) => ({
                value: `${group.id}::${preset.id}`,
                label: `${group.label ?? 'Group'} · ${preset.label}`,
            })),
        );
    }, [enhancedSchema]);

    const handleValueChange = useCallback(
        (key: string, value: any, meta?: FormInputChange['meta']) => {
            const linked = meta?.linkedUpdates ?? undefined;
            setPropertyValues((prev) => ({
                ...prev,
                [key]: value,
                ...(linked ?? {}),
            }));

            // Auto-keying ON, property not yet automated: create the channel with an initial keyframe.
            // SceneSelectionContext.updateElementConfig handles the "channel already exists" case.
            if (autoKeying) {
                const chId = makeChannelId(elementId, key);
                if (!useSceneStore.getState().automation.channels[chId]) {
                    const valueType = resolveAutomationValueType(propertyTypeMap.get(key) ?? '');
                    if (valueType) {
                        const session = meta?.mergeSession;
                        const cmdOptions: SceneCommandOptions = { source: 'property-panel' };
                        if (session) {
                            cmdOptions.mergeKey = `kf-drag:${chId}:${session.id}`;
                            cmdOptions.transient = !session.finalize;
                        }
                        dispatchSceneCommand(
                            { type: 'enablePropertyAutomation', elementId, propertyKey: key, valueType, initialKeyframes: [createKeyframe(currentTick, value)] },
                            cmdOptions,
                        );
                        return;
                    }
                }
                // Channel exists: fall through to onConfigChange, which will dispatch addKeyframe
            }

            // Auto-keying OFF: falls through to onConfigChange unconditionally.
            // SceneSelectionContext.updateElementConfig will dispatch updateElementConfig for all keys,
            // so any keyframed property's rendered value will revert to the keyframed value on scrub.

            if (onConfigChange) {
                let options: Omit<SceneCommandOptions, 'source'> | undefined;
                const session = meta?.mergeSession;
                if (session && elementId) {
                    const mergeKey = `property-drag:${elementId}:${key}:${session.id}`;
                    options = {
                        mergeKey,
                        transient: !session.finalize,
                        canMergeWith: (other) =>
                            other.command.type === 'updateElementConfig' &&
                            other.command.elementId === elementId &&
                            Object.prototype.hasOwnProperty.call(other.command.patch ?? {}, key),
                    };
                }
                const patch: Record<string, any> = { [key]: value };
                if (linked) {
                    Object.entries(linked).forEach(([linkedKey, linkedValue]) => {
                        patch[linkedKey] = linkedValue;
                    });
                }
                onConfigChange(elementId, patch, options);
            }
        },
        [elementId, onConfigChange, currentTick, autoKeying, propertyTypeMap],
    );

    const handleMacroAssignment = useCallback(
        (propertyKey: string, macroName: string) => {
            if (macroName) {
                setMacroAssignments((prev) => ({ ...prev, [propertyKey]: macroName }));
                if (onConfigChange) {
                    onConfigChange(elementId, { [propertyKey]: { type: 'macro', macroId: macroName } });
                }
            } else {
                setMacroAssignments((prev) => {
                    const next = { ...prev };
                    delete next[propertyKey];
                    return next;
                });
                const currentValue = propertyValues[propertyKey];
                if (onConfigChange) {
                    onConfigChange(elementId, { [propertyKey]: currentValue });
                }
            }
            setMacroListenerKey((prev) => prev + 1);
        },
        [elementId, onConfigChange, propertyValues],
    );

    const applyBulkValueChange = useCallback(
        (changes: Record<string, any>) => {
            if (!changes || Object.keys(changes).length === 0) {
                return;
            }

            setPropertyValues((prev) => ({ ...prev, ...changes }));

            if (onConfigChange) {
                onConfigChange(elementId, changes);
            }
        },
        [elementId, onConfigChange],
    );

    const handleResetAll = useCallback(() => {
        if (!enhancedSchema) return;

        const nextValues: Record<string, any> = {};
        enhancedSchema.groups.forEach((group) => {
            group.properties.forEach((property) => {
                nextValues[property.key] = property.default ?? null;
                if (macroAssignments[property.key]) {
                    handleMacroAssignment(property.key, '');
                }
            });
        });

        applyBulkValueChange(nextValues);
    }, [applyBulkValueChange, enhancedSchema, handleMacroAssignment, macroAssignments]);

    const handleApplyPreset = useCallback(
        (presetKey: string) => {
            if (!enhancedSchema) return;
            const [groupId, presetId] = presetKey.split('::');
            const group = enhancedSchema.groups.find((entry) => entry.id === groupId);
            if (!group || !group.presets) return;
            const preset = group.presets.find((entry) => entry.id === presetId);
            if (!preset) return;

            const nextValues: Record<string, any> = {};
            Object.entries(preset.values).forEach(([key, value]) => {
                nextValues[key] = value;
                if (macroAssignments[key]) {
                    handleMacroAssignment(key, '');
                }
            });

            applyBulkValueChange(nextValues);
        },
        [applyBulkValueChange, enhancedSchema, handleMacroAssignment, macroAssignments],
    );

    const handleCopyElement = useCallback(() => {
        if (!enhancedSchema) return;

        const values: Record<string, any> = {};
        const macros: Record<string, string> = {};

        enhancedSchema.groups.forEach((group) => {
            group.properties.forEach((property) => {
                if (Object.prototype.hasOwnProperty.call(propertyValues, property.key)) {
                    values[property.key] = propertyValues[property.key];
                }
                if (macroAssignments[property.key]) {
                    macros[property.key] = macroAssignments[property.key];
                }
            });
        });

        setElementClipboard({ elementType, values, macroAssignments: macros });
    }, [enhancedSchema, elementType, macroAssignments, propertyValues]);

    const handlePasteElement = useCallback(() => {
        if (!enhancedSchema || !elementClipboard) return;
        if (elementClipboard.elementType !== elementType) return;

        const nextValues: Record<string, any> = {};
        enhancedSchema.groups.forEach((group) => {
            group.properties.forEach((property) => {
                if (Object.prototype.hasOwnProperty.call(elementClipboard.values, property.key)) {
                    nextValues[property.key] = elementClipboard.values[property.key];
                }
            });
        });

        applyBulkValueChange(nextValues);

        enhancedSchema.groups.forEach((group) => {
            group.properties.forEach((property) => {
                const macroName = elementClipboard.macroAssignments[property.key];
                if (macroName && macroLookup.has(macroName)) {
                    handleMacroAssignment(property.key, macroName);
                } else if (macroAssignments[property.key]) {
                    handleMacroAssignment(property.key, '');
                }
            });
        });
    }, [applyBulkValueChange, elementClipboard, enhancedSchema, handleMacroAssignment, macroAssignments, macroLookup, elementType]);

    const handlePresetSelection = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const presetKey = event.target.value;
            if (!presetKey) return;
            handleApplyPreset(presetKey);
            event.target.value = '';
        },
        [handleApplyPreset],
    );

    const handleCollapseToggle = useCallback((groupId: string) => {
        const current = useSceneStore.getState().interaction.expandedPropertyGroups[elementId] ?? {};
        setPropertyGroupCollapseState(elementId, groupId, !current[groupId]);
    }, [elementId, setPropertyGroupCollapseState]);

    const canPasteElement = elementClipboard?.elementType === elementType;

    if (!enhancedSchema) {
        return (
            <div className="element-properties-panel ae-style empty">
                <p className="text-sm opacity-70">No configurable properties available for this element.</p>
            </div>
        );
    }

    return (
        <div className="element-properties-panel ae-style">
            <div className="ae-properties-toolbar">
                <div className="ae-toolbar-row">
                    <input
                        type="search"
                        className="ae-properties-search"
                        placeholder="Search properties…"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                </div>
                <div className="ae-toolbar-row ae-element-actions">
                    {elementPresets.length > 0 && (
                        <select
                            className="ae-element-preset"
                            onChange={handlePresetSelection}
                            defaultValue=""
                            title="Apply a preset to this element"
                        >
                            <option value="" disabled>
                                Apply preset…
                            </option>
                            {elementPresets.map((preset) => (
                                <option key={preset.value} value={preset.value}>
                                    {preset.label}
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        type="button"
                        className="ae-element-action"
                        onClick={handleResetAll}
                        title="Reset all properties to their defaults"
                    >
                        <FaRotate />
                    </button>
                    <button
                        type="button"
                        className="ae-element-action"
                        onClick={handleCopyElement}
                        title="Copy all properties for this element"
                    >
                        <FaCopy />
                    </button>
                    <button
                        type="button"
                        className="ae-element-action"
                        disabled={!canPasteElement}
                        onClick={handlePasteElement}
                        title={
                            elementClipboard && elementClipboard.elementType !== elementType
                                ? 'Clipboard contains a different element type'
                                : 'Paste properties from a copied element'
                        }
                    >
                        <FaPaste />
                    </button>
                </div>
            </div>
            {filteredGroups.length === 0 ? (
                <div className="ae-empty-search">No properties match your search.</div>
            ) : (
                filteredGroups.map(({ group, properties }) => (
                    <PropertyGroupPanel
                        key={group.id}
                        group={{ ...group, collapsed: groupCollapseState[group.id] ?? group.collapsed }}
                        properties={properties}
                        values={propertyValues}
                        macroAssignments={macroAssignments}
                        elementId={elementId}
                        delinkedKeys={delinkedKeys}
                        onValueChange={handleValueChange}
                        onMacroAssignment={handleMacroAssignment}
                        onCollapseToggle={handleCollapseToggle}
                    />
                ))
            )}
        </div>
    );
};

export default ElementPropertiesPanel;
