import React, { useMemo } from 'react';
import { PropertyGroup, PropertyDefinition } from '@core/types';
import FormInput from '@workspace/form/inputs/FormInput';
import FontInput from '@workspace/form/inputs/FontInput';
// @ts-ignore
import { useMacros } from '@context/MacroContext';
import { useTimelineStore } from '@state/timelineStore';
import { enableSceneStoreMacros } from '@config/featureFlags';

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
    const { manager, macros: macroList } = useMacros();
    const macrosSource = useMemo(
        () => (enableSceneStoreMacros ? (macroList as any[]) : manager.getAllMacros()),
        [macroList, manager, enableSceneStoreMacros]
    );
    const macroLookup = useMemo(() => new Map(
        (macrosSource as any[]).map((macro: any) => [macro.name, macro])
    ), [macrosSource]);
    const canAssignMacro = (propertyType: string) => {
        return ['number', 'string', 'boolean', 'color', 'select', 'file', 'font', 'midiTrackRef'].includes(propertyType);
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
            return (macrosSource as any[]).filter((macro: any) => macro.type === targetFileType || macro.type === 'file');
        }
        if (propertyType === 'font') {
            // Only allow macros explicitly of type 'font'
            return (macrosSource as any[]).filter((macro: any) => macro.type === 'font');
        }
        return (macrosSource as any[]).filter((macro: any) => macro.type === propertyType);
    };

    const renderInput = (property: PropertyDefinition) => {
        const value = values[property.key];
        const assignedMacro = macroAssignments[property.key];
        const macroExists = assignedMacro
            ? enableSceneStoreMacros
                ? macroLookup.has(assignedMacro)
                : !!manager.getMacro(assignedMacro)
            : false;
        const isAssignedToMacro = !!assignedMacro && macroExists;

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
            const macro = enableSceneStoreMacros
                ? macroLookup.get(assignedMacro)
                : manager.getMacro(assignedMacro);
            if (macro) {
                commonProps.value = macro.value;
            }
        }

        // Use the consolidated FormInput for all types (it delegates to specialized components internally)
        const inputType = property.type === 'string' ? 'text' : property.type;
        const inputEl = (
            <FormInput
                id={commonProps.id}
                type={inputType}
                value={commonProps.value}
                schema={commonProps.schema}
                disabled={commonProps.disabled}
                title={commonProps.title}
                onChange={commonProps.onChange}
            />
        );

        // midiFile migration CTA removed

        return inputEl;
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
