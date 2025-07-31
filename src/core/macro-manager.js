/**
 * MacroManager - Manages global macros that can be assigned to multiple scene element properties
 * Provides a "plug and play" system for reusable templates and centralized control
 */
export class MacroManager {
    constructor() {
        this.macros = new Map();
        this.assignments = new Map(); // Maps macro names to element property assignments
        this.listeners = new Set(); // For notifying UI of macro changes
    }

    /**
     * Create a new macro
     * @param {string} name - Unique macro name
     * @param {string} type - Data type ('number', 'string', 'boolean', 'color', 'select', 'file')
     * @param {any} defaultValue - Default value for the macro
     * @param {Object} options - Additional options (min, max, step, selectOptions, etc.)
     * @returns {boolean} True if macro was created successfully
     */
    createMacro(name, type, defaultValue, options = {}) {
        if (this.macros.has(name)) {
            console.warn(`Macro '${name}' already exists`);
            return false;
        }

        const macro = {
            name,
            type,
            value: defaultValue,
            defaultValue,
            options,
            assignments: [], // Array of {elementId, propertyPath} objects
            createdAt: Date.now(),
            lastModified: Date.now()
        };

        this.macros.set(name, macro);
        this.assignments.set(name, []);
        this._notifyListeners('macroCreated', { name, macro });

        console.log(`Created macro '${name}' with type '${type}' and default value:`, defaultValue);
        return true;
    }

    /**
     * Delete a macro and remove all its assignments
     * @param {string} name - Macro name to delete
     * @returns {boolean} True if macro was deleted successfully
     */
    deleteMacro(name) {
        if (!this.macros.has(name)) {
            console.warn(`Macro '${name}' does not exist`);
            return false;
        }

        // Remove all assignments for this macro
        const assignments = this.assignments.get(name) || [];
        this.assignments.delete(name);
        this.macros.delete(name);

        this._notifyListeners('macroDeleted', { name, assignments });
        console.log(`Deleted macro '${name}' and removed ${assignments.length} assignments`);
        return true;
    }

    /**
     * Update a macro's value and propagate to all assigned properties
     * @param {string} name - Macro name
     * @param {any} value - New value
     * @returns {boolean} True if update was successful
     */
    updateMacroValue(name, value) {
        const macro = this.macros.get(name);
        if (!macro) {
            console.warn(`Macro '${name}' does not exist`);
            return false;
        }

        // Validate value type
        if (!this._validateValue(macro.type, value, macro.options)) {
            console.warn(`Invalid value for macro '${name}':`, value);
            return false;
        }

        const oldValue = macro.value;
        macro.value = value;
        macro.lastModified = Date.now();

        // Propagate to all assignments
        const assignments = this.assignments.get(name) || [];
        this._notifyListeners('macroValueChanged', {
            name,
            value,
            oldValue,
            assignments
        });

        console.log(`Updated macro '${name}' from`, oldValue, 'to', value);
        return true;
    }

    /**
     * Assign a macro to an element property
     * @param {string} macroName - Name of the macro
     * @param {string} elementId - ID of the scene element
     * @param {string} propertyPath - Property path (e.g., 'bpm', 'color', 'position.x')
     * @returns {boolean} True if assignment was successful
     */
    assignMacroToProperty(macroName, elementId, propertyPath) {
        const macro = this.macros.get(macroName);
        if (!macro) {
            console.warn(`Macro '${macroName}' does not exist`);
            return false;
        }

        const assignments = this.assignments.get(macroName) || [];

        // Check if this assignment already exists
        const existingAssignment = assignments.find(a =>
            a.elementId === elementId && a.propertyPath === propertyPath
        );

        if (existingAssignment) {
            console.warn(`Macro '${macroName}' is already assigned to ${elementId}.${propertyPath}`);
            return false;
        }

        // Add the assignment
        const assignment = { elementId, propertyPath };
        assignments.push(assignment);
        this.assignments.set(macroName, assignments);

        this._notifyListeners('macroAssigned', {
            macroName,
            elementId,
            propertyPath,
            currentValue: macro.value
        });

        console.log(`Assigned macro '${macroName}' to ${elementId}.${propertyPath}`);
        return true;
    }

