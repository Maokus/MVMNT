import React, { useMemo, useState, useRef, useEffect } from 'react';
import { PropertyGroup, PropertyDefinition } from '@core/types';
import FormInput from '@workspace/form/inputs/FormInput';
import FontInput from '@workspace/form/inputs/FontInput';
// @ts-ignore
import { useMacros } from '@context/MacroContext';
import { useTimelineStore } from '@state/timelineStore';
import { FaLink } from 'react-icons/fa';

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
    const { macros: macroList, create: createMacro } = useMacros();
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
        property: PropertyDefinition;
        currentValue: any;
        assignedMacro?: string;
        isAssigned: boolean;
        macros: any[];
        onAssign: (macroName: string) => void;
    }> = ({ propertyKey, property, currentValue, assignedMacro, isAssigned, macros, onAssign }) => {
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

        // Generate a unique macro name derived from the property label/key
        const generateMacroName = () => {
            const baseSource = property.label || property.key || 'Macro';
            const base = baseSource
                .replace(/[^a-zA-Z0-9]+/g, ' ')
                .trim()
                .split(/\s+/)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join('') || 'Macro';
            let candidate = base;
            let i = 1;
            while (macroLookup.has(candidate)) {
                candidate = base + i;
                i++;
            }
            return candidate;
        };

        const mapPropertyToMacroType = (prop: PropertyDefinition): { type: string; options: any; value: any } => {
            let macroType: string = prop.type;
            if (macroType === 'range') macroType = 'number';
            if (macroType === 'file') {
                if (prop.accept) {
                    if (/(\.mid|\.midi)/i.test(prop.accept)) macroType = 'file-midi';
                    else if (/image/i.test(prop.accept)) macroType = 'file-image';
                }
            }
            let value = currentValue;
            if (value === undefined) value = prop.default;
            const options: any = {};
            switch (macroType) {
                case 'number':
                    if (typeof value !== 'number') value = typeof value === 'string' ? parseFloat(value) || 0 : 0;
                    break;
                case 'select':
                    if (prop.options) options.selectOptions = prop.options;
                    break;
                case 'file':
                case 'file-midi':
                case 'file-image':
                    if (prop.accept) options.accept = prop.accept;
                    // file-type macros default to null if not an actual File object
                    if (value && typeof value !== 'object') value = null;
                    break;
                case 'boolean':
                    value = !!value;
                    break;
                case 'font':
                    if (typeof value !== 'string' || !value) value = 'Arial|400';
                    break;
                case 'midiTrackRef':
                    if (prop.allowMultiple !== undefined) options.allowMultiple = prop.allowMultiple;
                    if (value == null) value = null;
                    break;
                default:
                    // string, color, etc.
                    if (value == null) value = '';
            }
            return { type: macroType, options, value };
        };

        const createAndAssignNewMacro = () => {
            const name = generateMacroName();
            const { type, options, value } = mapPropertyToMacroType(property);
            const success = createMacro(name, type as any, value, options);
            if (success) {
                onAssign(name);
            } else {
                console.warn('[PropertyGroupPanel] Failed to auto-create macro', { name, type, value });
            }
        };

        return (
            <div className="ae-macro-assignment">
                <button
                    ref={triggerRef}
                    type="button"
                    className={`ae-macro-trigger ${assignedMacroExists ? 'assigned' : ''}`}
                    onClick={() => {
                        if (!hasMacros && !assignedMacro) {
                            // Auto-create and assign
                            createAndAssignNewMacro();
                        } else {
                            setIsOpen((prev) => !prev);
                        }
                    }}
                    title={'assign to macro'}
                >
                    <span className="ae-macro-label-text">{assignedMacro ? displayLabel : <FaLink />}</span>
                    {(hasMacros || assignedMacro) && <span className="ae-macro-caret">▼</span>}
                </button>
                {isOpen && (
                    <div ref={menuRef} className="ae-macro-menu">
                        <div className="ae-macro-options">
                            {hasMacros && <div className="ae-macro-divider" />}
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
                            <button
                                type="button"
                                className="ae-macro-option"
                                onClick={() => {
                                    createAndAssignNewMacro();
                                    setIsOpen(false);
                                }}
                            >
                                + Assign to New Macro
                            </button>
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
                property={property}
                currentValue={values[property.key]}
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
