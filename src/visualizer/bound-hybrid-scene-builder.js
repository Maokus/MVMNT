// Enhanced Hybrid Scene Builder with Property Binding Support
import { HybridSceneBuilder } from './hybrid-scene-builder.js';
import { BoundSceneElement } from './scene-elements/bound-base';
import { BoundTimeUnitPianoRollElement } from './scene-elements/time-unit-piano-roll/bound-time-unit-piano-roll';
import { globalMacroManager } from './macro-manager';

export class BoundHybridSceneBuilder extends HybridSceneBuilder {
    constructor() {
        super();

        // Register bound scene elements
        this._registerBoundElements();
    }

    /**
     * Register bound scene element types
     */
    _registerBoundElements() {
        // Register the bound time unit piano roll
        this.sceneElementRegistry.registerElement('boundTimeUnitPianoRoll', (config) => {
            const element = new BoundTimeUnitPianoRollElement(config.id || 'background', config);
            return element;
        }, BoundTimeUnitPianoRollElement.getConfigSchema());

        window.SER = this.sceneElementRegistry; // For debugging purposes
    }

    /**
     * Enhanced scene serialization with property binding support
     */
    serializeScene() {
        // Serialize elements with binding information
        const serializedElements = this.elements.map(element => {
            // Check if this is a bound element
            if (element instanceof BoundSceneElement) {
                return {
                    ...element.getSerializableConfig(),
                    index: this.elements.indexOf(element)
                };
            } else {
                // Fallback to regular serialization for legacy elements
                return {
                    ...this.getElementConfig(element.id),
                    index: this.elements.indexOf(element)
                };
            }
        });

        // Get macro data from the global macro manager
        const macroData = globalMacroManager.exportMacros();

        // Note: In the new system, MIDI data is stored within individual elements
        // and referenced through macros, so we don't need scene-level MIDI data

        return {
            version: process.env.REACT_APP_VERSION, // Increment version for new format
            elements: serializedElements,
            macros: macroData,
            serializedAt: new Date().toISOString(),
            bindingSystemVersion: process.env.REACT_APP_BINDING_VERSION // Indicate this uses the property binding system
        };
    }

    /**
     * Enhanced scene loading with property binding support
     */
    loadScene(sceneData) {
        if (!sceneData || !sceneData.elements) {
            console.error('Invalid scene data: missing elements');
            return false;
        }

        try {
            // Clear existing elements
            this.clearElements();

            // Import macros first if they exist
            if (sceneData.macros) {
                console.log('Importing macros from scene data...');
                const macroImportSuccess = globalMacroManager.importMacros(sceneData.macros);
                if (!macroImportSuccess) {
                    console.warn('Failed to import macros, but continuing with scene load');
                }
            } else {
                console.log('No macro data found in scene, creating default macros...');
                this._createDefaultMacros();
            }

            // Check if this is a new format with binding system
            const hasBindingSystem = sceneData.bindingSystemVersion !== undefined;

            // Sort elements by index to maintain order
            const sortedElements = sceneData.elements.sort((a, b) => (a.index || 0) - (b.index || 0));

            for (const elementConfig of sortedElements) {
                if (!elementConfig.type || !elementConfig.id) {
                    console.warn('Skipping invalid element config:', elementConfig);
                    continue;
                }

                let element;

                if (hasBindingSystem) {
                    // New format: create element from registry and let it handle binding deserialization
                    element = this.addElementFromRegistry(elementConfig.type, elementConfig);
                } else {
                    // Legacy format: convert to new format
                    element = this._convertLegacyElement(elementConfig);
                }

                if (element) {
                    console.log(`Loaded element '${element.id}' of type '${element.type}'`);
                } else {
                    console.warn(`Failed to load element '${elementConfig.id}' of type '${elementConfig.type}'`);
                }
            }

            // Handle legacy MIDI data if present (for backward compatibility)
            if (sceneData.midiData && !hasBindingSystem) {
                this._handleLegacyMIDIData(sceneData.midiData, sceneData.midiFileName);
            }

            console.log(`Scene loaded successfully: ${sortedElements.length} elements, binding system: ${hasBindingSystem ? 'yes' : 'no'}`);
            return true;

        } catch (error) {
            console.error('Error loading scene:', error);
            return false;
        }
    }

    /**
     * Convert legacy element configuration to new binding format
     */
    _convertLegacyElement(elementConfig) {
        console.log(`Converting legacy element '${elementConfig.id}' to bound format`);

        // Create a new configuration with constant bindings for all properties
        const boundConfig = {
            id: elementConfig.id,
            type: this._mapLegacyTypeToNew(elementConfig.type)
        };

        // Convert all properties to constant bindings
        for (const [key, value] of Object.entries(elementConfig)) {
            if (key !== 'id' && key !== 'type' && key !== 'index') {
                boundConfig[key] = {
                    type: 'constant',
                    value: value
                };
            }
        }

        // Check for macro assignments in legacy format
        const macroAssignments = this._getLegacyMacroAssignments(elementConfig.id);
        for (const [propertyKey, macroId] of Object.entries(macroAssignments)) {
            boundConfig[propertyKey] = {
                type: 'macro',
                macroId: macroId
            };
        }

        return this.addElementFromRegistry(boundConfig.type, boundConfig);
    }

    /**
     * Map legacy element types to new bound types
     */
    _mapLegacyTypeToNew(legacyType) {
        const typeMapping = {
            'timeUnitPianoRoll': 'boundTimeUnitPianoRoll',
            'textOverlay': 'boundTextOverlay',
            'background': 'boundBackground',
            'debug': 'boundDebug',
            'image': 'boundImage',
            'progressDisplay': 'boundProgressDisplay',
            'timeDisplay': 'boundTimeDisplay'
        };

        return typeMapping[legacyType] || legacyType;
    }