    /**
     * Remove a macro assignment from an element property
     * @param {string} macroName - Name of the macro
     * @param {string} elementId - ID of the scene element
     * @param {string} propertyPath - Property path
     * @returns {boolean} True if removal was successful
     */
    unassignMacroFromProperty(macroName, elementId, propertyPath) {
        const assignments = this.assignments.get(macroName);
        if (!assignments) {
            console.warn(`No assignments found for macro '${macroName}'`);
            return false;
        }

        const index = assignments.findIndex(a =>
            a.elementId === elementId && a.propertyPath === propertyPath
        );

        if (index === -1) {
            console.warn(`No assignment found for macro '${macroName}' to ${elementId}.${propertyPath}`);
            return false;
        }

        assignments.splice(index, 1);
        this.assignments.set(macroName, assignments);

        this._notifyListeners('macroUnassigned', {
            macroName,
            elementId,
            propertyPath
        });

        console.log(`Removed macro assignment '${macroName}' from ${elementId}.${propertyPath}`);
        return true;
    }

    /**
     * Get all macros
     * @returns {Array} Array of macro objects
     */
    getAllMacros() {
        return Array.from(this.macros.values());
    }

    /**
     * Get a specific macro
     * @param {string} name - Macro name
     * @returns {Object|null} Macro object or null if not found
     */
    getMacro(name) {
        return this.macros.get(name) || null;
    }

    /**
     * Get all assignments for a macro
     * @param {string} name - Macro name
     * @returns {Array} Array of assignment objects
     */
    getMacroAssignments(name) {
        return this.assignments.get(name) || [];
    }

    /**
     * Get all macros assigned to a specific element
     * @param {string} elementId - Element ID
     * @returns {Array} Array of {macroName, propertyPath, value} objects
     */
    getElementMacros(elementId) {
        const elementMacros = [];

        for (const [macroName, assignments] of this.assignments) {
            const elementAssignments = assignments.filter(a => a.elementId === elementId);
            for (const assignment of elementAssignments) {
                const macro = this.macros.get(macroName);
                if (macro) {
                    elementMacros.push({
                        macroName,
                        propertyPath: assignment.propertyPath,
                        value: macro.value,
                        type: macro.type
                    });
                }
            }
        }

        return elementMacros;
    }

    /**
     * Add a listener for macro changes
     * @param {Function} listener - Callback function (eventType, data) => {}
     */
    addListener(listener) {
        this.listeners.add(listener);
    }

    /**
     * Remove a listener
     * @param {Function} listener - Listener function to remove
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    /**
     * Export macros and assignments to JSON
     * @returns {Object} Serializable macro data
     */
    exportMacros() {
        const macroData = {
            macros: {},
            assignments: {},
            exportedAt: Date.now()
        };

        for (const [name, macro] of this.macros) {
            macroData.macros[name] = { ...macro };
        }

        for (const [name, assignments] of this.assignments) {
            macroData.assignments[name] = [...assignments];
        }

        return macroData;
    }

    /**
     * Import macros and assignments from JSON
     * @param {Object} macroData - Exported macro data
     * @returns {boolean} True if import was successful
     */
    importMacros(macroData) {
        try {
            // Clear existing macros
            this.macros.clear();
            this.assignments.clear();

            // Import macros
            for (const [name, macro] of Object.entries(macroData.macros)) {
                this.macros.set(name, { ...macro });
            }

            // Import assignments
            for (const [name, assignments] of Object.entries(macroData.assignments)) {
                this.assignments.set(name, [...assignments]);
            }

            this._notifyListeners('macrosImported', { macroData });
            console.log('Successfully imported macros:', Object.keys(macroData.macros));
            return true;
        } catch (error) {
            console.error('Failed to import macros:', error);
            return false;
        }
    }

    /**
     * Validate a value against a macro type and options
     * @private
     */
    _validateValue(type, value, options) {
        switch (type) {
            case 'number':
                if (typeof value !== 'number' || isNaN(value)) return false;
                if (options.min !== undefined && value < options.min) return false;
                if (options.max !== undefined && value > options.max) return false;
                return true;

            case 'string':
                return typeof value === 'string';

            case 'boolean':
                return typeof value === 'boolean';

            case 'color':
                return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);

            case 'select':
                if (!options.selectOptions) return true;
                return options.selectOptions.some(opt => opt.value === value);

            case 'file':
                // File validation - accept null/undefined (no file) or File objects
                if (value === null || value === undefined) return true;
                if (typeof value === 'object' && value instanceof File) return true;
                return false;

            default:
                return true;
        }
    }

    /**
     * Notify all listeners of a macro event
     * @private
     */
    _notifyListeners(eventType, data) {
        for (const listener of this.listeners) {
            try {
                listener(eventType, data);
            } catch (error) {
                console.error('Error in macro listener:', error);
            }
        }
    }
}

// Global macro manager instance
export const globalMacroManager = new MacroManager();
