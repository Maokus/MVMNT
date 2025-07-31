// Dynamic UI component for scene element configuration
import { globalMacroManager } from '../core/macro-manager';

export class DynamicConfigEditor {
    constructor(container) {
        this.container = container;
        this.currentElement = null;
        this.currentSchema = null;
        this.changeCallback = null;
        this.formElements = new Map();
        this.macroListener = null;

        this._setupMacroListener();
    }

    /**
     * Setup macro manager listener to update form when macro values change
     * @private
     */
    _setupMacroListener() {
        this.macroListener = (eventType, data) => {
            if (eventType === 'macroValueChanged' || eventType === 'macroAssigned' || eventType === 'macroUnassigned') {
                this._handleMacroChange(eventType, data);
            }
        };
        globalMacroManager.addListener(this.macroListener);
    }

    /**
     * Handle macro changes that affect the current element
     * @private
     */
    _handleMacroChange(eventType, data) {
        if (!this.currentElement) return;

        if (eventType === 'macroValueChanged') {
            // Update form values when macro values change
            const relevantAssignments = data.assignments.filter(
                assignment => assignment.elementId === this.currentElement.id
            );

            for (const assignment of relevantAssignments) {
                const input = this.formElements.get(assignment.propertyPath);
                if (input) {
                    this._updateInputValue(input, data.value);
                }

                // IMPORTANT: Actually update the element property via change callback
                if (this.changeCallback) {
                    this.changeCallback(this.currentElement.id, { [assignment.propertyPath]: data.value });
                }
            }
        } else if (eventType === 'macroAssigned' || eventType === 'macroUnassigned') {
            // Re-render form when macro assignments change
            if (data.elementId === this.currentElement.id) {
                this.renderForm();
            }
        }
    }

    /**
     * Update input value based on type
     * @private
     */
    _updateInputValue(input, value) {
        if (input.type === 'checkbox') {
            input.checked = Boolean(value);
        } else if (input.type === 'color' || input.type === 'text' || input.type === 'number' || input.type === 'range') {
            input.value = value;
        } else if (input.tagName === 'SELECT') {
            input.value = value;
        } else if (input.type === 'file') {
            // For file inputs, update the current file display
            const currentFileDisplay = input.parentElement?.querySelector('.current-file');
            if (currentFileDisplay) {
                if (value instanceof File) {
                    currentFileDisplay.textContent = `Current: ${value.name}`;
                } else if (value) {
                    currentFileDisplay.textContent = `Current: ${value}`;
                } else {
                    const acceptAttr = input.accept || '';
                    if (acceptAttr.includes('.mid')) {
                        currentFileDisplay.textContent = 'No MIDI file selected';
                    } else {
                        currentFileDisplay.textContent = 'No file selected';
                    }
                }
            }
        }
    }

    /**
     * Set callback for when configuration changes
     * @param {Function} callback - (elementId, config) => void
     */
    setChangeCallback(callback) {
        this.changeCallback = callback;
    }

    /**
     * Display configuration form for an element
     * @param {Object} elementConfig - Current element configuration
     * @param {Object} schema - Configuration schema
     */
    showElementConfig(elementConfig, schema) {
        this.currentElement = elementConfig;
        this.currentSchema = schema;
        this.renderForm();
    }

    /**
     * Clear the configuration form
     */
    clear() {
        this.container.innerHTML = '';
        this.formElements.clear();
        this.currentElement = null;
        this.currentSchema = null;
    }

    /**
     * Render the configuration form
     */
    renderForm() {
        this.container.innerHTML = '';
        this.formElements.clear();

        if (!this.currentElement || !this.currentSchema) {
            this.container.innerHTML = '<p>No element selected</p>';
            return;
        }

        // Create form header
        const header = document.createElement('div');
        header.className = 'config-editor-header';
        header.innerHTML = `
            <h3>${this.currentSchema.name}</h3>
            <p class="description">${this.currentSchema.description}</p>
        `;
        this.container.appendChild(header);

        // Create form
        const form = document.createElement('form');
        form.className = 'config-editor-form';
        form.addEventListener('submit', (e) => e.preventDefault());

        // Create form fields
        for (const [key, propSchema] of Object.entries(this.currentSchema.properties)) {
            const fieldContainer = this.createFormField(key, propSchema, this.currentElement[key]);
            if (fieldContainer) {
                form.appendChild(fieldContainer);
            }
        }

        this.container.appendChild(form);
    }

