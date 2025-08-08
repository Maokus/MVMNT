/**
 * MacroManager - Manages global macros that can be assigned to multiple scene element properties
 * Provides a "plug and play" system for reusable templates and centralized control
 */

export type MacroType = 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file' | 'file-midi' | 'file-image';

interface MacroOptions {
  min?: number;
  max?: number;
  step?: number;
  selectOptions?: { value: any; label: string; }[];
  accept?: string; // For file inputs
  [key: string]: any;
}

export interface MacroAssignment {
  elementId: string;
  propertyPath: string;
}

export interface Macro {
  name: string;
  type: MacroType;
  value: any;
  defaultValue: any;
  options: MacroOptions;
  createdAt: number;
  lastModified: number;
}

export interface ElementMacro {
  macroName: string;
  propertyPath: string;
  value: any;
  type: MacroType;
}

interface MacroExportData {
  macros: { [key: string]: Macro };
  exportedAt: number;
}

type MacroEventType = 'macroCreated' | 'macroDeleted' | 'macroValueChanged' | 'macroAssigned' | 'macroUnassigned' | 'macrosImported';

type MacroListener = (eventType: MacroEventType, data: any) => void;

export class MacroManager {
  private macros: Map<string, Macro> = new Map();
  private listeners: Set<MacroListener> = new Set(); // For notifying UI of macro changes

  /**
   * Create a new macro
   */
  createMacro(name: string, type: MacroType, defaultValue: any, options: MacroOptions = {}): boolean {
    if (this.macros.has(name)) {
      console.warn(`Macro '${name}' already exists`);
      return false;
    }

    const macro: Macro = {
      name,
      type,
      value: defaultValue,
      defaultValue,
      options,
      createdAt: Date.now(),
      lastModified: Date.now()
    };

    this.macros.set(name, macro);
    this._notifyListeners('macroCreated', { name, macro });

    return true;
  }

  /**
   * Delete a macro and remove all its assignments
   * In the new property binding system, this will cause all bound elements
   * to convert their macro bindings to constant bindings
   */
  deleteMacro(name: string): boolean {
    if (!this.macros.has(name)) {
      console.warn(`Macro '${name}' does not exist`);
      return false;
    }
    
    // Notify listeners BEFORE deleting the macro so bound elements can get the final value
    this._notifyListeners('macroDeleted', { name });
    
    // Now remove the macro and its assignments
    this.macros.delete(name);

    console.log(`Deleted macro '${name}'`);
    return true;
  }

  /**
   * Update a macro's value and propagate to all assigned properties
   */
  updateMacroValue(name: string, value: any): boolean {
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
    this._notifyListeners('macroValueChanged', {
      name,
      value,
      oldValue
    });

    console.log(`Updated macro '${name}' from`, oldValue, 'to', value);
    return true;
  }

  /**
   * Get a specific macro
   */
  getMacro(name: string): Macro | null {
    return this.macros.get(name) || null;
  }

  /**
   * Add a listener for macro changes
   */
  addListener(listener: MacroListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: MacroListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Get all macros as an array (backward compatibility)
   */
  getAllMacros(): Macro[] {
    return Array.from(this.macros.values());
  }

  /**
   * Get all macros as an object (for inspection)
   */
  getAllMacrosObject(): { [name: string]: Macro } {
    const result: { [name: string]: Macro } = {};
    this.macros.forEach((macro, name) => {
      result[name] = { ...macro };
    });
    return result;
  }  /**
   * Export macros to a serializable format
   * In the new property binding system, we only export macro definitions and values.
   * Assignment information is no longer needed since bindings are stored in element properties.
   */
  exportMacros(): MacroExportData {
    const macroData: { [key: string]: Macro } = {};
    
    this.macros.forEach((macro, name) => {
      // Only export the essential macro data, not assignments
      macroData[name] = {
        name: macro.name,
        type: macro.type,
        value: macro.value,
        defaultValue: macro.defaultValue,
        options: macro.options,
        createdAt: macro.createdAt,
        lastModified: macro.lastModified
      };
    });

    return {
      macros: macroData,
      exportedAt: Date.now()
    };
  }

  /**
   * Import macros and assignments from JSON
   */
  importMacros(macroData: MacroExportData): boolean {
    try {
      // Clear existing macros
      this.macros.clear();

      // Import macros
      for (const [name, macro] of Object.entries(macroData.macros)) {
        this.macros.set(name, { ...macro });
      }

      this._notifyListeners('macrosImported', { macroData });
      console.log('Successfully imported macros:', Object.keys(macroData.macros));
      return true;
    } catch (error) {
      console.error('Failed to import macros:', error);
      return false;
    }
  }

  clearMacros(): void {
    try{
      this.macros.clear();
    } catch (error) {
      console.error('Failed to clear macros:', error);
    }
  }

  /**
   * Validate a value against a macro type and options
   * @private
   */
  private _validateValue(type: MacroType, value: any, options: MacroOptions): boolean {
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
  private _notifyListeners(eventType: MacroEventType, data: any): void {
    this.listeners.forEach(listener => {
      try {
        listener(eventType, data);
      } catch (error) {
        console.error('Error in macro listener:', error);
      }
    });
  }
}

// Global macro manager instance
export const globalMacroManager = new MacroManager();
