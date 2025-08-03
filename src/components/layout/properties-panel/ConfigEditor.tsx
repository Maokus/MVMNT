import React, { useEffect, useState, useCallback } from 'react';
import BooleanInput from './inputs/BooleanInput';
import NumberInput from './inputs/NumberInput';
import SelectInput from './inputs/SelectInput';
import ColorInput from './inputs/ColorInput';
import RangeInput from './inputs/RangeInput';
import FileInput from './inputs/FileInput';
import TextInput from './inputs/TextInput';
// @ts-ignore
import { globalMacroManager } from '../../../visualizer/macro-manager';

interface ConfigEditorProps {
    element: any;
    schema: any;
    onConfigChange: (elementId: string, changes: { [key: string]: any }) => void;
}

interface FormField {
    key: string;
    propSchema: any;
    value: any;
    isAssignedToMacro: boolean;
    assignedMacro?: any;
}

const ConfigEditor: React.FC<ConfigEditorProps> = ({ element, schema, onConfigChange }) => {
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
        if (!element || !schema) {
            setFormFields([]);
            return;
        }

        const elementMacros = globalMacroManager.getElementMacros(element.id);
        const fields: FormField[] = [];

        for (const [key, propSchema] of Object.entries(schema.properties)) {
            const assignedMacro = elementMacros.find((m: any) => m.propertyPath === key);
            const isAssignedToMacro = !!assignedMacro;

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

        // Remove any existing assignment for this property
        const elementMacros = globalMacroManager.getElementMacros(elementId);
        const currentAssignment = elementMacros.find((m: any) => m.propertyPath === propertyKey);
        if (currentAssignment) {
            globalMacroManager.unassignMacroFromProperty(
                currentAssignment.macroName,
                elementId,
                propertyKey
            );
        }

        // Add new assignment if a macro was selected
        if (macroName) {
            globalMacroManager.assignMacroToProperty(macroName, elementId, propertyKey);
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
                return <BooleanInput {...commonProps} />;
            case 'number':
                return <NumberInput {...commonProps} />;
            case 'select':
                return <SelectInput {...commonProps} />;
            case 'color':
                return <ColorInput {...commonProps} />;
            case 'range':
                return <RangeInput {...commonProps} />;
            case 'file':
                return <FileInput {...commonProps} />;
            case 'string':
            default:
                return <TextInput {...commonProps} />;
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

    if (!element || !schema) {
        return <p>No element selected</p>;
    }

    return (
        <div className="config-editor">
            <div className="config-editor-header">
                <h3>{schema.name}</h3>
                <p className="description">{schema.description}</p>
            </div>

            <form className="config-editor-form" onSubmit={(e) => e.preventDefault()}>
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

export default ConfigEditor;
