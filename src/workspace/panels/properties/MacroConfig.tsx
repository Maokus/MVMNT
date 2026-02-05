import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FaLink, FaTrash, FaPlus, FaPen } from 'react-icons/fa';
import { useMacros } from '@context/MacroContext';
import FontInput from '@workspace/form/inputs/FontInput';
import TimelineTrackSelect from '@workspace/form/inputs/TimelineTrackSelect';
import { useNumberDrag } from '@workspace/form/inputs/useNumberDrag';
import ColorAlphaInput from '@workspace/form/inputs/ColorAlphaInput';
import { useMacroAssignments } from '@state/scene';

interface MacroConfigProps {
    visualizer?: any; // Add visualizer prop to trigger rerenders
    showAddButton?: boolean;
}

interface Macro {
    name: string;
    type:
    | 'number'
    | 'string'
    | 'boolean'
    | 'color'
    | 'colorAlpha'
    | 'select'
    | 'file'
    | 'file-midi'
    | 'file-image'
    | 'font'
    | 'timelineTrackRef';
    value: any;
    options: {
        min?: number;
        max?: number;
        step?: number;
        selectOptions?: { value: any; label: string; }[];
        accept?: string;
        [key: string]: any;
    };
}

interface MacroAssignment {
    elementId: string;
    propertyPath: string;
}

interface MacroNumberInputProps {
    macro: Macro;
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onCommit: (value: number) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const MacroNumberInput: React.FC<MacroNumberInputProps> = ({ macro, value, onChange, onBlur, onCommit, onKeyDown }) => {
    const numericStep = typeof macro.options.step === 'number' && isFinite(macro.options.step) && macro.options.step > 0
        ? macro.options.step
        : undefined;
    const min = typeof macro.options.min === 'number' ? macro.options.min : undefined;
    const max = typeof macro.options.max === 'number' ? macro.options.max : undefined;
    const fallbackValue = typeof macro.value === 'number' ? macro.value : 0;

    const getCurrentValue = useCallback(() => {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) return parsed;
        return fallbackValue;
    }, [fallbackValue, value]);

    const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useNumberDrag({
        step: numericStep,
        min,
        max,
        getCurrentValue,
        onChange: onCommit,
    });

    return (
        <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={macro.options.step || 'any'}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
        />
    );
};

