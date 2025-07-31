/**
 * MacroConfigUI - User interface for managing global macros
 * Allows users to create, edit, and assign macros to scene elements
 */
import { globalMacroManager } from '../core/macro-manager.js';

export class MacroConfigUI {
    constructor(container) {
        this.container = container;
        this.sceneBuilder = null; // Will be set from outside
        this.macroListeners = [];

        this._setupMacroListener();
        this._render();
    }

    /**
     * Set the scene builder reference for element access
     */
    setSceneBuilder(sceneBuilder) {
        this.sceneBuilder = sceneBuilder;
    }

    /**
     * Setup macro manager listener
     * @private
     */
    _setupMacroListener() {
        const listener = (eventType, data) => {
            this._render(); // Re-render on macro changes
        };

        globalMacroManager.addListener(listener);
        this.macroListeners.push(listener);
    }

    /**
     * Render the macro configuration UI
     * @private
     */
    _render() {
        if (!this.container) return;

        const macros = globalMacroManager.getAllMacros();

        this.container.innerHTML = `
            <div class="macro-config">
                <div class="macro-header">
                    <h4>🎛️ Global Macros</h4>
                    <button class="btn btn-add macro-add-btn" onclick="macroConfigUI.showCreateMacroDialog()">
                        + Add Macro
                    </button>
                </div>
                
                <div class="macro-list">
                    ${macros.length === 0 ?
                '<div class="macro-empty">No macros defined. Create a macro to control multiple properties at once.</div>' :
                macros.map(macro => this._renderMacroItem(macro)).join('')
            }
                </div>
                
                <div class="macro-create-dialog" id="macroCreateDialog" style="display: none;">
                    ${this._renderCreateMacroDialog()}
                </div>
            </div>
        `;

        // Make this instance globally available for onclick handlers
        window.macroConfigUI = this;
    }

    /**
     * Render a single macro item
     * @private
     */
    _renderMacroItem(macro) {
        const assignments = globalMacroManager.getMacroAssignments(macro.name);

        return `
            <div class="macro-item" data-macro="${macro.name}">
                <div class="macro-control">
                    <label class="macro-label">${macro.name}</label>
                    ${this._renderMacroInput(macro)}
                    <div class="macro-actions">
                        <button class="btn-icon" onclick="macroConfigUI.showAssignmentDialog('${macro.name}')" 
                                title="Manage Assignments">
                            🔗
                        </button>
                        <button class="btn-icon" onclick="macroConfigUI.deleteMacro('${macro.name}')" 
                                title="Delete Macro">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="macro-assignments">
                    ${assignments.length > 0 ?
                `<small>${assignments.length} assignment(s): ${assignments.map(a => `${a.elementId}.${a.propertyPath}`).join(', ')}</small>` :
                '<small>No assignments</small>'
            }
                </div>
            </div>
        `;
    }

    /**
     * Render input control for a macro based on its type
     * @private
     */
    _renderMacroInput(macro) {
        const inputId = `macro-input-${macro.name}`;

        switch (macro.type) {
            case 'number':
                return `
                    <input type="number" 
                           id="${inputId}"
                           value="${macro.value}" 
                           min="${macro.options.min || ''}"
                           max="${macro.options.max || ''}"
                           step="${macro.options.step || 'any'}"
                           onchange="macroConfigUI.updateMacroValue('${macro.name}', parseFloat(this.value))">
                `;

            case 'boolean':
                return `
                    <input type="checkbox" 
                           id="${inputId}"
                           ${macro.value ? 'checked' : ''}
                           onchange="macroConfigUI.updateMacroValue('${macro.name}', this.checked)">
                `;

            case 'color':
                return `
                    <input type="color" 
                           id="${inputId}"
                           value="${macro.value}"
                           onchange="macroConfigUI.updateMacroValue('${macro.name}', this.value)">
                `;

            case 'select':
                const options = macro.options.selectOptions || [];
                return `
                    <select id="${inputId}" 
                            onchange="macroConfigUI.updateMacroValue('${macro.name}', this.value)">
                        ${options.map(opt =>
                    `<option value="${opt.value}" ${opt.value === macro.value ? 'selected' : ''}>${opt.label}</option>`
                ).join('')}
                    </select>
                `;

            case 'file':
                const fileName = macro.value && macro.value.name ? macro.value.name : 'No file selected';
                const accept = macro.options.accept || '*';
                return `
                    <div class="file-input-wrapper">
                        <input type="file" 
                               id="${inputId}"
                               accept="${accept}"
                               onchange="macroConfigUI.handleFileInput('${macro.name}', this.files[0])"
                               style="display: none;">
                        <button type="button" 
                                class="btn btn-file" 
                                onclick="document.getElementById('${inputId}').click()">
                            📁 Choose File
                        </button>
                        <span class="file-name">${fileName}</span>
                    </div>
                `;

            default: // string
                return `
                    <input type="text" 
                           id="${inputId}"
                           value="${macro.value}"
                           onchange="macroConfigUI.updateMacroValue('${macro.name}', this.value)">
                `;
        }
    }

