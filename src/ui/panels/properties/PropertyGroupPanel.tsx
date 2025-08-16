import React from 'react';
import { PropertyGroup, PropertyDefinition } from '@core/types';
import BooleanInputRow from 'components/layout/properties-panel/input-rows/BooleanInputRow';
import NumberInputRow from 'components/layout/properties-panel/input-rows/NumberInputRow';
import SelectInputRow from 'components/layout/properties-panel/input-rows/SelectInputRow';
import ColorInputRow from 'components/layout/properties-panel/input-rows/ColorInputRow';
import RangeInputRow from 'components/layout/properties-panel/input-rows/RangeInputRow';
import FileInputRow from 'components/layout/properties-panel/input-rows/FileInputRow';
import TextInputRow from 'components/layout/properties-panel/input-rows/TextInputRow';
import FontInputRow from 'components/layout/properties-panel/input-rows/FontInputRow';
// @ts-ignore
import { useMacros } from '@context/MacroContext';

interface PropertyGroupPanelProps {
    group: PropertyGroup;
    values: { [key: string]: any };
    macroAssignments: { [key: string]: string };
    onValueChange: (key: string, value: any) => void;
    onMacroAssignment: (propertyKey: string, macroName: string) => void;
    onCollapseToggle: (groupId: string) => void;
}

const PropertyGroupPanel: React.FC<PropertyGroupPanelProps> = ({
    group,
    values,
    macroAssignments,
    onValueChange,
    onMacroAssignment,
    onCollapseToggle
}) => {
    const { manager } = useMacros();
    const canAssignMacro = (propertyType: string) => {
        return ['number', 'string', 'boolean', 'color', 'select', 'file', 'font'].includes(propertyType);
    };

    const getMacroOptions = (propertyType: string, propertySchema: PropertyDefinition) => {
        if (propertyType === 'file') {
            // For file inputs, filter by accept type
            const accept = propertySchema?.accept;
            let targetFileType = 'file';
            if (accept) {
                if (accept.includes('.mid') || accept.includes('.midi')) {
                    targetFileType = 'file-midi';
                } else if (accept.includes('image')) {
                    targetFileType = 'file-image';
                }
            }
            return manager.getAllMacros().filter((macro: any) => macro.type === targetFileType || macro.type === 'file');
        }
        if (propertyType === 'font') {
            // Only allow macros explicitly of type 'font'
            return manager.getAllMacros().filter((macro: any) => macro.type === 'font');
        }
        return manager.getAllMacros().filter((macro: any) => macro.type === propertyType);
    };

    const renderInput = (property: PropertyDefinition) => {
        const value = values[property.key];
        const isAssignedToMacro = !!macroAssignments[property.key];
        const assignedMacro = macroAssignments[property.key];

        const commonProps = {
            id: `config-${property.key}`,
            value,
            schema: property,
            disabled: isAssignedToMacro,
            title: property.description, // Use description as tooltip
            onChange: (newValue: any) => onValueChange(property.key, newValue)
        };

        // If assigned to macro, get the macro value
        if (isAssignedToMacro && assignedMacro) {
            const macro = manager.getMacro(assignedMacro);
            if (macro) {
                commonProps.value = macro.value;
            }
        }

        switch (property.type) {
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
            case 'font':
                return <FontInputRow {...commonProps} />;
            case 'string':
            default:
                return <TextInputRow {...commonProps} />;
        }
    };

    const renderMacroDropdown = (property: PropertyDefinition) => {
        if (!canAssignMacro(property.type)) return null;

        const macros = getMacroOptions(property.type, property);
        const currentAssignment = macroAssignments[property.key];

        return (
            <select
                className="ae-macro-assignment"
                title="Assign to macro"
                value={currentAssignment || ''}
                onChange={(e) => onMacroAssignment(property.key, e.target.value)}
            >
                <option value="">No macro</option>
                {macros.map((macro: any) => (
                    <option key={macro.name} value={macro.name}>
                        {macro.name}
                    </option>
                ))}
            </select>
        );
    };

    return (
        <div className="ae-property-group">
            <div
                className="ae-group-header"
                onClick={() => onCollapseToggle(group.id)}
            >
                <span className={`ae-collapse-icon ${group.collapsed ? 'collapsed' : 'expanded'}`}>
                    ▼
                </span>
                <span className="ae-group-label">{group.label}</span>
            </div>

            {!group.collapsed && (
                <div className="ae-property-list">
                    {group.properties.map((property) => {
                        const isAssignedToMacro = !!macroAssignments[property.key];
                        const hasAnimationIcon = canAssignMacro(property.type);

                        return (
                            <div key={property.key} className="ae-property-row">
                                <div className="ae-property-label">
                                    <span
                                        className="ae-property-name"
                                        title={property.description}
                                    >
                                        {property.label}
                                    </span>
                                    {hasAnimationIcon && (
                                        <span
                                            className={`ae-animation-icon ${isAssignedToMacro ? 'active' : ''}`}
                                            title={isAssignedToMacro ? 'Bound to macro' : 'Click to bind to macro'}
                                        >
                                            ⏱
                                        </span>
                                    )}
                                </div>

                                <div className="ae-property-controls">
                                    {renderMacroDropdown(property)}
                                    <div className="ae-property-input">
                                        {renderInput(property)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PropertyGroupPanel;
