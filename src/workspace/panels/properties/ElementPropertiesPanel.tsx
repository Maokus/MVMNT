import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropertyGroupPanel from './PropertyGroupPanel';
import { EnhancedConfigSchema } from '@fonts/components';
import { useMacros } from '@context/MacroContext';
import type { ElementBindings } from '@state/sceneStore';

interface ElementPropertiesPanelProps {
    elementId: string;
    elementType: string;
    schema: EnhancedConfigSchema | null;
    bindings: ElementBindings;
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;
    refreshToken?: number;
}

interface PropertyValues {
    [key: string]: any;
}

interface MacroAssignments {
    [key: string]: string;
}

const ANGLE_PROPERTIES = new Set(['elementRotation', 'elementSkewX', 'elementSkewY']);

function normalizeConstantValue(propertyKey: string, value: unknown) {
    if (value == null) return value;
    if (ANGLE_PROPERTIES.has(propertyKey) && typeof value === 'number') {
        return value;
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
        () => (schema as EnhancedConfigSchema) ?? null
    );
    const [propertyValues, setPropertyValues] = useState<PropertyValues>({});
    const [macroAssignments, setMacroAssignments] = useState<MacroAssignments>({});
    const [groupCollapseState, setGroupCollapseState] = useState<Record<string, boolean>>({});
    const [macroListenerKey, setMacroListenerKey] = useState(0);

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
                        nextValues[property.key] = macro.value;
                    } else {
                        nextValues[property.key] = property.default;
                    }
                } else if (binding?.type === 'constant') {
                    nextValues[property.key] = normalizeConstantValue(property.key, binding.value ?? property.default);
                } else {
                    nextValues[property.key] = property.default;
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

    const handleValueChange = useCallback(
        (key: string, value: any) => {
            setPropertyValues((prev) => ({ ...prev, [key]: value }));
            if (onConfigChange) {
                onConfigChange(elementId, { [key]: value });
            }
        },
        [elementId, onConfigChange]
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
        [elementId, onConfigChange, propertyValues]
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
            {enhancedSchema.groups.map((group) => (
                <PropertyGroupPanel
                    key={group.id}
                    group={{ ...group, collapsed: groupCollapseState[group.id] ?? group.collapsed }}
                    values={propertyValues}
                    macroAssignments={macroAssignments}
                    onValueChange={handleValueChange}
                    onMacroAssignment={handleMacroAssignment}
                    onCollapseToggle={handleCollapseToggle}
                />
            ))}
        </div>
    );
};

export default ElementPropertiesPanel;
