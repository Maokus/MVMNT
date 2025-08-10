// Scene Element Registry for dynamic element creation
import {
    TimeUnitPianoRollElement,
    BackgroundElement,
    ImageElement,
    ProgressDisplayElement,
    TextOverlayElement,
    TimeDisplayElement,
    DebugElement,
    ExampleGroupedElement
} from './scene-elements/index';

export class SceneElementRegistry {
    constructor() {
        this.factories = new Map();
        this.schemas = new Map();
        this.registerDefaultElements();
    }

    /**
     * Register a scene element type with its factory function and config schema
     * @param {string} type - The element type identifier
     * @param {Function} factory - Factory function that creates the element (config) => SceneElement
     * @param {Object} schema - Configuration schema for UI generation
     */
    registerElement(type, factory, schema) {
        this.factories.set(type, factory);
        this.schemas.set(type, schema);
    }

    /**
     * Create a scene element of the specified type with config
     * @param {string} type - The element type
     * @param {Object} config - Configuration object
     * @returns {SceneElement|null} The created element or null if type not found
     */
    createElement(type, config = {}) {
        const factory = this.factories.get(type);
        if (!factory) {
            console.warn(`Unknown scene element type: ${type}`);
            return null;
        }
        return factory(config);
    }

    /**
     * Get the configuration schema for an element type
     * @param {string} type - The element type
     * @returns {Object|null} The schema or null if not found
     */
    getSchema(type) {
        return this.schemas.get(type) || null;
    }

    /**
     * Get all registered element types
     * @returns {string[]} Array of registered type names
     */
    getAvailableTypes() {
        return Array.from(this.factories.keys());
    }

    /**
     * Get element type information for UI display
     * @returns {Object[]} Array of type info objects
     */
    getElementTypeInfo() {
        return this.getAvailableTypes().map(type => {
            const schema = this.getSchema(type);
            return {
                type,
                name: schema?.name || type,
                description: schema?.description || `${type} element`,
                category: schema?.category || 'general'
            };
        });
    }

    /**
     * Register default scene element types
     */
    registerDefaultElements() {

        // Register the bound time unit piano roll
        this.registerElement('timeUnitPianoRoll', (config) => {
            const element = new TimeUnitPianoRollElement(config.id || 'timeUnitPianoRoll', config);
            return element;
        }, TimeUnitPianoRollElement.getConfigSchema());

        // Register bound background element
        this.registerElement('background', (config) => {
            const element = new BackgroundElement(config.id || 'background', config);
            return element;
        }, BackgroundElement.getConfigSchema());

        // Register bound image element
        this.registerElement('image', (config) => {
            const element = new ImageElement(config.id || 'image', config);
            return element;
        }, ImageElement.getConfigSchema());

        // Register bound progress display element
        this.registerElement('progressDisplay', (config) => {
            const element = new ProgressDisplayElement(config.id || 'progressDisplay', config);
            return element;
        }, ProgressDisplayElement.getConfigSchema());

        // Register bound text overlay element
        this.registerElement('textOverlay', (config) => {
            const element = new TextOverlayElement(config.id || 'textOverlay', config);
            return element;
        }, TextOverlayElement.getConfigSchema());

        // Register bound time display element
        this.registerElement('timeDisplay', (config) => {
            const element = new TimeDisplayElement(config.id || 'timeDisplay', config);
            return element;
        }, TimeDisplayElement.getConfigSchema());

        this.registerElement('debug', (config) => {
            const element = new DebugElement(config.id || 'debug', config);
            return element;
        }, DebugElement.getConfigSchema());

        // Register example grouped element for demo
        this.registerElement('exampleGrouped', (config) => {
            const element = new ExampleGroupedElement(config.id || 'exampleGrouped', config);
            return element;
        }, ExampleGroupedElement.getConfigSchema());


    }
}

// Singleton instance
export const sceneElementRegistry = new SceneElementRegistry();
