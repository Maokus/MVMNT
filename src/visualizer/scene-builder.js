// Hybrid SceneBuilder - converts declarative SceneElements to stateless RenderObjects
import {
    BackgroundElement,
    TimeDisplayElement,
    TextOverlayElement,
    ProgressDisplayElement,
    TimeUnitPianoRollElement,
    DebugElement,
} from './scene-elements/index';
import { SceneElement } from './scene-elements/base.ts';
import { globalMacroManager } from './macro-manager.ts';
import { sceneElementRegistry } from './scene-element-registry.js';

export class HybridSceneBuilder {
    constructor() {
        this.elements = [];
        this.elementRegistry = new Map();
        this.sceneElementRegistry = sceneElementRegistry;
    }

    /**
     * Add a scene element to the scene
     * @param {SceneElement|string} elementOrType - The scene element to add, or element type string
     * @param {string} [id] - Element ID (when first param is type string)
     * @param {Object} [config] - Element configuration (when first param is type string)
     * @returns {SceneElement|boolean} The element if successful, or boolean for compatibility
     */
    addElement(elementOrType, id, config) {
        // If first parameter is a string, treat it as element type
        if (typeof elementOrType === 'string') {
            const element = this.addElementFromRegistry(elementOrType, { id, ...config });
            return element ? true : false; // Return boolean for UI compatibility
        }

        // Otherwise, treat as element object (original behavior)
        const element = elementOrType;
        this.elements.push(element);
        if (element.id) {
            this.elementRegistry.set(element.id, element);
        }
        return this;
    }

    /**
     * Remove a scene element by ID
     * @param {string} id - The ID of the element to remove
     * @returns {boolean} True if element was removed
     */
    removeElement(id) {
        const element = this.elementRegistry.get(id);
        if (element) {
            const index = this.elements.indexOf(element);
            if (index !== -1) {
                // Dispose element resources before removal
                if (typeof element.dispose === 'function') {
                    try {
                        element.dispose();
                    } catch {}
                }
                this.elements.splice(index, 1);
            }
            this.elementRegistry.delete(id);
            return true;
        }
        return false;
    }

    /**
     * Get a scene element by ID
     * @param {string} id - The ID of the element to get
     * @returns {SceneElement|undefined}
     */
    getElement(id) {
        return this.elementRegistry.get(id);
    }

    /**
     * Update an element's ID
     * @param {string} oldId - Current element ID
     * @param {string} newId - New element ID
     * @returns {boolean} True if successful
     */
    updateElementId(oldId, newId) {
        const element = this.elementRegistry.get(oldId);
        if (!element) {
            return false;
        }

        // Check if new ID already exists
        if (this.elementRegistry.has(newId) && newId !== oldId) {
            return false;
        }

        // Update the element's ID
        element.id = newId;

        // Update registry
        this.elementRegistry.delete(oldId);
        this.elementRegistry.set(newId, element);

        return true;
    }

    /**
     * Clear all scene elements
     */
    clearElements() {
        // Dispose all elements to detach listeners and free resources
        for (const el of this.elements) {
            if (el && typeof el.dispose === 'function') {
                try {
                    el.dispose();
                } catch {}
            }
        }
        this.elements = [];
        this.elementRegistry.clear();
        return this;
    }

    /**
     * Clear scene (alias for clearElements for compatibility)
     */
    clearScene() {
        return this.clearElements();
    }

    /**
     * Get the maximum duration across all elements that have local timing managers
     * @returns {number} Maximum duration in seconds
     */
    getMaxDuration() {
        let maxDuration = 0;

        for (const element of this.elements) {
            // Prefer new midiManager duration if present
            if (element.midiManager && typeof element.midiManager.getDuration === 'function') {
                const duration = element.midiManager.getDuration();
                if (duration > maxDuration) maxDuration = duration;
                continue;
            }
            // Legacy timingManager with duration
            if (element.timingManager && typeof element.timingManager.getDuration === 'function') {
                const duration = element.timingManager.getDuration();
                if (duration > maxDuration) maxDuration = duration;
            }
        }

        return maxDuration;
    }

    /**
     * Get all scene elements
     * @returns {SceneElement[]} Array of all scene elements
     */
    getAllElements() {
        return [...this.elements];
    }