    /**
     * Render the create macro dialog
     * @private
     */
    _renderCreateMacroDialog() {
        return `
            <div class="dialog-content">
                <h4>Create New Macro</h4>
                <div class="form-group">
                    <label for="newMacroName">Macro Name:</label>
                    <input type="text" id="newMacroName" placeholder="e.g., MainTempo, PrimaryColor">
                </div>
                <div class="form-group">
                    <label for="newMacroType">Type:</label>
                    <select id="newMacroType" onchange="macroConfigUI.onMacroTypeChange()">
                        <option value="number">Number</option>
                        <option value="string">Text</option>
                        <option value="boolean">Boolean</option>
                        <option value="color">Color</option>
                        <option value="select">Select</option>
                        <option value="file">File</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="newMacroValue">Default Value:</label>
                    <input type="text" id="newMacroValue">
                </div>
                <div class="form-group" id="numberOptions" style="display: none;">
                    <label>Number Range:</label>
                    <input type="number" id="newMacroMin" placeholder="Min" style="width: 45%;">
                    <input type="number" id="newMacroMax" placeholder="Max" style="width: 45%;">
                    <input type="number" id="newMacroStep" placeholder="Step" style="width: 100%; margin-top: 5px;">
                </div>
                <div class="form-group" id="selectOptions" style="display: none;">
                    <label>Select Options (one per line, format: value|label):</label>
                    <textarea id="newMacroOptions" rows="4" placeholder="option1|Option 1&#10;option2|Option 2"></textarea>
                </div>
                <div class="form-group" id="fileOptions" style="display: none;">
                    <label for="newMacroAccept">Accepted File Types:</label>
                    <input type="text" id="newMacroAccept" placeholder=".mid,.midi" value=".mid,.midi">
                </div>
                <div class="dialog-actions">
                    <button class="btn btn-primary" onclick="macroConfigUI.createMacro()">Create</button>
                    <button class="btn btn-secondary" onclick="macroConfigUI.hideCreateMacroDialog()">Cancel</button>
                </div>
            </div>
        `;
    }

    /**
     * Show the create macro dialog
     */
    showCreateMacroDialog() {
        const dialog = document.getElementById('macroCreateDialog');
        if (dialog) {
            dialog.style.display = 'block';
            document.getElementById('newMacroName').focus();
        }
    }

    /**
     * Hide the create macro dialog
     */
    hideCreateMacroDialog() {
        const dialog = document.getElementById('macroCreateDialog');
        if (dialog) {
            dialog.style.display = 'none';
            // Clear form
            document.getElementById('newMacroName').value = '';
            document.getElementById('newMacroValue').value = '';
        }
    }