    /**
     * Create a form field for a property
     * @param {string} key - Property key
     * @param {Object} propSchema - Property schema
     * @param {any} currentValue - Current property value
     * @returns {HTMLElement} Form field container
     */
    createFormField(key, propSchema, currentValue) {
        const container = document.createElement('div');

        let input;
        const value = currentValue !== undefined ? currentValue : propSchema.default;

        // Check if this property is assigned to a macro
        const elementMacros = globalMacroManager.getElementMacros(this.currentElement.id);
        const assignedMacro = elementMacros.find(m => m.propertyPath === key);
        const isAssignedToMacro = !!assignedMacro;

        switch (propSchema.type) {
            case 'boolean':
                input = this.createBooleanInput(key, value, propSchema);
                break;
            case 'number':
                input = this.createNumberInput(key, value, propSchema);
                break;
            case 'select':
                input = this.createSelectInput(key, value, propSchema);
                break;
            case 'color':
                input = this.createColorInput(key, value, propSchema);
                break;
            case 'range':
                input = this.createRangeInput(key, value, propSchema);
                break;
            case 'file':
                input = this.createFileInput(key, value, propSchema);
                break;
            case 'string':
            default:
                input = this.createTextInput(key, value, propSchema);
                break;
        }

        if (input) {
            // Disable input if assigned to macro
            if (isAssignedToMacro) {
                input.disabled = true;
                input.title = `Controlled by macro: ${assignedMacro.macroName}`;

                // Update value from macro
                const macro = globalMacroManager.getMacro(assignedMacro.macroName);
                if (macro) {
                    this._updateInputValue(input, macro.value);
                }
            }

            // Handle special cases for layout
            if (propSchema.description) {
                container.className = 'form-field has-description';

                const fieldRow = document.createElement('div');
                fieldRow.className = 'field-row';

                const label = document.createElement('label');
                label.textContent = propSchema.label || key;
                label.htmlFor = `config-${key}`;
                fieldRow.appendChild(label);

                // Add macro assignment dropdown for compatible types
                if (this._canAssignMacro(propSchema.type)) {
                    const macroDropdown = this._createMacroDropdown(key, propSchema);
                    fieldRow.appendChild(macroDropdown);
                }

                fieldRow.appendChild(input);

                container.appendChild(fieldRow);

                const desc = document.createElement('small');
                desc.className = 'field-description';
                desc.textContent = propSchema.description;
                container.appendChild(desc);
            } else {
                container.className = 'form-field';

                const label = document.createElement('label');
                label.textContent = propSchema.label || key;
                label.htmlFor = `config-${key}`;

                // Special case for checkboxes - put checkbox first, then label
                if (propSchema.type === 'boolean') {
                    container.classList.add('checkbox-field');
                    container.appendChild(input);
                    container.appendChild(label);

                    // Add macro dropdown for boolean
                    if (this._canAssignMacro(propSchema.type)) {
                        const macroDropdown = this._createMacroDropdown(key, propSchema);
                        container.appendChild(macroDropdown);
                    }
                } else {
                    const labelRow = document.createElement('div');
                    labelRow.className = 'label-row';
                    labelRow.appendChild(label);

                    // Add macro assignment dropdown for compatible types
                    if (this._canAssignMacro(propSchema.type)) {
                        const macroDropdown = this._createMacroDropdown(key, propSchema);
                        labelRow.appendChild(macroDropdown);
                    }

                    container.appendChild(labelRow);
                    container.appendChild(input);
                }
            }

            this.formElements.set(key, input);
        }

        return container;
    }