    /**
     * Get all macro assignments from all scene elements
     * @param {string} [macroId] - Optional macro ID to filter by. If provided, only returns assignments for this macro
     * @returns {Array} Array of macro assignment objects with elementId, propertyPath, and macroId
     */
    getAllMacroAssignments(macroId = null) {
        const assignments = [];

        for (const element of this.elements) {
            // Only process bound elements that have the getMacroBindingsForMacro method
            if (element instanceof SceneElement) {
                if (macroId) {
                    // Get bindings for a specific macro
                    const propertyPaths = element.getMacroBindingsForMacro(macroId);
                    for (const propertyPath of propertyPaths) {
                        assignments.push({
                            elementId: element.id,
                            propertyPath: propertyPath,
                            macroId: macroId,
                        });
                    }
                } else {
                    // Get all macro bindings
                    const macroBindings = element.getBindingsByType('macro');
                    for (const { propertyPath, binding } of macroBindings) {
                        assignments.push({
                            elementId: element.id,
                            propertyPath: propertyPath,
                            macroId: binding.getMacroId(),
                        });
                    }
                }
            }
        }

        return assignments;
    }

    /**
     * Set the complete scene elements array
     * @param {SceneElement[]} elements - Array of scene elements
     */
    setElements(elements) {
        this.clearElements();
        for (const element of elements) {
            this.addElement(element);
        }
        return this;
    }

    /**
     * Build the complete scene for the current frame
     * @param {Object} config - Configuration object containing all visualization data
     * @param {number} targetTime - Time to render at
     * @returns {RenderObject[]} Array of RenderObjects to render
     */
    buildScene(config, targetTime) {
        // Collect all render objects from scene elements
        const renderObjects = [];

        // Sort elements by zIndex for proper layering
        const sortedElements = [...this.elements]
            .filter((element) => element.visible)
            .sort((a, b) => a.zIndex - b.zIndex);

        // Build render objects from each element
        for (const element of sortedElements) {
            try {
                const elementRenderObjects = element.buildRenderObjects(config, targetTime);
                if (Array.isArray(elementRenderObjects)) {
                    renderObjects.push(...elementRenderObjects);
                }
            } catch (error) {
                console.warn(`Error building render objects for element ${element.id || element.type}:`, error);
            }
        }

        return renderObjects;
    }

    /**
     * Build scene with custom elements (useful for one-off renders)
     * @param {Object} config - Configuration object
     * @param {number} targetTime - Time to render at
     * @param {SceneElement[]} customElements - Custom elements to render instead of stored elements
     * @returns {RenderObject[]} Array of RenderObjects to render
     */
    buildSceneWithElements(config, targetTime, customElements) {
        const renderObjects = [];

        // Sort custom elements by zIndex
        const sortedElements = [...customElements]
            .filter((element) => element.visible)
            .sort((a, b) => a.zIndex - b.zIndex);

        // Build render objects from each element
        for (const element of sortedElements) {
            try {
                const elementRenderObjects = element.buildRenderObjects(config, targetTime);
                if (Array.isArray(elementRenderObjects)) {
                    renderObjects.push(...elementRenderObjects);
                }
            } catch (error) {
                console.warn(`Error building render objects for element ${element.id || element.type}:`, error);
            }
        }

        return renderObjects;
    }

    /**
     * Get all elements of a specific type
     * @param {string} type - The type of elements to get
     * @returns {SceneElement[]}
     */
    getElementsByType(type) {
        return this.elements.filter((element) => element.type === type);
    }