const MacroConfig: React.FC<MacroConfigProps> = ({ visualizer, showAddButton = true }) => {
    const { macros: contextMacros, create, updateValue, rename, delete: deleteMacro, get, assignListener } = useMacros();
    const storeAssignments = useMacroAssignments();
    const assignmentMap = useMemo(() => {
        const map = new Map<string, MacroAssignment[]>();
        for (const entry of storeAssignments) {
            const list = map.get(entry.macroId) ?? [];
            list.push({ elementId: entry.elementId, propertyPath: entry.propertyPath });
            map.set(entry.macroId, list);
        }
        return map;
    }, [storeAssignments]);
    const [macros, setMacros] = useState<Macro[]>(contextMacros as any);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [inputValues, setInputValues] = useState<{ [key: string]: string }>({});
    const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
    const [macroNameDraft, setMacroNameDraft] = useState('');
    const nameInputRef = useRef<HTMLInputElement | null>(null);
    const [newMacro, setNewMacro] = useState({
        name: '',
        type: 'number' as 'number' | 'string' | 'boolean' | 'color' | 'colorAlpha' | 'select' | 'file' | 'font' | 'timelineTrackRef',
        value: '',
        min: '',
        max: '',
        step: '',
        options: '',
        accept: '.mid,.midi'
    });

    useEffect(() => {
        if (editingMacroId && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [editingMacroId]);

    useEffect(() => {
        if (!editingMacroId) {
            return;
        }
        const exists = macros.some((macro) => macro.name === editingMacroId);
        if (!exists) {
            setEditingMacroId(null);
            setMacroNameDraft('');
        }
    }, [editingMacroId, macros]);

    // Update macros when the store-backed macro list changes
    const updateMacros = useCallback(() => {
        const allMacros = contextMacros as any;
        setMacros(allMacros);

        // Initialize input values for number inputs
        const newInputValues: { [key: string]: string } = {};
        allMacros.forEach((macro: any) => {
            if (macro.type === 'number') {
                newInputValues[macro.name] = macro.value.toString();
            }
        });
        setInputValues(newInputValues);
    }, [contextMacros]);

    const handleStartEditingName = useCallback((macroName: string) => {
        setEditingMacroId(macroName);
        setMacroNameDraft(macroName);
    }, []);

    const finishEditingName = useCallback(
        (macroName: string, save: boolean) => {
            if (!save) {
                setEditingMacroId(null);
                setMacroNameDraft('');
                return;
            }

            const trimmed = macroNameDraft.trim();
            if (!trimmed) {
                alert('Macro name cannot be empty.');
                setEditingMacroId(null);
                setMacroNameDraft('');
                return;
            }

            if (trimmed === macroName) {
                setEditingMacroId(null);
                setMacroNameDraft('');
                return;
            }

            const success = rename(macroName, trimmed);
            if (!success) {
                alert('Failed to rename macro. Name might already exist.');
            }

            setEditingMacroId(null);
            setMacroNameDraft('');
        },
        [macroNameDraft, rename]
    );

    const handleNameKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>, macroName: string) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                finishEditingName(macroName, true);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                finishEditingName(macroName, false);
            }
        },
        [finishEditingName]
    );

    useEffect(() => {
        // Setup macro manager listener for any macro changes (create/delete/update/import/clear)
        const listener = (_eventType: any, _data: any) => {
            updateMacros();
        };

        const unsubscribe = assignListener(listener);
        updateMacros();
        return () => unsubscribe();
    }, [updateMacros, assignListener]);

    const handleCreateMacro = () => {
        if (!newMacro.name.trim()) {
            alert('Please enter a macro name');
            return;
        }

        let value: any = newMacro.value;

        // Parse value based on type
        switch (newMacro.type) {
            case 'number':
                value = parseFloat(newMacro.value) || 0;
                break;
            case 'boolean':
                value = newMacro.value === 'true';
                break;
            case 'file':
                value = null; // File macros start with no file selected
                break;
            case 'font':
                if (typeof value !== 'string' || value.trim() === '') value = 'Arial|400';
                break;
            case 'timelineTrackRef':
                // Store a single track id or null initially
                value = null;
                break;
        }

        // Prepare options
        const options: any = {};
        if (newMacro.type === 'number') {
            if (newMacro.min) options.min = parseFloat(newMacro.min);
            if (newMacro.max) options.max = parseFloat(newMacro.max);
            if (newMacro.step) options.step = parseFloat(newMacro.step);
        } else if (newMacro.type === 'select') {
            options.selectOptions = newMacro.options.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [value, label] = line.split('|');
                    return { value: value.trim(), label: (label || value).trim() };
                });
        } else if (newMacro.type === 'file') {
            if (newMacro.accept) options.accept = newMacro.accept;
        }

        // Create the macro
        if (create(newMacro.name, newMacro.type, value, options)) {
            setShowCreateDialog(false);
            setNewMacro({
                name: '',
                type: 'number' as 'number' | 'string' | 'boolean' | 'color' | 'colorAlpha' | 'select' | 'file' | 'font' | 'timelineTrackRef',
                value: '',
                min: '',
                max: '',
                step: '',
                options: '',
                accept: '.mid,.midi'
            });
        } else {
            alert('Failed to create macro. Name might already exist.');
        }
    };

    const handleUpdateMacroValue = (name: string, value: any) => {
        console.log(`MacroConfig: Updating macro '${name}' to:`, value);
        const success = updateValue(name, value);
        if (!success) {
            console.warn(`MacroConfig: Failed to update macro '${name}' with value:`, value);
        } else {
            // Trigger visualizer rerender when macro changes
            if (visualizer && visualizer.invalidateRender) {
                visualizer.invalidateRender();
            }
        }
    };

    const handleNumberInputChange = (macroName: string, inputValue: string) => {
        console.log(`MacroConfig: Number input change for '${macroName}':`, inputValue);

        // Update local input state immediately for responsive UI
        setInputValues(prev => ({
            ...prev,
            [macroName]: inputValue
        }));

        // Try to parse and update the macro if valid
        const numericValue = parseFloat(inputValue);
        if (!isNaN(numericValue)) {
            console.log(`MacroConfig: Parsed numeric value for '${macroName}':`, numericValue);
            const success = updateValue(macroName, numericValue);
            if (!success) {
                console.warn(`MacroConfig: Failed to update macro '${macroName}' with numeric value:`, numericValue);
            } else {
                // Trigger visualizer rerender when macro changes
                if (visualizer && visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }
            }
        } else {
            console.log(`MacroConfig: Invalid numeric value for '${macroName}':`, inputValue);
        }
    };

    const handleNumberInputBlur = (macroName: string) => {
        // On blur, ensure the input shows the actual macro value
        const macro = get(macroName);
        if (macro) {
            setInputValues(prev => ({
                ...prev,
                [macroName]: macro.value.toString()
            }));
        }
    };

    const handleFileInput = async (macroName: string, file: File | null) => {
        if (!file) return;

        try {
            // Store the actual File object for MIDI files
            updateValue(macroName, file);
            console.log(`File loaded for macro '${macroName}':`, file.name);
        } catch (error) {
            console.error('Error handling file input:', error);
            alert('Error loading file: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    const handleDeleteMacro = (name: string) => {
        if (window.confirm(`Are you sure you want to delete the macro "${name}"?`)) {
            deleteMacro(name);
            setMacros(prev => prev.filter(m => m.name !== name));
        }
    };

    const handleShowAssignmentDialog = (macroName: string) => {
        const assignments = assignmentMap.get(macroName) ?? [];
        if (assignments.length === 0) {
            alert(`Macro "${macroName}" has no assignments.\n\nTo assign this macro to element properties, you'll need to select an element and look for the macro assignment options in the property editor.`);
        } else {
            const assignmentsList = assignments.map((a: MacroAssignment) => `• ${a.elementId}.${a.propertyPath}`).join('\n');
            alert(`Macro "${macroName}" is assigned to:\n\n${assignmentsList}`);
        }
    };

    const handleMacroTypeChange = (type: string) => {
        setNewMacro(prev => {
            const updated = {
                ...prev,
                type: type as 'number' | 'string' | 'boolean' | 'color' | 'colorAlpha' | 'select' | 'file' | 'font' | 'timelineTrackRef',
            };
            switch (type) {
                case 'number':
                    updated.value = '0';
                    break;
                case 'boolean':
                    updated.value = 'false';
                    break;
                case 'color':
                    updated.value = '#ffffff';
                    break;
                case 'colorAlpha':
                    updated.value = '#ffffffff';
                    break;
                case 'file':
                    updated.value = '';
                    break;
                case 'font':
                    updated.value = 'Arial|400';
                    break;
                case 'timelineTrackRef':
                    updated.value = '';
                    break;
                default:
                    updated.value = '';
            }
            return updated;
        });
    };

    const shouldTreatStringMacroAsTimelineTrack = (macro: Macro) => {
        if (macro.type !== 'string') return false;
        const allowedTypes = macro.options?.allowedTrackTypes;
        if (Array.isArray(allowedTypes) && allowedTypes.length > 0) return true;
        if (typeof macro.options?.allowMultiple === 'boolean') return true;

        const normalizedName = (macro.name || '')
            .replace(/[^a-z0-9]+/gi, '')
            .toLowerCase();
        const trackSuffixes = ['track', 'trackid', 'trackref', 'miditrack', 'miditrackid', 'timelinetrack'];
        const nameSuggestsTrack = trackSuffixes.some((suffix) => normalizedName.endsWith(suffix));
        if (nameSuggestsTrack) return true;

        const valueCandidate = Array.isArray(macro.value) ? macro.value[0] : macro.value;
        if (typeof valueCandidate === 'string' && /(timeline|audio|midi)[-_]?track/i.test(valueCandidate)) {
            return true;
        }
        return false;
    };

    const renderTrackSelectControl = (macro: Macro) => {
        const allowMultiple = Boolean(macro.options?.allowMultiple) || Array.isArray(macro.value);
        const inferTrackTypeFromValue = () => {
            const candidate = Array.isArray(macro.value) ? macro.value.find((entry) => typeof entry === 'string') : macro.value;
            if (typeof candidate !== 'string') return undefined;
            if (/audio[-_]?track/i.test(candidate)) return ['audio'] as Array<'audio'>;
            if (/midi[-_]?track/i.test(candidate)) return ['midi'] as Array<'midi'>;
            return undefined;
        };
        const allowedTrackTypes =
            (macro.options?.allowedTrackTypes && macro.options.allowedTrackTypes.length > 0
                ? (macro.options.allowedTrackTypes as Array<'midi' | 'audio'>)
                : inferTrackTypeFromValue()) || undefined;

        let normalizedValue: string | string[] | null;
        if (allowMultiple) {
            if (Array.isArray(macro.value)) {
                normalizedValue = macro.value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
            } else if (typeof macro.value === 'string' && macro.value.length > 0) {
                normalizedValue = [macro.value];
            } else {
                normalizedValue = [];
            }
        } else {
            if (typeof macro.value === 'string' && macro.value.length > 0) {
                normalizedValue = macro.value;
            } else if (Array.isArray(macro.value)) {
                normalizedValue = macro.value.find((entry): entry is string => typeof entry === 'string' && entry.length > 0) ?? null;
            } else if (macro.value == null) {
                normalizedValue = null;
            } else {
                normalizedValue = null;
            }
        }

        return (
            <TimelineTrackSelect
                id={`macro-track-${macro.name}`}
                value={normalizedValue as any}
                schema={{ allowMultiple, allowedTrackTypes }}
                onChange={(val: any) => handleUpdateMacroValue(macro.name, val)}
            />
        );
    };

    const renderMacroInput = (macro: Macro) => {
        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.currentTarget.blur(); // This will deselect the input
            }
        };

        const macroType = (typeof macro.type === 'string' ? macro.type.trim() : macro.type) as Macro['type'];

        switch (macroType) {
            case 'number':
                return (
                    <MacroNumberInput
                        macro={macro}
                        value={inputValues[macro.name] ?? macro.value.toString()}
                        onChange={(val) => handleNumberInputChange(macro.name, val)}
                        onBlur={() => handleNumberInputBlur(macro.name)}
                        onCommit={(next) => handleNumberInputChange(macro.name, next.toString())}
                        onKeyDown={handleKeyDown}
                    />
                );

            case 'boolean':
                return (
                    <input
                        type="checkbox"
                        checked={macro.value}
                        onChange={(e) => handleUpdateMacroValue(macro.name, e.target.checked)}
                    />
                );

            case 'color':
                return (
                    <input
                        type="color"
                        value={macro.value}
                        onChange={(e) => handleUpdateMacroValue(macro.name, e.target.value)}
                    />
                );

            case 'colorAlpha':
                return (
                    <ColorAlphaInput
                        id={`macro-${macro.name}-color-alpha`}
                        value={macro.value}
                        schema={{ default: typeof macro.value === 'string' ? macro.value : '#ffffffff' }}
                        disabled={false}
                        title={`Macro ${macro.name} color`}
                        onChange={(next) => handleUpdateMacroValue(macro.name, next)}
                    />
                );

            case 'select':
                const options = macro.options.selectOptions || [];
                return (
                    <select
                        value={macro.value}
                        onChange={(e) => handleUpdateMacroValue(macro.name, e.target.value)}
                    >
                        {options.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                );

            case 'file':
                const fileName = macro.value && macro.value.name ? macro.value.name : 'No file selected';
                const accept = macro.options.accept || '*';
                return (
                    <div className="file-input-wrapper">
                        <input
                            type="file"
                            accept={accept}
                            onChange={(e) => handleFileInput(macro.name, e.target.files?.[0] || null)}
                            style={{ display: 'none' }}
                            id={`macro-file-${macro.name}`}
                        />
                        <button
                            type="button"
                            className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] hover:bg-blue-700"
                            onClick={() => document.getElementById(`macro-file-${macro.name}`)?.click()}
                        >
                            📁 Choose File
                        </button>
                        <span className="file-name">{fileName}</span>
                    </div>
                );

            case 'font':
                return (
                    <FontInput
                        id={`macro-font-${macro.name}`}
                        value={macro.value || 'Arial|400'}
                        schema={{ default: 'Arial|400' }}
                        onChange={(val: string) => handleUpdateMacroValue(macro.name, val)}
                    />
                );
            case 'timelineTrackRef': {
                return renderTrackSelectControl(macro);
            }
            default: // string
                return (
                    (() => {
                        // Heuristic: legacy scenes may store track refs as strings
                        if (macro.type === 'string') {
                            if (shouldTreatStringMacroAsTimelineTrack(macro)) {
                                return renderTrackSelectControl(macro);
                            }
                            if (/track$/i.test(macro.name)) {
                                return (
                                    <TimelineTrackSelect
                                        id={`macro-track-${macro.name}`}
                                        value={macro.value ?? null}
                                        schema={{ allowMultiple: false }}
                                        onChange={(val: any) => handleUpdateMacroValue(macro.name, val)}
                                    />
                                );
                            }
                        }
                        return (
                            <input
                                type="text"
                                value={macro.value}
                                onChange={(e) => handleUpdateMacroValue(macro.name, e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                        );
                    })()
                );
        }
    };

    const renderMacroItem = (macro: Macro) => {
        const assignments = assignmentMap.get(macro.name) ?? [];
        const isEditingName = editingMacroId === macro.name;

        return (
            <div key={macro.name} className="macro-item" data-macro={macro.name}>
                <div className="macro-control">
                    <div className="macro-label">
                        {isEditingName ? (
                            <input
                                ref={nameInputRef}
                                type="text"
                                value={macroNameDraft}
                                onChange={(event) => setMacroNameDraft(event.target.value)}
                                onBlur={() => finishEditingName(macro.name, true)}
                                onKeyDown={(event) => handleNameKeyDown(event, macro.name)}
                                className="outline-none text-sm px-1 py-0.5 rounded border border-[color:var(--twc-border)] bg-[color:var(--twc-control2)] text-white"
                                aria-label="Macro name"
                            />
                        ) : (
                            <div className="flex items-center gap-1">
                                <span
                                    className="cursor-pointer"
                                    title={macro.name}
                                    onDoubleClick={() => handleStartEditingName(macro.name)}
                                >
                                    {macro.name}
                                </span>
                                <button
                                    type="button"
                                    className="bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-300 hover:bg-[color:var(--twc-border)] flex items-center"
                                    onClick={() => handleStartEditingName(macro.name)}
                                    title="Edit macro name"
                                    aria-label="Edit macro name"
                                >
                                    <FaPen />
                                </button>
                            </div>
                        )}
                    </div>
                    {renderMacroInput(macro)}
                    <div className="macro-actions">
                        <button
                            className="bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-300 hover:bg-[color:var(--twc-border)] flex items-center"
                            onClick={() => handleShowAssignmentDialog(macro.name)}
                            title="Manage Assignments"
                            aria-label="Manage Assignments"
                        >
                            <FaLink />
                        </button>
                        <button
                            className="bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-300 hover:bg-[color:var(--twc-border)] flex items-center"
                            onClick={() => handleDeleteMacro(macro.name)}
                            title="Delete Macro"
                            aria-label="Delete Macro"
                        >
                            <FaTrash />
                        </button>
                    </div>
                </div>
                <div className="macro-assignments">
                    {assignments.length > 0 ? (
                        <small>
                            {assignments.length} assignment(s): {assignments.map((a: MacroAssignment) => `${a.elementId}.${a.propertyPath}`).join(', ')}
                        </small>
                    ) : (
                        <small>No assignments</small>
                    )}
                </div>
            </div>
        );
    };

    useEffect(() => {
        if (!showAddButton) {
            setShowCreateDialog(false);
        }
    }, [showAddButton]);

    return (
        <div className="macro-config">
            <div className="macro-header">
                <h4 className="flex items-center gap-2">Macros</h4>
                {showAddButton && (
                    <button
                        className="text-xs px-2 py-1 text-white rounded cursor-pointer bg-[color:var(--twc-accent)] hover:bg-[#1177bb] flex items-center gap-1"
                        onClick={() => setShowCreateDialog(true)}
                    >
                        <FaPlus /> <span>Add Macro</span>
                    </button>
                )}
            </div>

            <div className="macro-list">
                {macros.length === 0 ? (
                    <div className="macro-empty">
                        No macros defined. Create a macro to control multiple properties at once.
                    </div>
                ) : (
                    macros.map(renderMacroItem)
                )}
            </div>

            {showCreateDialog && showAddButton && (
                <div className="macro-create-dialog">
                    <div className="dialog-content">
                        <h4>Create New Macro</h4>
                        <div className="form-group">
                            <label htmlFor="newMacroName">Macro Name:</label>
                            <input
                                type="text"
                                id="newMacroName"
                                placeholder="e.g., MainTempo, PrimaryColor"
                                value={newMacro.name}
                                onChange={(e) => setNewMacro(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="newMacroType">Type:</label>
                            <select
                                id="newMacroType"
                                value={newMacro.type}
                                onChange={(e) => handleMacroTypeChange(e.target.value)}
                            >
                                <option value="number">Number</option>
                                <option value="string">Text</option>
                                <option value="boolean">Boolean</option>
                                <option value="color">Color</option>
                                <option value="colorAlpha">Color (alpha)</option>
                                <option value="select">Select</option>
                                <option value="file">File</option>
                                <option value="font">Font</option>
                                <option value="timelineTrackRef">Timeline Track</option>
                            </select>
                        </div>
                        {newMacro.type !== 'font' && (
                            <div className="form-group">
                                <label htmlFor="newMacroValue">Default Value:</label>
                                <input
                                    type={newMacro.type === 'number' ? 'number' : 'text'}
                                    id="newMacroValue"
                                    value={newMacro.value}
                                    onChange={(e) => setNewMacro(prev => ({ ...prev, value: e.target.value }))}
                                    disabled={newMacro.type === 'file'}
                                    placeholder={newMacro.type === 'file' ? 'No file selected' : ''}
                                />
                            </div>
                        )}
                        {newMacro.type === 'font' && (
                            <div className="form-group">
                                <label>Default Font:</label>
                                <FontInput
                                    id="newMacroFont"
                                    value={newMacro.value || 'Arial|400'}
                                    schema={{ default: 'Arial|400' }}
                                    onChange={(val: string) => setNewMacro(prev => ({ ...prev, value: val }))}
                                />
                            </div>
                        )}
                        {newMacro.type === 'number' && (
                            <div className="form-group" id="numberOptions">
                                <label>Number Range:</label>
                                <input
                                    type="number"
                                    placeholder="Min"
                                    style={{ width: '45%' }}
                                    value={newMacro.min}
                                    onChange={(e) => setNewMacro(prev => ({ ...prev, min: e.target.value }))}
                                />
                                <input
                                    type="number"
                                    placeholder="Max"
                                    style={{ width: '45%' }}
                                    value={newMacro.max}
                                    onChange={(e) => setNewMacro(prev => ({ ...prev, max: e.target.value }))}
                                />
                                <input
                                    type="number"
                                    placeholder="Step"
                                    style={{ width: '100%', marginTop: '5px' }}
                                    value={newMacro.step}
                                    onChange={(e) => setNewMacro(prev => ({ ...prev, step: e.target.value }))}
                                />
                            </div>
                        )}
                        {newMacro.type === 'select' && (
                            <div className="form-group" id="selectOptions">
                                <label>Select Options (one per line, format: value|label):</label>
                                <textarea
                                    rows={4}
                                    placeholder="option1|Option 1&#10;option2|Option 2"
                                    value={newMacro.options}
                                    onChange={(e) => setNewMacro(prev => ({ ...prev, options: e.target.value }))}
                                />
                            </div>
                        )}
                        {newMacro.type === 'file' && (
                            <div className="form-group" id="fileOptions">
                                <label htmlFor="newMacroAccept">Accepted File Types:</label>
                                <input
                                    type="text"
                                    id="newMacroAccept"
                                    placeholder=".mid,.midi"
                                    value={newMacro.accept}
                                    onChange={(e) => setNewMacro(prev => ({ ...prev, accept: e.target.value }))}
                                />
                            </div>
                        )}
                        {newMacro.type === 'font' && (
                            <div className="form-group" id="fontInfo">
                                <small>Select a font family and weight. Stored as Family|Weight.</small>
                            </div>
                        )}
                        <div className="dialog-actions">
                            <button
                                className="px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-[#0e639c] border-[#1177bb] text-white hover:bg-[#1177bb] hover:border-[#1890d4]"
                                onClick={handleCreateMacro}
                            >
                                Create
                            </button>
                            <button
                                className="px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-neutral-600 border-neutral-500 text-neutral-100 hover:bg-neutral-500 hover:border-neutral-400"
                                onClick={() => setShowCreateDialog(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MacroConfig;