    /**
     * Create boolean checkbox input
     */
    createBooleanInput(key, value, schema) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `config-${key}`;
        input.checked = Boolean(value);
        input.addEventListener('change', () => {
            this.notifyChange(key, input.checked);
        });
        return input;
    }

    /**
     * Create number input
     */
    createNumberInput(key, value, schema) {
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `config-${key}`;
        input.value = value || schema.default || 0;

        if (schema.min !== undefined) input.min = schema.min;
        if (schema.max !== undefined) input.max = schema.max;
        if (schema.step !== undefined) input.step = schema.step;

        input.addEventListener('input', () => {
            const numValue = parseFloat(input.value);
            if (!isNaN(numValue)) {
                this.notifyChange(key, numValue);
            }
        });
        return input;
    }

    /**
     * Create select dropdown input
     */
    createSelectInput(key, value, schema) {
        const select = document.createElement('select');
        select.id = `config-${key}`;

        if (schema.options) {
            for (const option of schema.options) {
                const optionEl = document.createElement('option');
                optionEl.value = option.value;
                optionEl.textContent = option.label || option.value;
                optionEl.selected = value === option.value;
                select.appendChild(optionEl);
            }
        }

        select.addEventListener('change', () => {
            this.notifyChange(key, select.value);
        });
        return select;
    }

    /**
     * Create color picker input
     */
    createColorInput(key, value, schema) {
        const input = document.createElement('input');
        input.type = 'color';
        input.id = `config-${key}`;
        input.value = value || schema.default || '#000000';

        input.addEventListener('change', () => {
            this.notifyChange(key, input.value);
        });
        return input;
    }

    /**
     * Create range slider input
     */
    createRangeInput(key, value, schema) {
        const container = document.createElement('div');
        container.className = 'range-input-container';

        const input = document.createElement('input');
        input.type = 'range';
        input.id = `config-${key}`;
        input.value = value || schema.default || 0;

        if (schema.min !== undefined) input.min = schema.min;
        if (schema.max !== undefined) input.max = schema.max;
        if (schema.step !== undefined) input.step = schema.step;

        input.addEventListener('input', () => {
            const numValue = parseFloat(input.value);
            if (!isNaN(numValue)) {
                this.notifyChange(key, numValue);
            }
        });

        container.appendChild(input);
        return container;
    }

    /**
     * Create file input for various file types (images, MIDI, etc.)
     */
    createFileInput(key, value, schema) {
        const container = document.createElement('div');
        container.className = 'file-input-container';

        const input = document.createElement('input');
        input.type = 'file';
        input.id = `config-${key}`;
        input.accept = schema.accept || '*/*';

        // Create a preview area
        const preview = document.createElement('div');
        preview.className = 'file-preview';

        // Create a label/button for file selection
        const fileLabel = document.createElement('label');
        fileLabel.className = 'file-input-label';
        fileLabel.htmlFor = `config-${key}`;

        // Set label text based on file type
        if (schema.accept && schema.accept.includes('.mid')) {
            fileLabel.textContent = 'Choose MIDI File';
        } else if (schema.accept && schema.accept.includes('image')) {
            fileLabel.textContent = 'Choose Image';
        } else {
            fileLabel.textContent = 'Choose File';
        }

        // Create current file display
        const currentFile = document.createElement('div');
        currentFile.className = 'current-file';

        if (value) {
            if (typeof value === 'string' && value.startsWith('data:')) {
                // It's a base64 data URL
                if (value.startsWith('data:image')) {
                    const img = document.createElement('img');
                    img.src = value;
                    img.style.maxWidth = '100px';
                    img.style.maxHeight = '100px';
                    img.style.objectFit = 'contain';
                    preview.appendChild(img);
                    currentFile.textContent = 'Current: Base64 image';
                } else {
                    currentFile.textContent = 'Current: Base64 file';
                }
            } else if (typeof value === 'string') {
                currentFile.textContent = `Current: ${value}`;
            } else if (value instanceof File) {
                currentFile.textContent = `Current: ${value.name}`;
            }
        } else {
            // Set appropriate "no file" message based on file type
            if (schema.accept && schema.accept.includes('.mid')) {
                currentFile.textContent = 'No MIDI file selected';
            } else {
                currentFile.textContent = 'No file selected';
            }
        }

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Clear preview
                preview.innerHTML = '';

                // Check if it's a MIDI file
                if (schema.accept && schema.accept.includes('.mid')) {
                    // For MIDI files, just pass the File object directly
                    currentFile.textContent = `Selected: ${file.name}`;

                    // Notify change with the File object for MIDI files
                    this.notifyChange(key, file);
                } else {
                    // For image files, convert to base64
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64 = e.target.result;

                        // Create preview image
                        const img = document.createElement('img');
                        img.src = base64;
                        img.style.maxWidth = '100px';
                        img.style.maxHeight = '100px';
                        img.style.objectFit = 'contain';
                        preview.appendChild(img);

                        // Update current file display
                        currentFile.textContent = `Selected: ${file.name}`;

                        // Notify change with base64 data
                        this.notifyChange(key, base64);
                    };
                    reader.readAsDataURL(file);
                }
            }
        });

        container.appendChild(fileLabel);
        container.appendChild(input);
        container.appendChild(currentFile);
        container.appendChild(preview);

        return container;
    }

    /**
     * Create text input
     */
    createTextInput(key, value, schema) {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `config-${key}`;
        input.value = value || schema.default || '';

        input.addEventListener('input', () => {
            this.notifyChange(key, input.value);
        });
        return input;
    }

    /**
     * Notify parent of configuration change
     */
    notifyChange(key, value) {
        if (this.currentElement) {
            // Update the local config object for form consistency
            this.currentElement[key] = value;

            // Notify the parent with the element ID and change
            if (this.changeCallback) {
                this.changeCallback(this.currentElement.id, { [key]: value });
            }
        }
    }

    /**
     * Check if a property type can be assigned to a macro
     * @private
     */
    _canAssignMacro(propertyType) {
        return ['number', 'string', 'boolean', 'color', 'select', 'file'].includes(propertyType);
    }

    /**
     * Create a macro assignment dropdown
     * @private
     */
    _createMacroDropdown(propertyKey, propSchema) {
        const macros = globalMacroManager.getAllMacros()
            .filter(macro => macro.type === propSchema.type);

        const elementMacros = globalMacroManager.getElementMacros(this.currentElement.id);
        const currentAssignment = elementMacros.find(m => m.propertyPath === propertyKey);

        const select = document.createElement('select');
        select.className = 'macro-assignment-select';
        select.title = 'Assign to macro';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'No macro';
        select.appendChild(defaultOption);

        // Add macro options
        macros.forEach(macro => {
            const option = document.createElement('option');
            option.value = macro.name;
            option.textContent = `${macro.name} (${macro.type})`;
            if (currentAssignment && currentAssignment.macroName === macro.name) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            this._applyMacroAssignmentFromDropdown(propertyKey, select.value);
        });

        return select;
    }

    /**
     * Apply macro assignment from dropdown
     * @private
     */
    _applyMacroAssignmentFromDropdown(propertyKey, macroName) {
        const elementId = this.currentElement.id;

        // Remove any existing assignment for this property
        const elementMacros = globalMacroManager.getElementMacros(elementId);
        const currentAssignment = elementMacros.find(m => m.propertyPath === propertyKey);
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

        // Re-render form to update states
        this.renderForm();
    }

    /**
     * Show macro assignment dialog
     * @private
     */
    /**
 * Close macro assignment dialog
 * @private
 */
    _closeMacroDialog(dialog) {
        // Remove the entire dialog element which contains the overlay
        const dialogContainer = dialog.closest('.macro-assignment-dialog');
        if (dialogContainer && dialogContainer.parentElement) {
            dialogContainer.parentElement.removeChild(dialogContainer);
        }
    }

    /**
     * Cleanup method to remove macro listener
     */
    destroy() {
        if (this.macroListener) {
            globalMacroManager.removeListener(this.macroListener);
            this.macroListener = null;
        }
    }

    /**
     * Apply macro assignment from dialog
     * @private
     */
    _applyMacroAssignment(propertyKey, dialog) {
        // Make sure we're working with the dialog content 
        const dialogContent = dialog.querySelector('.dialog-content');
        const selectedRadio = dialogContent.querySelector('input[name="macroAssignment"]:checked');
        if (!selectedRadio) return;

        const macroName = selectedRadio.value;
        const elementId = this.currentElement.id;

        // Remove any existing assignment for this property
        const elementMacros = globalMacroManager.getElementMacros(elementId);
        const currentAssignment = elementMacros.find(m => m.propertyPath === propertyKey);
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

        // Close dialog and refresh form
        this._closeMacroDialog(dialog);
        this.renderForm(); // Re-render to update macro button states
    }

    /**
     * Close macro assignment dialog
     * @private
     */
    _closeMacroDialog(dialog) {
        // Remove the entire dialog element which contains the overlay
        const dialogContainer = dialog.closest('.macro-assignment-dialog');
        if (dialogContainer && dialogContainer.parentElement) {
            dialogContainer.parentElement.removeChild(dialogContainer);
        }
    }

    /**
     * Update the current configuration values
     * @param {Object} newConfig - New configuration object
     */
    updateConfig(newConfig) {
        if (!this.currentElement) return;

        this.currentElement = { ...this.currentElement, ...newConfig };

        // Update form values
        for (const [key, value] of Object.entries(newConfig)) {
            const input = this.formElements.get(key);
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = Boolean(value);
                } else if (input.type === 'color' || input.type === 'text' || input.type === 'number' || input.type === 'range') {
                    input.value = value;
                } else if (input.type === 'file') {
                    // For file inputs, update the preview and current file display
                    const container = input.parentElement;
                    const currentFile = container.querySelector('.current-file');
                    const preview = container.querySelector('.file-preview');

                    if (currentFile && preview) {
                        preview.innerHTML = '';
                        if (value && typeof value === 'string' && value.startsWith('data:')) {
                            const img = document.createElement('img');
                            img.src = value;
                            img.style.maxWidth = '100px';
                            img.style.maxHeight = '100px';
                            img.style.objectFit = 'contain';
                            preview.appendChild(img);
                            currentFile.textContent = 'Current: Base64 image';
                        } else if (value instanceof File) {
                            currentFile.textContent = `Current: ${value.name}`;
                        } else if (value) {
                            currentFile.textContent = `Current: ${value}`;
                        } else {
                            // Check the accept attribute to determine file type
                            const isMIDI = input.accept && input.accept.includes('.mid');
                            currentFile.textContent = isMIDI ? 'No MIDI file selected' : 'No file selected';
                        }
                    }
                } else if (input.tagName === 'SELECT') {
                    input.value = value;
                }
            }
        }
    }
}

// CSS styles for the configuration editor are now in styles.css
export const configEditorStyles = ``;
