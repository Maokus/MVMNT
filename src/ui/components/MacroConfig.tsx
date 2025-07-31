import React, { useState, useEffect, useCallback } from 'react';
import { globalMacroManager } from '../../core/macro-manager';

interface MacroConfigProps {
    sceneBuilder?: any; // Will be set from outside
}

interface Macro {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file';
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

const MacroConfig: React.FC<MacroConfigProps> = ({ sceneBuilder }) => {
    const [macros, setMacros] = useState<Macro[]>([]);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newMacro, setNewMacro] = useState({
        name: '',
        type: 'number' as 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file',
        value: '',
        min: '',
        max: '',
        step: '',
        options: '',
        accept: '.mid,.midi'
    });

    // Update macros when globalMacroManager changes
    const updateMacros = useCallback(() => {
        const allMacros = globalMacroManager.getAllMacros();
        setMacros(allMacros);
    }, []);

    useEffect(() => {
        // Setup macro manager listener
        const listener = () => {
            updateMacros();
        };

        globalMacroManager.addListener(listener);
        updateMacros(); // Initial load

        return () => {
            globalMacroManager.removeListener(listener);
        };
    }, [updateMacros]);

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
        if (globalMacroManager.createMacro(newMacro.name, newMacro.type, value, options)) {
            setShowCreateDialog(false);
            setNewMacro({
                name: '',
                type: 'number' as 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file',
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
        globalMacroManager.updateMacroValue(name, value);
    };

    const handleFileInput = async (macroName: string, file: File | null) => {
        if (!file) return;

        try {
            // Store the actual File object for MIDI files
            globalMacroManager.updateMacroValue(macroName, file);
            console.log(`File loaded for macro '${macroName}':`, file.name);
        } catch (error) {
            console.error('Error handling file input:', error);
            alert('Error loading file: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    const handleDeleteMacro = (name: string) => {
        if (window.confirm(`Are you sure you want to delete the macro "${name}"?`)) {
            globalMacroManager.deleteMacro(name);
        }
    };

    const handleShowAssignmentDialog = (macroName: string) => {
        const assignments = globalMacroManager.getMacroAssignments(macroName);
        if (assignments.length === 0) {
            alert(`Macro "${macroName}" has no assignments.\n\nTo assign this macro to element properties, you'll need to select an element and look for the macro assignment options in the property editor.`);
        } else {
            const assignmentsList = assignments.map((a: MacroAssignment) => `• ${a.elementId}.${a.propertyPath}`).join('\n');
            alert(`Macro "${macroName}" is assigned to:\n\n${assignmentsList}`);
        }
    };

    const handleMacroTypeChange = (type: string) => {
        setNewMacro(prev => {
            const updated = { ...prev, type: type as 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file' };

            // Set appropriate default value
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
                case 'file':
                    updated.value = '';
                    break;
                default:
                    updated.value = '';
            }

            return updated;
        });
    };

    const renderMacroInput = (macro: Macro) => {
        switch (macro.type) {
            case 'number':
                return (
                    <input
                        type="number"
                        value={macro.value}
                        min={macro.options.min}
                        max={macro.options.max}
                        step={macro.options.step || 'any'}
                        onChange={(e) => handleUpdateMacroValue(macro.name, parseFloat(e.target.value))}
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
                            className="btn btn-file"
                            onClick={() => document.getElementById(`macro-file-${macro.name}`)?.click()}
                        >
                            📁 Choose File
                        </button>
                        <span className="file-name">{fileName}</span>
                    </div>
                );

            default: // string
                return (
                    <input
                        type="text"
                        value={macro.value}
                        onChange={(e) => handleUpdateMacroValue(macro.name, e.target.value)}
                    />
                );
        }
    };

    const renderMacroItem = (macro: Macro) => {
        const assignments = globalMacroManager.getMacroAssignments(macro.name);

        return (
            <div key={macro.name} className="macro-item" data-macro={macro.name}>
                <div className="macro-control">
                    <label className="macro-label">{macro.name}</label>
                    {renderMacroInput(macro)}
                    <div className="macro-actions">
                        <button
                            className="btn-icon"
                            onClick={() => handleShowAssignmentDialog(macro.name)}
                            title="Manage Assignments"
                        >
                            🔗
                        </button>
                        <button
                            className="btn-icon"
                            onClick={() => handleDeleteMacro(macro.name)}
                            title="Delete Macro"
                        >
                            🗑️
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

    return (
        <div className="macro-config">
            <div className="macro-header">
                <h4>🎛️ Global Macros</h4>
                <button
                    className="btn btn-add macro-add-btn"
                    onClick={() => setShowCreateDialog(true)}
                >
                    + Add Macro
                </button>
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

            {showCreateDialog && (
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
                                <option value="select">Select</option>
                                <option value="file">File</option>
                            </select>
                        </div>
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
                        <div className="dialog-actions">
                            <button className="btn btn-primary" onClick={handleCreateMacro}>
                                Create
                            </button>
                            <button
                                className="btn btn-secondary"
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