    /**
     * Get macro assignments for a legacy element from the macro manager
     */
    _getLegacyMacroAssignments(elementId) {
        const assignments = {};
        const allMacros = globalMacroManager.getAllMacrosObject();

        for (const [macroId, macro] of Object.entries(allMacros)) {
            if (macro.assignments) {
                for (const assignment of macro.assignments) {
                    if (assignment.elementId === elementId) {
                        assignments[assignment.propertyPath] = macroId;
                    }
                }
            }
        }

        return assignments;
    }

    /**
     * Handle legacy MIDI data for backward compatibility
     */
    _handleLegacyMIDIData(midiData, midiFileName) {
        console.log('Handling legacy MIDI data...');

        // Find bound piano roll elements and load the MIDI data into them
        const pianoRollElements = this.getElementsByType('boundTimeUnitPianoRoll');
        for (const element of pianoRollElements) {
            if (element instanceof BoundTimeUnitPianoRollElement) {
                // Convert MIDI events to notes format
                const notes = this._convertMidiEventsToNotes(midiData.events);
                element.loadMIDIData(midiData, notes);
                console.log(`Loaded legacy MIDI data into bound piano roll element '${element.id}'`);
            }
        }

        // Update the MIDI file macro if it exists
        if (midiFileName) {
            const mockFile = new File([], midiFileName, { type: 'audio/midi' });
            globalMacroManager.updateMacroValue('midiFile', mockFile);
        }
    }

    /**
     * Create default macros specifically for bound elements
     */
    _createDefaultMacros() {
        console.log('Creating default macros for bound elements...');

        // Create MIDI File macro
        globalMacroManager.createMacro('midiFile', 'file', null, {
            accept: '.mid,.midi',
            description: 'MIDI file to use across all piano roll elements'
        });

        // Create Tempo (BPM) macro
        globalMacroManager.createMacro('tempo', 'number', 120, {
            min: 20,
            max: 300,
            step: 0.1,
            description: 'Beats per minute for all timing elements'
        });

        // Create Beats per Bar macro
        globalMacroManager.createMacro('beatsPerBar', 'number', 4, {
            min: 1,
            max: 16,
            step: 1,
            description: 'Number of beats in each bar for all timing elements'
        });

        // Create text macros
        for (let i = 1; i <= 3; i++) {
            globalMacroManager.createMacro(`text${i}`, 'string', `Text ${i}`, {
                description: `Text content for text element ${i}`
            });
        }

        console.log('Default macros created for bound elements');
    }

    /**
     * Auto-bind elements to appropriate macros
     */
    autoBindElements() {
        console.log('Auto-binding elements to macros...');

        // Find bound piano roll elements and bind them to MIDI macros
        const pianoRollElements = this.getElementsByType('boundTimeUnitPianoRoll');
        pianoRollElements.forEach(element => {
            if (element instanceof BoundTimeUnitPianoRollElement) {
                element.bindMidiFileToMacro('midiFile');
                element.bindBPMToMacro('tempo');
                element.bindBeatsPerBarToMacro('beatsPerBar');
                console.log(`Auto-bound piano roll element '${element.id}' to MIDI macros`);
            }
        });

        // Find text elements and bind them to text macros
        const textElements = this.getElementsByType('boundTextOverlay');
        textElements.forEach((element, index) => {
            if (index < 3 && element instanceof BoundSceneElement) {
                const macroName = `text${index + 1}`;
                element.bindToMacro('text', macroName);
                console.log(`Auto-bound text element '${element.id}' to macro '${macroName}'`);
            }
        });

        console.log('Auto-binding completed');
    }

    /**
     * Enhanced updateElementConfig that handles both legacy and bound elements
     * @param {string} id - Element ID
     * @param {Object} newConfig - New configuration object
     * @returns {boolean} True if element was found and updated
     */
    updateElementConfig(id, newConfig) {
        const element = this.getElement(id);
        if (!element) {
            return false;
        }

        // Check if this is a bound element
        if (element instanceof BoundSceneElement) {
            // Use the bound element's updateConfig method
            element.updateConfig(newConfig);
            return true;
        } else {
            // Fall back to parent implementation for legacy elements
            return super.updateElementConfig(id, newConfig);
        }
    }

    /**
     * Enhanced getElementConfig that handles both legacy and bound elements
     * @param {string} id - Element ID
     * @returns {Object|null} Current element configuration or null if not found
     */
    getElementConfig(id) {
        const element = this.getElement(id);
        if (!element) return null;

        // Check if this is a bound element
        if (element instanceof BoundSceneElement) {
            // Use the bound element's getConfig method
            return element.getConfig();
        } else {
            // Fall back to parent implementation for legacy elements
            return super.getElementConfig(id);
        }
    }

    /**
     * Create a default scene with bound elements
     */
    createDefaultBoundScene() {
        this.clearElements();

        // Create default macros
        this._createDefaultMacros();

        // Add a background element
        // TODO: Implement BoundBackgroundElement

        // Add a bound time unit piano roll
        const timeUnitPianoRoll = new BoundTimeUnitPianoRollElement('main')
            .setZIndex(10)
            .setOffset(750, 750)
            .setAnchor(0.5, 0.5);

        this.addElement(timeUnitPianoRoll);

        // Add a debug element
        // TODO: Implement BoundDebugElement

        // Auto-bind elements to macros
        this.autoBindElements();

        return this;
    }
}
