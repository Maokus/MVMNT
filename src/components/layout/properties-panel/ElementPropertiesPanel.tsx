import React, { useEffect, useState, useCallback } from 'react';
import PropertyGroupPanel from './PropertyGroupPanel';
import { SchemaConverter } from './SchemaConverter';
import { EnhancedConfigSchema } from '../../types';
// @ts-ignore
import { globalMacroManager } from '../../../visualizer/macro-manager';

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

    // Handle macro changes
    const handleMacroChange = useCallback((eventType: string, data: any) => {
        if (!element) return;

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

    // Setup macro manager listener
    useEffect(() => {
        const listener = (eventType: string, data: any) => {
            handleMacroChange(eventType, data);
        };

        globalMacroManager.addListener(listener);

        return () => {
            globalMacroManager.removeListener(listener);
        };
    }, [handleMacroChange]);

    // Convert schema and extract property values
    useEffect(() => {
        if (!schema) return;

        // Convert legacy schema to grouped format
        const convertedSchema = SchemaConverter.convertToGroupedSchema(schema);
        setEnhancedSchema(convertedSchema);

        // Extract current property values
        const values: PropertyValues = {};
        const macroBindings: MacroAssignments = {};

        // Get all properties from all groups
        convertedSchema.groups.forEach(group => {
            group.properties.forEach(property => {
                // Get property value
                const value = element.config?.[property.key] !== undefined
                    ? element.config[property.key]
                    : (element[property.key] !== undefined ? element[property.key] : property.default);

                values[property.key] = value;

                // Check for macro binding
                if (element && typeof element.getBinding === 'function') {
                    const binding = element.getBinding(property.key);
                    if (binding && binding.type === 'macro') {
                        const macroId = binding.getMacroId ? binding.getMacroId() : null;
                        if (macroId) {
                            macroBindings[property.key] = macroId;
                        }
                    }
                }
            });
        });

        setPropertyValues(values);
        setMacroAssignments(macroBindings);

        // Initialize collapse state for new groups
        const newCollapseState: { [groupId: string]: boolean } = {};
        convertedSchema.groups.forEach(group => {
            if (!(group.id in groupCollapseState)) {
                newCollapseState[group.id] = group.collapsed;
            } else {
                newCollapseState[group.id] = groupCollapseState[group.id];
            }
        });
        setGroupCollapseState(newCollapseState);

    }, [element, schema, macroListenerKey, groupCollapseState]);

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