    /**
     * Create a default MIDI visualizer scene with common elements
     * @returns {BoundHybridSceneBuilder} Returns this for chaining
     */
    createDefaultMIDIScene() {
        this.clearElements();

        // Create default macros for MIDI properties
        this._createDefaultMacros();

        // Add elements in z-index order (background first, overlay last)
        this.addElement(
            new BackgroundElement('background', {
                zIndex: 0,
                anchorX: 0,
                anchorY: 0,
            })
        );

        // Use the new consolidated TimeUnitPianoRoll element with local timing
        this.addElement(
            new TimeUnitPianoRollElement('main', {
                zIndex: 10,
                timeUnitBars: 1,
                offsetX: 750,
                offsetY: 750,
                anchorX: 0.5,
                anchorY: 0.5,
            })
        );

        // Time display with local timing
        this.addElement(
            new TimeDisplayElement('timeDisplay', {
                zIndex: 40,
                anchorX: 0,
                anchorY: 1,
                offsetX: 100,
                offsetY: 1400,
            })
        );

        this.addElement(
            new ProgressDisplayElement('progressDisplay', {
                zIndex: 45,
                anchorX: 0,
                anchorY: 1,
                offsetX: 10,
                offsetY: 1500,
            })
        );

        // Add two separate text elements - one for title, one for artist
        this.addElement(
            new TextOverlayElement('titleText', {
                zIndex: 50,
                anchorX: 0,
                anchorY: 0,
                offsetX: 100,
                offsetY: 100,
                text: 'Song Title', // Default placeholder text
                fontSize: 100,
                fontWeight: 'bold',
            })
        );

        // Position artist text 40px below the title text
        this.addElement(
            new TextOverlayElement('artistText', {
                zIndex: 51,
                anchorX: 0,
                anchorY: 0,
                offsetX: 105,
                offsetY: 210,
                text: 'Artist Name', // Default placeholder text
                fontSize: 40,
                fontWeight: 'normal',
            })
        );

        this.addElement(
            new DebugElement('debug', {
                offsetX: 750,
                offsetY: 750,
            })
        );

        // Assign macros to relevant element properties
        this._assignDefaultMacros();

        return this;
    }

    /**
     * Create an element from registry and add it to the scene
     * @param {string} type - Element type from registry
     * @param {Object} config - Element configuration
     * @returns {SceneElement|null} The created element or null if failed
     */
    addElementFromRegistry(type, config = {}) {
        const element = this.sceneElementRegistry.createElement(type, config);
        if (element) {
            this.addElement(element);
            return element;
        }
        return null;
    }

