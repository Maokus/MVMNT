// Hybrid SceneBuilder - converts declarative SceneElements to stateless RenderObjects
import {
    BoundBackgroundElement,
    BoundTimeDisplayElement,
    BoundTextOverlayElement,
    BoundProgressDisplayElement,
    BoundTimeUnitPianoRollElement,
} from './scene-elements/index';
import { globalMacroManager } from './macro-manager.ts';
import { sceneElementRegistry } from './scene-element-registry.js';

export class HybridSceneBuilder {
    constructor() {
        this.elements = [];
        this.elementRegistry = new Map();
        this.sceneElementRegistry = sceneElementRegistry;

        // Set up macro listener to update elements when macro values change
        this._setupMacroListener();
    }

    /**
     * Set up macro listener to update elements when macro values change
     * @private
     */
    _setupMacroListener() {
        globalMacroManager.addListener((eventType, data) => {
            if (eventType === 'macroValueChanged') {
                this._handleMacroValueChange(data);
            } else if (eventType === 'macroAssigned') {
                this._handleMacroAssignment(data);
            }
        });
    }

    /**
     * Handle macro value changes by updating relevant elements
     * @private
     */
    _handleMacroValueChange(data) {
        const { name, value, assignments } = data;

        // Update each assigned element
        for (const assignment of assignments) {
            const element = this.getElement(assignment.elementId);
            if (element) {
                // Create a partial config update
                const configUpdate = {};
                configUpdate[assignment.propertyPath] = value;

                // Update the element configuration
                element.updateConfig(configUpdate);

                console.log(`Updated ${assignment.elementId}.${assignment.propertyPath} to:`, value, 'via macro:', name);
            }
        }
    }

