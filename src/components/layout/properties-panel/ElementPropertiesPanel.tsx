import React, { useEffect, useState, useCallback } from 'react';
import BooleanInputRow from './input-rows/BooleanInputRow';
import NumberInputRow from './input-rows/NumberInputRow';
import SelectInputRow from './input-rows/SelectInputRow';
import ColorInputRow from './input-rows/ColorInputRow';
import RangeInputRow from './input-rows/RangeInputRow';
import FileInputRow from './input-rows/FileInputRow';
import TextInputRow from './input-rows/TextInputRow';
// @ts-ignore
import { globalMacroManager } from '../../../visualizer/macro-manager';

interface ElementPropertiesPanelProps {
    element: any; // Required - element must be selected
    schema: any;  // Required - schema must be provided
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;
}

interface FormField {
    key: string;
    propSchema: any;
    value: any;
    isAssignedToMacro: boolean;
    assignedMacro?: any;
}

const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
    element,
    schema,
    onConfigChange
}) => {
    const [formFields, setFormFields] = useState<FormField[]>([]);
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

    // Update form fields when element or schema changes
    useEffect(() => {
        const fields: FormField[] = [];

        for (const [key, propSchema] of Object.entries(schema.properties)) {
            // Check for macro binding in the new property binding system
            let assignedMacro = null;
            let isAssignedToMacro = false;

            if (element && typeof element.getBinding === 'function') {
                // New property binding system
                const binding = element.getBinding(key);
                if (binding && binding.type === 'macro') {
                    const macroId = binding.getMacroId ? binding.getMacroId() : null;
                    if (macroId) {
                        const macro = globalMacroManager.getMacro(macroId);
                        if (macro) {
                            assignedMacro = {
                                macroName: macroId,
                                propertyPath: key,
                                value: macro.value,
                                type: macro.type
                            };
                            isAssignedToMacro = true;
                        }
                    }
                }
            } else {
                console.warn(`[ElementPropertiesPanel] Element ${element?.id} does not support the new property binding system`);
            }

            // Use element.config[key] first, then fall back to element[key] for direct properties
            const value = element.config?.[key] !== undefined ? element.config[key] :
                (element[key] !== undefined ? element[key] : (propSchema as any).default);

            fields.push({
                key,
                propSchema,
                value,
                isAssignedToMacro,
                assignedMacro
            });
        }

        setFormFields(fields);
    }, [element, schema, macroListenerKey]);

    const handleFieldChange = (key: string, value: any) => {
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
                console.log(`Bound property '${propertyKey}' to macro '${macroName}' using property binding system`);
            } else {
                // Unbind from macro (convert to constant binding)
                element.unbindFromMacro(propertyKey);
                console.log(`Unbound property '${propertyKey}' from macro using property binding system`);
            }

            // For bound elements, we don't need to trigger onConfigChange because:
            // 1. The binding is handled internally by the element
            // 2. Calling onConfigChange would trigger updateConfig which overwrites the binding
            // 3. The UI will be updated through the macro listener system
        } else {
            console.warn(`[handleMacroAssignment] Element ${elementId} does not support the new property binding system`);
        }

        // Trigger re-render
        setMacroListenerKey(prev => prev + 1);
    };

    const canAssignMacro = (propertyType: string) => {
        return ['number', 'string', 'boolean', 'color', 'select', 'file'].includes(propertyType);
    };

    const getMacroOptions = (propertyType: string, propertySchema: any) => {
        if (propertyType === 'file') {
            // For file inputs, filter by accept type
            const accept = propertySchema?.accept;
            let targetFileType = 'file'; // default generic file type

            if (accept) {
                if (accept.includes('.mid') || accept.includes('.midi')) {
                    targetFileType = 'file-midi';
                } else if (accept.includes('image')) {
                    targetFileType = 'file-image';
                }
            }

            return globalMacroManager.getAllMacros()
                .filter((macro: any) => macro.type === targetFileType || macro.type === 'file');
        }

        return globalMacroManager.getAllMacros()
            .filter((macro: any) => macro.type === propertyType);
    };

    const renderInput = (field: FormField) => {
        const { key, propSchema, value, isAssignedToMacro, assignedMacro } = field;
        const commonProps = {
            id: `config-${key}`,
            value,
            schema: propSchema,
            disabled: isAssignedToMacro,
            title: isAssignedToMacro ? `Controlled by macro: ${assignedMacro?.macroName}` : undefined,
            onChange: (newValue: any) => handleFieldChange(key, newValue)
        };

        // If assigned to macro, get the macro value
        if (isAssignedToMacro && assignedMacro) {
            const macro = globalMacroManager.getMacro(assignedMacro.macroName);
            if (macro) {
                commonProps.value = macro.value;
            }
        }

        switch (propSchema.type) {
            case 'boolean':
                return <BooleanInputRow {...commonProps} />;
            case 'number':
                return <NumberInputRow {...commonProps} />;
            case 'select':
                return <SelectInputRow {...commonProps} />;
            case 'color':
                return <ColorInputRow {...commonProps} />;
            case 'range':
                return <RangeInputRow {...commonProps} />;
            case 'file':
                return <FileInputRow {...commonProps} />;
            case 'string':
            default:
                return <TextInputRow {...commonProps} />;
        }
    };

    const renderMacroDropdown = (field: FormField) => {
        if (!canAssignMacro(field.propSchema.type)) return null;

        const macros = getMacroOptions(field.propSchema.type, field.propSchema);
        const currentAssignment = field.assignedMacro;

        return (
            <select
                className="macro-assignment-select"
                title="Assign to macro"
                value={currentAssignment?.macroName || ''}
                onChange={(e) => handleMacroAssignment(field.key, e.target.value)}
            >
                <option value="">No macro</option>
                {macros.map((macro: any) => (
                    <option key={macro.name} value={macro.name}>
                        {macro.name} ({macro.type})
                    </option>
                ))}
            </select>
        );
    };

    return (
        <div className="element-properties-panel">
            <div className="element-properties-header">
                <h3>{schema.name}</h3>
                <p className="description">{schema.description}</p>
            </div>

            <form className="element-properties-form" onSubmit={(e) => e.preventDefault()}>
                {formFields.map((field) => {
                    const { key, propSchema } = field;
                    const hasDescription = !!propSchema.description;
                    const isCheckbox = propSchema.type === 'boolean';

                    return (
                        <div
                            key={key}
                            className={`form-field ${hasDescription ? 'has-description' : ''} ${isCheckbox ? 'checkbox-field' : ''}`}
                        >
                            {hasDescription ? (
                                <>
                                    <div className="field-row">
                                        <label htmlFor={`config-${key}`}>
                                            {propSchema.label || key}
                                        </label>
                                        {renderMacroDropdown(field)}
                                        {renderInput(field)}
                                    </div>
                                    <small className="field-description">
                                        {propSchema.description}
                                    </small>
                                </>
                            ) : isCheckbox ? (
                                <div className="field-row">
                                    <label htmlFor={`config-${key}`}>
                                        {propSchema.label || key}
                                    </label>
                                    {renderMacroDropdown(field)}
                                    {renderInput(field)}
                                </div>
                            ) : (
                                <div className="field-row">
                                    <label htmlFor={`config-${key}`}>
                                        {propSchema.label || key}
                                    </label>
                                    {renderMacroDropdown(field)}
                                    {renderInput(field)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </form>
        </div>
    );
};

export default ElementPropertiesPanel;
