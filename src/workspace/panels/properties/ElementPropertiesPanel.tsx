import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropertyGroupPanel from './PropertyGroupPanel';
import { EnhancedConfigSchema, PropertyDefinition } from '@fonts/components';
import { useMacros } from '@context/MacroContext';
import type { ElementBindings } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { FormInputChange } from '@workspace/form/inputs/FormInput';

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

const ANGLE_PROPERTIES = new Set(['elementRotation', 'elementSkewX', 'elementSkewY']);
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const RAD_DISPLAY_THRESHOLD = Math.PI * 2 + 1e-6; // treat small magnitudes as radians

function isAngleProperty(propertyKey: string): boolean {
    return ANGLE_PROPERTIES.has(propertyKey);
}

function normalizeAngleForDisplay(value: number): number {
    if (!Number.isFinite(value)) return value;
    if (Math.abs(value) <= RAD_DISPLAY_THRESHOLD) {
        return value * RAD_TO_DEG;
    }
    return value;
}

function normalizeConstantValue(propertyKey: string, value: unknown) {
    if (value == null) return value;
    if (isAngleProperty(propertyKey) && typeof value === 'number') {
        return normalizeAngleForDisplay(value);
    }
    return value;
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
    const [groupCollapseState, setGroupCollapseState] = useState<Record<string, boolean>>({});
    const [macroListenerKey, setMacroListenerKey] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [groupClipboard, setGroupClipboard] = useState<{
        groupId: string;
        values: Record<string, any>;
        macroAssignments: Record<string, string>;
    } | null>(null);

    const { assignListener, macros: macroList } = useMacros();
    const macroLookup = useMemo(() => new Map((macroList as any[]).map((macro: any) => [macro.name, macro])), [macroList]);

    const bindingsMemo = useMemo(() => ({ ...(bindings ?? {}) }), [bindings, refreshToken]);

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
                        if (isAngleProperty(property.key) && typeof macroValue === 'number') {
                            nextValues[property.key] = normalizeAngleForDisplay(macroValue);
                        } else {
                            nextValues[property.key] = macroValue;
                        }
                    } else {
                        nextValues[property.key] = normalizeConstantValue(property.key, property.default);
                    }
                } else if (binding?.type === 'constant') {
                    nextValues[property.key] = normalizeConstantValue(property.key, binding.value ?? property.default);
                } else if (binding?.type === 'audioFeature') {
                    nextValues[property.key] = {
                        type: 'audioFeature',
                        trackId: binding.trackId,
                        featureKey: binding.featureKey,
                        calculatorId: binding.calculatorId,
                        bandIndex: binding.bandIndex ?? null,
                        channelIndex: binding.channelIndex ?? null,
                        smoothing: binding.smoothing ?? null,
                    };
                } else {
                    nextValues[property.key] = normalizeConstantValue(property.key, property.default);
                }
            });
        });

        setPropertyValues(nextValues);
        setMacroAssignments(nextAssignments);

        setGroupCollapseState((prev) => {
            const next: Record<string, boolean> = {};
            groupedSchema.groups.forEach((group) => {
                next[group.id] = Object.prototype.hasOwnProperty.call(prev, group.id) ? prev[group.id] : group.collapsed;
            });
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length !== nextKeys.length) return next;
            for (const key of nextKeys) {
                if (prev[key] !== next[key]) return next;
            }
            return prev;
        });
    }, [
        schema,
        bindingsMemo,
        macroLookup,
        macroListenerKey,
        elementId,
        elementType,
        refreshToken,
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

    const handleValueChange = useCallback(
        (key: string, value: any, meta?: FormInputChange['meta']) => {
            setPropertyValues((prev) => ({ ...prev, [key]: value }));
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
                let nextValue = value;
                if (isAngleProperty(key) && typeof value === 'number') {
                    nextValue = value * DEG_TO_RAD;
                }
                onConfigChange(elementId, { [key]: nextValue }, options);
            }
        },
        [elementId, onConfigChange],
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
                    let nextValue = currentValue;
                    if (isAngleProperty(propertyKey) && typeof currentValue === 'number') {
                        nextValue = currentValue * DEG_TO_RAD;
                    }
                    onConfigChange(elementId, { [propertyKey]: nextValue });
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
                const patch: Record<string, any> = {};
                Object.entries(changes).forEach(([key, value]) => {
                    if (isAngleProperty(key) && typeof value === 'number') {
                        patch[key] = value * DEG_TO_RAD;
                    } else {
                        patch[key] = value;
                    }
                });
                onConfigChange(elementId, patch);
            }
        },
        [elementId, onConfigChange],
    );

    const handleResetGroup = useCallback(
        (groupId: string) => {
            if (!enhancedSchema) return;
            const group = enhancedSchema.groups.find((entry) => entry.id === groupId);
            if (!group) return;

            const nextValues: Record<string, any> = {};
            group.properties.forEach((property) => {
                const defaultValue = property.default ?? null;
                nextValues[property.key] = defaultValue;
                if (macroAssignments[property.key]) {
                    handleMacroAssignment(property.key, '');
                }
            });

            applyBulkValueChange(nextValues);
        },
        [applyBulkValueChange, enhancedSchema, handleMacroAssignment, macroAssignments],
    );

    const handleApplyPreset = useCallback(
        (groupId: string, presetId: string) => {
            if (!enhancedSchema) return;
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

    const handleCopyGroup = useCallback(
        (groupId: string) => {
            if (!enhancedSchema) return;
            const group = enhancedSchema.groups.find((entry) => entry.id === groupId);
            if (!group) return;

            const values: Record<string, any> = {};
            const macros: Record<string, string> = {};
            group.properties.forEach((property) => {
                values[property.key] = propertyValues[property.key];
                if (macroAssignments[property.key]) {
                    macros[property.key] = macroAssignments[property.key];
                }
            });

            setGroupClipboard({ groupId, values, macroAssignments: macros });
        },
        [enhancedSchema, macroAssignments, propertyValues],
    );

    const handlePasteGroup = useCallback(
        (groupId: string) => {
            if (!enhancedSchema || !groupClipboard) return;
            const group = enhancedSchema.groups.find((entry) => entry.id === groupId);
            if (!group) return;

            const nextValues: Record<string, any> = {};
            group.properties.forEach((property) => {
                if (Object.prototype.hasOwnProperty.call(groupClipboard.values, property.key)) {
                    nextValues[property.key] = groupClipboard.values[property.key];
                }
            });

            applyBulkValueChange(nextValues);

            group.properties.forEach((property) => {
                const macroName = groupClipboard.macroAssignments[property.key];
                if (macroName && macroLookup.has(macroName)) {
                    handleMacroAssignment(property.key, macroName);
                } else if (macroAssignments[property.key]) {
                    handleMacroAssignment(property.key, '');
                }
            });
        },
        [applyBulkValueChange, enhancedSchema, groupClipboard, handleMacroAssignment, macroAssignments, macroLookup],
    );

    const handleCollapseToggle = useCallback((groupId: string) => {
        setGroupCollapseState((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
    }, []);

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
                <input
                    type="search"
                    className="ae-properties-search"
                    placeholder="Search properties…"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                />
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
                        onValueChange={handleValueChange}
                        onMacroAssignment={handleMacroAssignment}
                        onCollapseToggle={handleCollapseToggle}
                        onResetGroup={handleResetGroup}
                        onApplyPreset={handleApplyPreset}
                        onCopyGroup={handleCopyGroup}
                        onPasteGroup={handlePasteGroup}
                        canPasteGroup={!!groupClipboard}
                    />
                ))
            )}
        </div>
    );
};

export default ElementPropertiesPanel;
