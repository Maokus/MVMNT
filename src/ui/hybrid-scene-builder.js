// Hybrid SceneBuilder - converts declarative SceneElements to stateless RenderObjects
import {
    BackgroundElement,
    TimeDisplayElement,
    TextOverlayElement,
    ProgressDisplayElement,
    TimeUnitPianoRollElement
} from '../visualizer/scene-elements/index.js';
import { MIDIVisualizer } from '../visualizer/visualizer.js';
import { SceneElement } from '../visualizer/scene-elements/base.js';
import { globalTimingManager } from '../core/timing-manager.js';
import { globalMacroManager } from '../core/macro-manager.js';
import { sceneElementRegistry } from '../visualizer/scene-element-registry.js';
import { SceneNameGenerator } from './scene-name-generator.js';

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
     * Handle macro assignment by immediately applying the macro's current value
     * @private
     */
    _handleMacroAssignment(data) {
        const { macroName, elementId, propertyPath, currentValue } = data;

        const element = this.getElement(elementId);
        if (element) {
            // Create a partial config update
            const configUpdate = {};
            configUpdate[propertyPath] = currentValue;

            // Update the element configuration
            element.updateConfig(configUpdate);

            console.log(`Applied macro '${macroName}' value to ${elementId}.${propertyPath}:`, currentValue);
        }
    }    /**
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
     * Get all currently registered elements
     * @returns {SceneElement[]}
     */
    getAllElements() {
        return [...this.elements];
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
        this.addElement(new BackgroundElement().setZIndex(0));

        // Use the new consolidated TimeUnitPianoRoll element with local timing
        const timeUnitPianoRoll = new TimeUnitPianoRollElement('main', {})
            .setZIndex(10)
            .setTimeUnitBars(1);
        this.addElement(timeUnitPianoRoll);

        // Time display with local timing
        this.addElement(new TimeDisplayElement('timeDisplay', 'bottomLeft', true, {}).setZIndex(40));
        this.addElement(new ProgressDisplayElement().setZIndex(45));

        // Add two separate text elements - one for title, one for artist
        const titleElement = new TextOverlayElement('titleText', 'topCenter');
        titleElement.setText('Song Title'); // Default placeholder text
        titleElement.setFontSize(100);
        titleElement.setFontWeight('bold');
        titleElement.setZIndex(50);
        titleElement.setY(80);
        titleElement.setX(70);
        this.addElement(titleElement);

        // Position artist text 40px below the title text
        const artistElement = new TextOverlayElement('artistText', 'topCenter');
        artistElement.setText('Artist Name'); // Set initial artist name text
        artistElement.setFontSize(40);
        artistElement.setFontWeight('normal');
        artistElement.setZIndex(51);
        artistElement.setY(190); // Set explicit Y position instead of overriding the render method
        artistElement.setX(75);
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

        // Update the element's config object with new values
        Object.assign(element.config, newConfig);

        // Apply the updated configuration
        element._applyConfig();

        return true;
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
        return {
            version: '1.0',
            elements: this.elements.map(element => ({
                ...this.getElementConfig(element.id),
                index: this.elements.indexOf(element)
            }))
        };
    }

    /**
     * Load scene from serialized data
     * @param {Object} sceneData - Serialized scene data
     * @returns {boolean} True if scene was loaded successfully
     */
    loadScene(sceneData) {
        if (!sceneData || !sceneData.elements) return false;

        this.clearElements();

        // Sort by index to maintain order
        const sortedElements = [...sceneData.elements].sort((a, b) => (a.index || 0) - (b.index || 0));

        for (const elementData of sortedElements) {
            const element = this.addElementFromRegistry(elementData.type, elementData);
            if (element && elementData.visible !== undefined) {
                element.setVisible(elementData.visible);
            }
            if (element && elementData.zIndex !== undefined) {
                element.setZIndex(elementData.zIndex);
            }
        }

        return true;
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
        console.log('Assigning default macros to scene elements...');

        // Assign macros to TimeUnitPianoRoll element
        const pianoRollElement = this.getElement('main');
        if (pianoRollElement) {
            console.log('Found piano roll element, assigning macros...');
            globalMacroManager.assignMacroToProperty('midiFile', 'main', 'midiFile');
            globalMacroManager.assignMacroToProperty('tempo', 'main', 'bpm');
            globalMacroManager.assignMacroToProperty('beatsPerBar', 'main', 'beatsPerBar');
        } else {
            console.warn('Piano roll element not found for macro assignment');
        }

        // Assign macros to TimeDisplay element
        const timeDisplayElement = this.getElement('timeDisplay');
        if (timeDisplayElement) {
            console.log('Found time display element, assigning macros...');
            globalMacroManager.assignMacroToProperty('tempo', 'timeDisplay', 'bpm');
            globalMacroManager.assignMacroToProperty('beatsPerBar', 'timeDisplay', 'beatsPerBar');
        } else {
            console.warn('Time display element not found for macro assignment');
        }

        console.log('Macro assignments completed');
    }
}