    /**
     * Update an element's configuration
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
        if (element instanceof SceneElement) {
            // Use the bound element's updateConfig method
            element.updateConfig(newConfig);
            return true;
        } else {
            console.warn(`[updateElementConfig] Element '${id}' is not a bound element`);
        }
    }

    /**
     * Get element configuration values
     * @param {string} id - Element ID
     * @returns {Object|null} Current element configuration or null if not found
     */
    getElementConfig(id) {
        const element = this.getElement(id);
        if (!element) return null;

        // Check if this is a bound element
        if (element instanceof SceneElement) {
            // Use the bound element's getConfig method
            return element.getConfig();
        } else {
            const schema = this.sceneElementRegistry.getSchema(element.type);
            const config = {
                id: element.id,
                type: element.type,
                visible: element.visible,
                zIndex: element.zIndex,
            };

            if (schema && schema.properties) {
                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    if (key !== 'id' && key !== 'type') {
                        // Check if element has the property (including inherited ones)
                        if (key in element && element[key] !== undefined) {
                            config[key] = element[key];
                        } else if (propSchema.default !== undefined) {
                            config[key] = propSchema.default;
                        }
                    }
                }
            }

            return config;
        }
    }

    /**
     * Move element to new position in the render order
     * @param {string} id - Element ID
     * @param {number} newIndex - New index position
     * @returns {boolean} True if element was moved
     */
    moveElement(id, newIndex) {
        const element = this.getElement(id);
        if (!element) return false;

        const currentIndex = this.elements.indexOf(element);
        if (currentIndex === -1) return false;

        // Remove from current position
        this.elements.splice(currentIndex, 1);

        // Insert at new position (clamp to valid range)
        const clampedIndex = Math.max(0, Math.min(newIndex, this.elements.length));
        this.elements.splice(clampedIndex, 0, element);

        return true;
    }

    /**
     * Duplicate an existing element with new ID
     * @param {string} sourceId - ID of element to duplicate
     * @param {string} newId - ID for the new element
     * @returns {SceneElement|null} The duplicated element or null if failed
     */
    duplicateElement(sourceId, newId) {
        const sourceElement = this.getElement(sourceId);
        if (!sourceElement) return null;

        const config = this.getElementConfig(sourceId);
        if (!config) return null;

        config.id = newId;
        return this.addElementFromRegistry(sourceElement.type, config);
    }

    /**
     * Enhanced scene serialization with property binding support
     */
    serializeScene() {
        // Serialize elements with binding information
        const serializedElements = this.elements.map((element) => {
            // Check if this is a bound element
            if (element instanceof SceneElement) {
                return {
                    ...element.getSerializableConfig(),
                    index: this.elements.indexOf(element),
                };
            } else {
                // Fallback to regular serialization for legacy elements
                return {
                    ...this.getElementConfig(element.id),
                    index: this.elements.indexOf(element),
                };
            }
        });

        // Get macro data from the global macro manager
        const macroData = globalMacroManager.exportMacros();

        return {
            version: process.env.REACT_APP_VERSION,
            elements: serializedElements,
            macros: macroData,
            serializedAt: new Date().toISOString(),
            bindingSystemVersion: process.env.REACT_APP_BINDING_VERSION,
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
                    console.warn(`[loadScene] Legacy format detected for element '${elementConfig.id}'`);
                    // For legacy format, try to load the element normally
                    element = this.addElementFromRegistry(elementConfig.type, elementConfig);
                }

                if (element) {
                    // Set visibility and z-index if specified
                    if (elementConfig.visible !== undefined) {
                        element.setVisible(elementConfig.visible);
                    }
                    if (elementConfig.zIndex !== undefined) {
                        element.setZIndex(elementConfig.zIndex);
                    }
                    console.log(`Loaded element '${element.id}' of type '${element.type}'`);
                } else {
                    console.warn(`Failed to load element '${elementConfig.id}' of type '${elementConfig.type}'`);
                }
            }

            // Handle legacy MIDI data if present (for backward compatibility)
            if (sceneData.midiData && !hasBindingSystem) {
                this._handleLegacyMIDIData(sceneData.midiData, sceneData.midiFileName);
            }

            // Migrate legacy macro assignments to property bindings if this is an older scene
            if (!hasBindingSystem) {
                console.log('Migrating legacy macro assignments to property bindings...');
                if (globalMacroManager.migrateAssignmentsToBindings) {
                    globalMacroManager.migrateAssignmentsToBindings(this);
                }
            }

            console.log(
                `Scene loaded successfully: ${sortedElements.length} elements, binding system: ${
                    hasBindingSystem ? 'yes' : 'no'
                }`
            );
            return true;
        } catch (error) {
            console.error('Error loading scene:', error);
            return false;
        }
    }

    /**
     * Map legacy element types to new types
     */
    _mapLegacyTypeToNew(legacyType) {
        const typeMapping = {
            boundTimeUnitPianoRoll: 'timeUnitPianoRoll',
            boundTextOverlay: 'textOverlay',
            boundBackground: 'background',
            boundDebug: 'debug',
            boundImage: 'image',
            boundProgressDisplay: 'progressDisplay',
            boundTimeDisplay: 'timeDisplay',
        };

        return typeMapping[legacyType] || legacyType;
    }

    /**
     * Handle legacy MIDI data for backward compatibility
     */
    _handleLegacyMIDIData(midiData, midiFileName) {
        console.log('Handling legacy MIDI data...');

        // Find bound piano roll elements and load the MIDI data into them
        const pianoRollElements = this.getElementsByType('boundTimeUnitPianoRoll');
        for (const element of pianoRollElements) {
            if (element instanceof TimeUnitPianoRollElement) {
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
     * Convert MIDI events back to note format for loading into elements
     * @param {Array} midiEvents - Array of MIDI events
     * @returns {Array} Array of note objects
     * @private
     */
    _convertMidiEventsToNotes(midiEvents) {
        if (!midiEvents || !Array.isArray(midiEvents)) {
            return [];
        }

        const notes = [];
        const noteOnEvents = new Map(); // Track note on events to pair with note off

        for (const event of midiEvents) {
            if (event.type === 'noteOn' && event.velocity > 0) {
                // Store note on event
                const key = `${event.note}_${event.channel || 0}`;
                noteOnEvents.set(key, event);
            } else if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
                // Find matching note on event
                const key = `${event.note}_${event.channel || 0}`;
                const noteOnEvent = noteOnEvents.get(key);

                if (noteOnEvent) {
                    // Create note object
                    const note = {
                        note: event.note,
                        velocity: noteOnEvent.velocity,
                        startTime: noteOnEvent.time,
                        endTime: event.time,
                        duration: event.time - noteOnEvent.time,
                        channel: event.channel || 0,
                    };
                    notes.push(note);
                    noteOnEvents.delete(key);
                }
            }
        }

        // Handle any remaining note on events (notes that don't have corresponding note off)
        for (const [, noteOnEvent] of noteOnEvents) {
            const note = {
                note: noteOnEvent.note,
                velocity: noteOnEvent.velocity,
                startTime: noteOnEvent.time,
                endTime: noteOnEvent.time + 1.0, // Default 1 second duration
                duration: 1.0,
                channel: noteOnEvent.channel || 0,
            };
            notes.push(note);
        }

        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);

        console.log(`Converted ${midiEvents.length} MIDI events to ${notes.length} notes`);
        return notes;
    }

    /**
     * Create default macros for MIDI properties
     * @private
     */
    _createDefaultMacros() {
        console.log('Creating default macros...');

        // Create MIDI File macro
        globalMacroManager.createMacro('midiFile', 'file', null, {
            accept: '.mid,.midi',
            description: 'MIDI file to use across all piano roll elements',
        });

        // Create Tempo (BPM) macro
        globalMacroManager.createMacro('tempo', 'number', 120, {
            min: 20,
            max: 300,
            step: 0.1,
            description: 'Beats per minute for all timing elements',
        });

        // Create Beats per Bar macro
        globalMacroManager.createMacro('beatsPerBar', 'number', 4, {
            min: 1,
            max: 16,
            step: 1,
            description: 'Number of beats in each bar for all timing elements',
        });

        console.log('Default macros created successfully');
    }

    /**
     * Assign default macros to relevant element properties
     * @private
     */
    _assignDefaultMacros() {
        // TODO: Use new macro binding system to assign default macros to elements
        const pianoRoll = this.getElementsByType('timeUnitPianoRoll')[0];
        const timeDisplay = this.getElementsByType('timeDisplay')[0];

        pianoRoll.bindToMacro('bpm', 'tempo');
        pianoRoll.bindToMacro('beatsPerBar', 'beatsPerBar');
        pianoRoll.bindToMacro('midiFile', 'midiFile');
        timeDisplay.bindToMacro('bpm', 'tempo');
        timeDisplay.bindToMacro('beatsPerBar', 'beatsPerBar');
    }

    /**
     * Auto-bind elements to appropriate macros
     */
    autoBindElements() {
        console.log('Auto-binding elements to macros...');

        // Find bound piano roll elements and bind them to MIDI macros
        const pianoRollElements = this.getElementsByType('boundTimeUnitPianoRoll');
        pianoRollElements.forEach((element) => {
            if (element instanceof TimeUnitPianoRollElement) {
                element.bindMidiFileToMacro('midiFile');
                element.bindBPMToMacro('tempo');
                element.bindBeatsPerBarToMacro('beatsPerBar');
                console.log(`Auto-bound piano roll element '${element.id}' to MIDI macros`);
            }
        });

        console.log('Auto-binding completed');
    }

    /**
     * Create a default scene with bound elements
     */
    createTestScene() {
        this.clearElements();

        // Create default macros
        this._createDefaultMacros();

        this.addElement(new BackgroundElement('background'));

        this.addElement(
            new TimeUnitPianoRollElement('main', {
                zIndex: 10,
                timeUnitBars: 1,
                offsetX: 750,
                offsetY: 750,
                anchorX: 0.5,
                anchorY: 0.5,
            })
        );

        this.addElement(
            new TextOverlayElement('titleText', {
                zIndex: 50,
                anchorX: 0,
                anchorY: 0,
                offsetX: 100,
                offsetY: 100,
                text: 'Text 1', // Default placeholder text
                fontSize: 100,
                fontWeight: 'bold',
            })
        );

        // Position artist text 40px below the title text
        this.addElement(
            new TextOverlayElement('artistText', {
                zIndex: 51,
                anchorX: 0,
                anchorY: 0,
                offsetX: 105,
                offsetY: 210,
                text: 'Text 2', // Default placeholder text
                fontSize: 40,
                fontWeight: 'normal',
            })
        );

        // Auto-bind elements to macros
        this.autoBindElements();

        return this;
    }
}
