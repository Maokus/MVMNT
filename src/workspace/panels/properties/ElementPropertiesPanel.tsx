import React, { useEffect, useState, useCallback, useMemo } from 'react';
import PropertyGroupPanel from './PropertyGroupPanel';
import { EnhancedConfigSchema } from '@fonts/components';
import { useMacros } from '@context/MacroContext';
import { enableSceneStoreMacros } from '@config/featureFlags';

interface ElementPropertiesPanelProps {
    element: any; // Required - element must be selected
    schema: any;  // Required - schema must be provided
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;
}

interface PropertyValues {
    [key: string]: any;
}

interface MacroAssignments {
    [key: string]: string;
}

const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
    element,
    schema,
    onConfigChange
}) => {
    const [enhancedSchema, setEnhancedSchema] = useState<EnhancedConfigSchema | null>(null);
    const [propertyValues, setPropertyValues] = useState<PropertyValues>({});
    const [macroAssignments, setMacroAssignments] = useState<MacroAssignments>({});
    const [groupCollapseState, setGroupCollapseState] = useState<{ [groupId: string]: boolean }>({});
    const [macroListenerKey, setMacroListenerKey] = useState(0);

    // Macro context
    const { assignListener, manager, macros: macroList } = useMacros();
    const macroLookup = useMemo(() => new Map((macroList as any[]).map((macro: any) => [macro.name, macro])), [macroList]);

    // Handle macro changes
    const handleMacroChange = useCallback((eventType: string, data: any) => {
        if (!element) return;

        if (eventType === 'macroStoreUpdated') {
            setMacroListenerKey(prev => prev + 1);
            return;
        }

        if (eventType === 'macroValueChanged') {
            // Update element property via change callback
            const relevantAssignments = data.assignments.filter(
                (assignment: any) => assignment.elementId === element.id
            );

            for (const assignment of relevantAssignments) {
                if (onConfigChange) {
                    onConfigChange(element.id, { [assignment.propertyPath]: data.value });
                }
            }
        } else if (eventType === 'macroAssigned' || eventType === 'macroUnassigned') {
            // Re-render form when macro assignments change
            if (data.elementId === element.id) {
                setMacroListenerKey(prev => prev + 1);
            }
        }
    }, [element, onConfigChange]);

    // Setup macro manager listener via context
    useEffect(() => {
        const unsubscribe = assignListener(handleMacroChange);
        return () => unsubscribe();
    }, [handleMacroChange, assignListener]);

    // Use grouped schema directly and extract property values
    useEffect(() => {
        if (!schema) return;

        // Assume schema is already in grouped format
        const groupedSchema = schema as EnhancedConfigSchema;
        setEnhancedSchema(groupedSchema);

        // Extract current property values using the binding system rather than element.config
        const values: PropertyValues = {};
        const macroBindings: MacroAssignments = {};

        // If the element exposes getConfig (SceneElement does) we can pull a snapshot once.
        // This already normalizes angle properties back to degrees for UI use.
        let currentConfig: any = undefined;
        if (element && typeof element.getConfig === 'function') {
            try {
                currentConfig = element.getConfig();
            } catch (e) {
                console.warn('[ElementPropertiesPanel] getConfig() failed, falling back to direct bindings', e);
            }
        }

        groupedSchema.groups.forEach(group => {
            group.properties.forEach(property => {
                let value: any;
                if (currentConfig && currentConfig[property.key] !== undefined) {
                    value = currentConfig[property.key];
                } else if (element && typeof element.getBinding === 'function') {
                    // Fallback: read directly from binding
                    const binding = element.getBinding(property.key);
                    if (binding) {
                        value = binding.getValue();
                        // Angle-like properties (rotation/skew) are stored internally in radians when constant
                        if (
                            (property.key === 'elementRotation' || property.key === 'elementSkewX' || property.key === 'elementSkewY') &&
                            typeof value === 'number' && binding.type === 'constant'
                        ) {
                            value = value * (180 / Math.PI);
                        }
                    }
                } else if (element && element[property.key] !== undefined) {
                    // Direct property (not expected for new binding system but kept for safety)
                    value = element[property.key];
                } else {
                    value = property.default;
                }

                values[property.key] = value;

                // Determine macro bindings
                if (element && typeof element.getBinding === 'function') {
                    const binding = element.getBinding(property.key);
                    if (binding && binding.type === 'macro') {
                        const macroId = binding.getMacroId ? binding.getMacroId() : null;
                        // Only treat as assigned if the macro actually exists. If not, auto-unbind to recover.
                        const macroExists = macroId
                            ? enableSceneStoreMacros
                                ? macroLookup.has(macroId)
                                : !!manager?.getMacro(macroId)
                            : false;
                        if (macroId && macroExists) {
                            macroBindings[property.key] = macroId;
                        } else if (macroId && typeof element.unbindFromMacro === 'function') {
                            try {
                                element.unbindFromMacro(property.key);
                            } catch { }
                        }
                    }
                }
            });
        });

        setPropertyValues(values);
        setMacroAssignments(macroBindings);

        // Initialize/merge collapse state for groups without causing loops
        setGroupCollapseState(prev => {
            const next: { [groupId: string]: boolean } = {};
            groupedSchema.groups.forEach(group => {
                next[group.id] = Object.prototype.hasOwnProperty.call(prev, group.id)
                    ? prev[group.id]
                    : group.collapsed;
            });

            // Detect changes to avoid unnecessary state updates
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length !== nextKeys.length) {
                return next;
            }
            for (const k of nextKeys) {
                if (prev[k] !== next[k]) {
                    return next;
                }
            }
            return prev; // no change
        });

    }, [element, schema, macroListenerKey]);

    const handleValueChange = (key: string, value: any) => {
        setPropertyValues(prev => ({ ...prev, [key]: value }));
        if (onConfigChange) {
            onConfigChange(element.id, { [key]: value });
        }
    };

    const handleMacroAssignment = (propertyKey: string, macroName: string) => {
        const elementId = element.id;

        // Check if this is a bound element that supports the new property binding system
        if (element && typeof element.bindToMacro === 'function' && typeof element.unbindFromMacro === 'function') {
            // New property binding system: directly bind/unbind the property
            if (macroName) {
                // Bind to the selected macro
                element.bindToMacro(propertyKey, macroName);
                setMacroAssignments(prev => ({ ...prev, [propertyKey]: macroName }));
                console.log(`Bound property '${propertyKey}' to macro '${macroName}' using property binding system`);
            } else {
                // Unbind from macro (convert to constant binding)
                element.unbindFromMacro(propertyKey);
                setMacroAssignments(prev => {
                    const newAssignments = { ...prev };
                    delete newAssignments[propertyKey];
                    return newAssignments;
                });
                console.log(`Unbound property '${propertyKey}' from macro using property binding system`);
            }
        } else {
            console.warn(`[handleMacroAssignment] Element ${elementId} does not support the new property binding system`);
        }

        // Trigger re-render
        setMacroListenerKey(prev => prev + 1);

        // Force visualizer to re-render so elements can react to new bindings immediately
        if (typeof window !== 'undefined') {
            const vis: any = (window as any).debugVisualizer;
            if (vis && typeof vis.invalidateRender === 'function') {
                vis.invalidateRender();
            }
        }
    };

    const handleCollapseToggle = (groupId: string) => {
        setGroupCollapseState(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    if (!enhancedSchema) {
        return <div className="element-properties-panel">Loading...</div>;
    }

    // Update the enhanced schema with current collapse states
    const updatedSchema: EnhancedConfigSchema = {
        ...enhancedSchema,
        groups: enhancedSchema.groups.map(group => ({
            ...group,
            collapsed: groupCollapseState[group.id] ?? group.collapsed
        }))
    };

    return (
        <div className="element-properties-panel ae-style">
            <div className="ae-element-header">
                <h3 className="ae-element-title">{enhancedSchema.name}</h3>
            </div>

            <div className="ae-properties-container">
                {updatedSchema.groups.map((group) => (
                    <PropertyGroupPanel
                        key={group.id}
                        group={group}
                        values={propertyValues}
                        macroAssignments={macroAssignments}
                        onValueChange={handleValueChange}
                        onMacroAssignment={handleMacroAssignment}
                        onCollapseToggle={handleCollapseToggle}
                    />
                ))}
            </div>
        </div>
    );
};

export default ElementPropertiesPanel;
