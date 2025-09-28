import React, { useMemo, useState, useRef, useEffect } from 'react';
import { PropertyGroup, PropertyDefinition } from '@core/types';
import FormInput from '@workspace/form/inputs/FormInput';
import FontInput from '@workspace/form/inputs/FontInput';
// @ts-ignore
import { useMacros } from '@context/MacroContext';
import { useTimelineStore } from '@state/timelineStore';

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
    const { macros: macroList } = useMacros();
    const macrosSource = useMemo(() => (macroList as any[]), [macroList]);
    const macroLookup = useMemo(
        () => new Map((macrosSource as any[]).map((macro: any) => [macro.name, macro])),
        [macrosSource]
    );
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
        const macroExists = assignedMacro ? macroLookup.has(assignedMacro) : false;
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
            const macro = macroLookup.get(assignedMacro);
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

    const MacroAssignmentControl: React.FC<{
        propertyKey: string;
        assignedMacro?: string;
        isAssigned: boolean;
        macros: any[];
        onAssign: (macroName: string) => void;
    }> = ({ propertyKey, assignedMacro, isAssigned, macros, onAssign }) => {
        const [isOpen, setIsOpen] = useState(false);
        const triggerRef = useRef<HTMLButtonElement | null>(null);
        const menuRef = useRef<HTMLDivElement | null>(null);

        useEffect(() => {
            if (!isOpen) return;

            const handleClickOutside = (event: MouseEvent) => {
                if (
                    menuRef.current &&
                    !menuRef.current.contains(event.target as Node) &&
                    triggerRef.current &&
                    !triggerRef.current.contains(event.target as Node)
                ) {
                    setIsOpen(false);
                }
            };

            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    setIsOpen(false);
                }
            };

            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);

            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('keydown', handleKeyDown);
            };
        }, [isOpen]);

        const handleAssign = (macroName: string) => {
            onAssign(macroName);
            setIsOpen(false);
        };

        const assignedMacroExists = isAssigned && assignedMacro ? true : false;
        const displayLabel = (() => {
            if (assignedMacroExists && assignedMacro) {
                return `🎵 ${assignedMacro}`;
            }
            if (assignedMacro && !assignedMacroExists) {
                return `⚠️ ${assignedMacro}`;
            }
            return '🔗 Assign Macro';
        })();

        const hasMacros = macros.length > 0;
        const canRemove = !!assignedMacro;
        const isDisabled = !hasMacros && !assignedMacro;

        return (
            <div className="ae-macro-assignment">
                <button
                    ref={triggerRef}
                    type="button"
                    className={`ae-macro-trigger ${assignedMacroExists ? 'assigned' : ''} ${isDisabled ? 'disabled' : ''
                        }`}
                    disabled={isDisabled}
                    onClick={() => setIsOpen((prev) => !prev)}
                    title={assignedMacroExists ? 'Bound to macro' : hasMacros ? 'Link this property to a macro' : 'No macros available'}
                >
                    <span className="ae-macro-label-text">{displayLabel}</span>
                    {(hasMacros || assignedMacro) && <span className="ae-macro-caret">▼</span>}
                </button>
                {isOpen && (
                    <div ref={menuRef} className="ae-macro-menu">
                        <div className="ae-macro-options">
                            {hasMacros ? (
                                macros.map((macro: any) => (
                                    <button
                                        key={`${propertyKey}-${macro.name}`}
                                        type="button"
                                        className="ae-macro-option"
                                        onClick={() => handleAssign(macro.name)}
                                    >
                                        {macro.name}
                                    </button>
                                ))
                            ) : (
                                <div className="ae-macro-empty">No macros available</div>
                            )}
                            {canRemove && (
                                <>
                                    <div className="ae-macro-divider" />
                                    <button
                                        type="button"
                                        className="ae-macro-option danger"
                                        onClick={() => handleAssign('')}
                                    >
                                        Remove Macro
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderMacroDropdown = (property: PropertyDefinition) => {
        if (!canAssignMacro(property.type)) return null;

        const macros = getMacroOptions(property.type, property);
        const currentAssignment = macroAssignments[property.key];
        const isAssigned = !!currentAssignment && macroLookup.has(currentAssignment);

        return (
            <MacroAssignmentControl
                propertyKey={property.key}
                assignedMacro={currentAssignment}
                isAssigned={isAssigned}
                macros={macros}
                onAssign={(macroName) => onMacroAssignment(property.key, macroName)}
            />
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