    /**
     * Handle macro assignment by immediately applying the macro's current value
     * @private
     */
    _handleMacroAssignment(data) {
        const { macroName, elementId, propertyPath, currentValue } = data;

        const element = this.getElement(elementId);
        if (element) {
            // Create a partial config update with the macro's current value
            const configUpdate = {};
            configUpdate[propertyPath] = currentValue;

            // Update the element configuration
            element.updateConfig(configUpdate);

            console.log(`Applied macro '${macroName}' value to ${elementId}.${propertyPath}:`, currentValue);
        }
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
            // Check if element has a local timing manager with duration
            if (element.timingManager && typeof element.timingManager.getDuration === 'function') {
                const duration = element.timingManager.getDuration();
                if (duration > maxDuration) {
                    maxDuration = duration;
                }
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
            .filter(element => element.visible)
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
            .filter(element => element.visible)
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
        return this.elements.filter(element => element.type === type);
    }

    /**
     * Create a default MIDI visualizer scene with common elements
     * @param {TimingManager} [timingManager] - Optional timing manager (legacy support)
     * @returns {HybridSceneBuilder} Returns this for chaining
     */
    createDefaultMIDIScene(timingManager = null) {
        this.clearElements();

        // Create default macros for MIDI properties
        this._createDefaultMacros();

        // Add elements in z-index order (background first, overlay last)
        this.addElement(new BoundBackgroundElement()
            .setZIndex(0)
            .setAnchor(0, 0)
        );

        // Use the new consolidated TimeUnitPianoRoll element with local timing
        const timeUnitPianoRoll = new BoundTimeUnitPianoRollElement('main', {})
            .setZIndex(10)
            .setTimeUnitBars(1)
            .setOffset(750, 750)
            .setAnchor(0.5, 0.5);
        this.addElement(timeUnitPianoRoll);

        // Time display with local timing
        const timeDisplay = new BoundTimeDisplayElement('timeDisplay', 'bottomLeft', true, {})
            .setZIndex(40)
            .setAnchor(0, 1)
            .setOffset(100, 1400)
        this.addElement(timeDisplay);

        const progressDisplay = new BoundProgressDisplayElement()
            .setZIndex(45)
            .setAnchor(0, 1)
            .setOffset(10, 1500)

        this.addElement(progressDisplay);

        // Add two separate text elements - one for title, one for artist
        const titleElement = new BoundTextOverlayElement('titleText', 'topCenter')
            .setText('Song Title') // Default placeholder text
            .setFontSize(100)
            .setFontWeight('bold')
            .setZIndex(50)
            .setOffset(100, 100)
            .setAnchor(0, 0);
        this.addElement(titleElement);

        // Position artist text 40px below the title text
        const artistElement = new BoundTextOverlayElement('artistText', 'topCenter')
            .setText('Artist Name') // Set initial artist name text
            .setFontSize(40)
            .setFontWeight('normal')
            .setZIndex(51)
            .setOffset(105, 210)
            .setAnchor(0, 0);
        this.addElement(artistElement);

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

        try {
            // Check if element has the expected config structure
            if (!element.config) {
                console.warn(`Element '${id}' does not have a config property`);
                return false;
            }

            // Update the element's config object with new values
            Object.assign(element.config, newConfig);

            // Apply the updated configuration if the method exists
            if (typeof element._applyConfig === 'function') {
                element._applyConfig();
            } else {
                console.warn(`Element '${id}' does not have _applyConfig method`);
                return false;
            }

            return true;
        } catch (error) {
            console.error(`Error updating config for element '${id}':`, error);
            return false;
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

        const schema = this.sceneElementRegistry.getSchema(element.type);
        const config = {
            id: element.id,
            type: element.type,
            visible: element.visible,
            zIndex: element.zIndex
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
     * Get scene as serializable data structure
     * @returns {Object} Serializable scene data
     */
    serializeScene() {
        // Serialize all elements with their complete configuration
        const serializedElements = this.elements.map(element => ({
            ...this.getElementConfig(element.id),
            index: this.elements.indexOf(element)
        }));

        // Get macro data from the global macro manager
        const macroData = globalMacroManager.exportMacros();

        // Get MIDI data from elements that have it (usually TimeUnitPianoRoll elements)
        let midiData = null;
        let midiFileName = null;

        for (const element of this.elements) {
            if (element.type === 'timeUnitPianoRoll' && element.timingManager && element.timingManager.midiData) {
                midiData = element.timingManager.midiData;
                // Try to get the original file name from the macro manager if it exists
                const midiFileMacro = globalMacroManager.getMacro('midiFile');
                if (midiFileMacro && midiFileMacro.value && midiFileMacro.value.name) {
                    midiFileName = midiFileMacro.value.name;
                }
                break; // Use the first piano roll element's MIDI data
            }
        }

        return {
            version: process.env.REACT_APP_VERSION,
            elements: serializedElements,
            macros: macroData,
            midiData: midiData,
            midiFileName: midiFileName,
            serializedAt: new Date().toISOString()
        };
    }

    /**
     * Load scene from serialized data
     * @param {Object} sceneData - Serialized scene data
     * @returns {boolean} True if scene was loaded successfully
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
                // Create default macros if none exist
                this._createDefaultMacros();
            }

            // Sort elements by index to maintain order
            const sortedElements = [...sceneData.elements].sort((a, b) => (a.index || 0) - (b.index || 0));

            // Load all elements
            for (const elementData of sortedElements) {
                const element = this.addElementFromRegistry(elementData.type, elementData);
                if (element) {
                    // Set visibility and z-index if specified
                    if (elementData.visible !== undefined) {
                        element.setVisible(elementData.visible);
                    }
                    if (elementData.zIndex !== undefined) {
                        element.setZIndex(elementData.zIndex);
                    }
                } else {
                    console.warn(`Failed to create element of type '${elementData.type}' with id '${elementData.id}'`);
                }
            }

            // Load MIDI data if it exists
            if (sceneData.midiData) {
                console.log('Loading MIDI data from scene...', {
                    fileName: sceneData.midiFileName || 'Unknown',
                    eventCount: sceneData.midiData.events?.length || 0,
                    duration: sceneData.midiData.duration
                });

                // Find TimeUnitPianoRoll elements and load the MIDI data into them
                const pianoRollElements = this.getElementsByType('timeUnitPianoRoll');
                for (const element of pianoRollElements) {
                    if (element.timingManager && element.timingManager.loadMIDIData) {
                        // Convert MIDI events back to note format for the element
                        const notes = this._convertMidiEventsToNotes(sceneData.midiData.events);
                        element.timingManager.loadMIDIData(sceneData.midiData, notes, false);
                        console.log(`Loaded MIDI data into piano roll element '${element.id}'`);
                    }
                }

                // Update the MIDI file macro if it exists
                const midiFileMacro = globalMacroManager.getMacro('midiFile');
                if (midiFileMacro && sceneData.midiFileName) {
                    // Create a mock file object for the macro
                    const mockFile = new File([], sceneData.midiFileName, { type: 'audio/midi' });
                    globalMacroManager.updateMacroValue('midiFile', mockFile);
                }
            } else {
                console.log('No MIDI data found in scene data');
            }

            console.log(`Scene loaded successfully: ${sortedElements.length} elements, macros: ${sceneData.macros ? 'yes' : 'no'}, MIDI: ${sceneData.midiData ? 'yes' : 'no'}`);
            return true;

        } catch (error) {
            console.error('Error loading scene:', error);
            return false;
        }
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

        console.log('Default macros created successfully');
    }

    /**
     * Assign default macros to relevant element properties
     * @private
     */
    _assignDefaultMacros() {
        console.log('Assigning default macros to element properties...');

        // Find elements to assign macros to
        const textElements = this.getElementsByType('textOverlay');
        const pianoRollElements = this.getElementsByType('timeUnitPianoRoll');
        const timeDisplayElements = this.getElementsByType('timeDisplay');

        // Assign text macros to text elements
        textElements.forEach((element, index) => {
            if (index < 3) { // Only assign to first 3 text elements
                const macroName = `text${index + 1}`;
                globalMacroManager.assignMacroToProperty(macroName, element.id, 'text');
                console.log(`Assigned macro '${macroName}' to text element '${element.id}'`);
            }
        });

        // Assign MIDI file macro to piano roll elements
        pianoRollElements.forEach(element => {
            globalMacroManager.assignMacroToProperty('midiFile', element.id, 'midiFile');
            globalMacroManager.assignMacroToProperty('tempo', element.id, 'bpm');
            globalMacroManager.assignMacroToProperty('beatsPerBar', element.id, 'beatsPerBar');
            console.log(`Assigned MIDI macros to piano roll element '${element.id}'`);
        });

        // Assign tempo macro to time display elements
        timeDisplayElements.forEach(element => {
            globalMacroManager.assignMacroToProperty('tempo', element.id, 'bpm');
            globalMacroManager.assignMacroToProperty('beatsPerBar', element.id, 'beatsPerBar');
            console.log(`Assigned timing macros to time display element '${element.id}'`);
        });

        console.log('Default macro assignments completed');
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
            } else if ((event.type === 'noteOff') || (event.type === 'noteOn' && event.velocity === 0)) {
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
                        channel: event.channel || 0
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
                channel: noteOnEvent.channel || 0
            };
            notes.push(note);
        }

        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);

        console.log(`Converted ${midiEvents.length} MIDI events to ${notes.length} notes`);
        return notes;
    }
}
