import React, { useMemo, useState, useRef, useEffect } from 'react';
import { PropertyGroup, PropertyDefinition } from '@core/types';
import FormInput, { type FormInputChange } from '@workspace/form/inputs/FormInput';
// @ts-ignore
import { useMacros } from '@context/MacroContext';
import { FaLink } from 'react-icons/fa';

const ANGLE_PROPERTIES = new Set(['elementRotation', 'elementSkewX', 'elementSkewY']);

interface PropertyGroupPanelProps {
    group: PropertyGroup;
    properties: PropertyDefinition[];
    values: { [key: string]: any };
    macroAssignments: { [key: string]: string };
    onValueChange: (key: string, value: any, meta?: FormInputChange['meta']) => void;
    onMacroAssignment: (propertyKey: string, macroName: string) => void;
    onCollapseToggle: (groupId: string) => void;
}

const PropertyGroupPanel: React.FC<PropertyGroupPanelProps> = ({
    group,
    properties,
    values,
    macroAssignments,
    onValueChange,
    onMacroAssignment,
    onCollapseToggle,
}) => {
    const { macros: macroList, create: createMacro } = useMacros();
    const macrosSource = useMemo(() => macroList as any[], [macroList]);
    const macroLookup = useMemo(
        () => new Map((macrosSource as any[]).map((macro: any) => [macro.name, macro])),
        [macrosSource],
    );

    const canAssignMacro = (propertyType: string) => {
        const normalizedType = propertyType === 'range' ? 'number' : propertyType;
        return [
            'number',
            'string',
            'boolean',
            'color',
            'select',
            'file',
            'font',
            'midiTrackRef',
        ].includes(normalizedType);
    };

    const getMacroOptions = (propertyType: string, propertySchema: PropertyDefinition) => {
        let macroType = propertyType === 'range' ? 'number' : propertyType;
        if (macroType === 'file') {
            const accept = propertySchema?.accept;
            let targetFileType = 'file';
            if (accept) {
                if (accept.includes('.mid') || accept.includes('.midi')) {
                    targetFileType = 'file-midi';
                } else if (accept.includes('image')) {
                    targetFileType = 'file-image';
                }
            }
            return (macrosSource as any[]).filter(
                (macro: any) => macro.type === targetFileType || macro.type === 'file',
            );
        }
        if (macroType === 'font') {
            return (macrosSource as any[]).filter((macro: any) => macro.type === 'font');
        }
        return (macrosSource as any[]).filter((macro: any) => macro.type === macroType);
    };

    const mapPropertyToMacroType = (prop: PropertyDefinition, currentValue: any): { type: string; options: any; value: any } => {
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
                if (ANGLE_PROPERTIES.has(prop.key) && typeof value === 'number') {
                    value = value * (Math.PI / 180);
                }
                break;
            case 'select':
                if (prop.options) options.selectOptions = prop.options;
                break;
            case 'file':
            case 'file-midi':
            case 'file-image':
                if (prop.accept) options.accept = prop.accept;
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
                if (value == null) value = '';
        }
        return { type: macroType, options, value };
    };

    const renderInput = (property: PropertyDefinition) => {
        const value = values[property.key];
        const assignedMacro = macroAssignments[property.key];
        const macroExists = assignedMacro ? macroLookup.has(assignedMacro) : false;
        const isAssignedToMacro = !!assignedMacro && macroExists;

        const handleInputChange = (payload: any) => {
            if (payload && typeof payload === 'object' && 'value' in payload) {
                const change = payload as FormInputChange;
                onValueChange(property.key, change.value, change.meta);
            } else {
                onValueChange(property.key, payload);
            }
        };

        const commonProps = {
            id: `config-${property.key}`,
            value,
            schema: property,
            disabled: isAssignedToMacro,
            title: property.description,
            onChange: handleInputChange,
        };

        if (isAssignedToMacro && assignedMacro) {
            const macro = macroLookup.get(assignedMacro);
            if (macro) {
                commonProps.value = macro.value;
            }
        }

        const inputType = property.type === 'string' ? 'text' : property.type;
        return (
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

        const createAndAssignNewMacro = () => {
            const name = generateMacroName();
            const { type, options, value } = mapPropertyToMacroType(property, currentValue);
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
                    onClick={(event) => {
                        event.stopPropagation();
                        if (!hasMacros && !assignedMacro) {
                            createAndAssignNewMacro();
                        } else {
                            setIsOpen((prev) => !prev);
                        }
                    }}
                    title="assign to macro"
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

    const groupDescription = group.description?.trim() ?? '';

    return (
        <div className="ae-property-group">
            <div className="ae-group-header">
                <button
                    type="button"
                    className={`ae-collapse-trigger ${group.collapsed ? 'collapsed' : 'expanded'}`}
                    onClick={() => onCollapseToggle(group.id)}
                    aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
                >
                    <span className={`ae-collapse-icon ${group.collapsed ? 'collapsed' : 'expanded'}`}>▼</span>
                </button>
                <div className="ae-group-meta">
                    <div className="ae-group-title-row">
                        <span className="ae-group-label" title={groupDescription || undefined}>
                            {group.label}
                        </span>
                    </div>
                </div>
            </div>

            {!group.collapsed && (
                properties.length === 0 ? (
                    <div className="ae-property-list ae-property-list-empty">
                        <span className="ae-property-empty">No properties to display.</span>
                    </div>
                ) : (
                    <div className="ae-property-list">
                        {properties.map((property) => {
                            const isAssignedToMacro = !!macroAssignments[property.key];
                            const hasAnimationIcon = canAssignMacro(property.type);

                            return (
                                <div key={property.key} className="ae-property-row">
                                    <div className="ae-property-label">
                                        <span className="ae-property-name" title={property.description}>
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
                                        {canAssignMacro(property.type) && (
                                            <MacroAssignmentControl
                                                propertyKey={property.key}
                                                property={property}
                                                currentValue={values[property.key]}
                                                assignedMacro={macroAssignments[property.key]}
                                                isAssigned={!!macroAssignments[property.key]}
                                                macros={getMacroOptions(property.type, property)}
                                                onAssign={(macroName) => onMacroAssignment(property.key, macroName)}
                                            />
                                        )}
                                        <div className="ae-property-input">{renderInput(property)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
};

export default PropertyGroupPanel;