    /**
     * Handle macro type change in create dialog
     */
    onMacroTypeChange() {
        const type = document.getElementById('newMacroType').value;
        const numberOptions = document.getElementById('numberOptions');
        const selectOptions = document.getElementById('selectOptions');
        const fileOptions = document.getElementById('fileOptions');
        const valueInput = document.getElementById('newMacroValue');

        // Show/hide relevant options
        numberOptions.style.display = type === 'number' ? 'block' : 'none';
        selectOptions.style.display = type === 'select' ? 'block' : 'none';
        fileOptions.style.display = type === 'file' ? 'block' : 'none';

        // Set appropriate input type and default value
        switch (type) {
            case 'number':
                valueInput.type = 'number';
                valueInput.value = '0';
                break;
            case 'boolean':
                valueInput.type = 'checkbox';
                valueInput.value = 'false';
                break;
            case 'color':
                valueInput.type = 'color';
                valueInput.value = '#ffffff';
                break;
            case 'file':
                valueInput.type = 'text';
                valueInput.value = '';
                valueInput.placeholder = 'No file selected';
                valueInput.disabled = true;
                break;
            default:
                valueInput.type = 'text';
                valueInput.value = '';
        }
    }

    /**
     * Create a new macro
     */
    createMacro() {
        const name = document.getElementById('newMacroName').value.trim();
        const type = document.getElementById('newMacroType').value;
        let value = document.getElementById('newMacroValue').value;

        if (!name) {
            alert('Please enter a macro name');
            return;
        }

        // Parse value based on type
        switch (type) {
            case 'number':
                value = parseFloat(value) || 0;
                break;
            case 'boolean':
                value = value === 'true' || value === true;
                break;
            case 'file':
                value = null; // File macros start with no file selected
                break;
        }

        // Prepare options
        const options = {};
        if (type === 'number') {
            const min = document.getElementById('newMacroMin').value;
            const max = document.getElementById('newMacroMax').value;
            const step = document.getElementById('newMacroStep').value;
            if (min) options.min = parseFloat(min);
            if (max) options.max = parseFloat(max);
            if (step) options.step = parseFloat(step);
        } else if (type === 'select') {
            const optionsText = document.getElementById('newMacroOptions').value;
            options.selectOptions = optionsText.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [value, label] = line.split('|');
                    return { value: value.trim(), label: (label || value).trim() };
                });
        } else if (type === 'file') {
            const accept = document.getElementById('newMacroAccept').value;
            if (accept) options.accept = accept;
        }

        // Create the macro
        if (globalMacroManager.createMacro(name, type, value, options)) {
            this.hideCreateMacroDialog();
        } else {
            alert('Failed to create macro. Name might already exist.');
        }
    }

    /**
     * Update a macro's value
     */
    updateMacroValue(name, value) {
        globalMacroManager.updateMacroValue(name, value);
    }

    /**
     * Handle file input for file-type macros
     */
    async handleFileInput(macroName, file) {
        if (!file) return;

        try {
            // Store the actual File object for MIDI files
            // The scene elements expect File objects directly
            globalMacroManager.updateMacroValue(macroName, file);
            console.log(`File loaded for macro '${macroName}':`, file.name);
        } catch (error) {
            console.error('Error handling file input:', error);
            alert('Error loading file: ' + error.message);
        }
    }

    /**
     * Delete a macro
     */
    deleteMacro(name) {
        if (window.confirm(`Are you sure you want to delete the macro "${name}"?`)) {
            globalMacroManager.deleteMacro(name);
        }
    }

    /**
     * Show assignment dialog for a macro
     */
    showAssignmentDialog(macroName) {
        // This would open a dialog to manage macro assignments
        // For now, we'll show an alert with current assignments
        const assignments = globalMacroManager.getMacroAssignments(macroName);
        if (assignments.length === 0) {
            alert(`Macro "${macroName}" has no assignments.\n\nTo assign this macro to element properties, you'll need to select an element and look for the macro assignment options in the property editor.`);
        } else {
            const assignmentsList = assignments.map(a => `• ${a.elementId}.${a.propertyPath}`).join('\n');
            alert(`Macro "${macroName}" is assigned to:\n\n${assignmentsList}`);
        }
    }

    /**
     * Cleanup listeners
     */
    destroy() {
        for (const listener of this.macroListeners) {
            globalMacroManager.removeListener(listener);
        }
        this.macroListeners = [];
    }
}
