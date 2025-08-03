// Scene Element Registry for dynamic element creation
import {
    BackgroundElement,
    TimeDisplayElement,
    TextOverlayElement,
    ProgressDisplayElement,
    ImageElement,
    TimeUnitPianoRollElement,
} from './scene-elements/index.ts';

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
        // Background Element
        this.registerElement('background', (config) => {
            const element = new BackgroundElement(config.id || 'background', config);
            return element;
        }, BackgroundElement.getConfigSchema());

        // Time Display Element
        this.registerElement('timeDisplay', (config) => {
            const element = new TimeDisplayElement(config.id || 'timeDisplay',
                config.position, config.showProgress, config);
            return element;
        }, TimeDisplayElement.getConfigSchema());

        // Text Overlay Element
        this.registerElement('textOverlay', (config) => {
            const element = new TextOverlayElement(config.id || 'textOverlay',
                config.position, config);
            return element;
        }, TextOverlayElement.getConfigSchema());

        // Progress Display Element
        this.registerElement('progressDisplay', (config) => {
            const element = new ProgressDisplayElement(config.id || 'progressDisplay',
                config.showBar, config.showStats, config.position, config);
            return element;
        }, ProgressDisplayElement.getConfigSchema());

        // Image Element
        this.registerElement('image', (config) => {
            const element = new ImageElement(config.id || 'image',
                config.x, config.y, config.width, config.height, config.imageSource, config);
            return element;
        }, ImageElement.getConfigSchema());

        // Time Unit Piano Roll Element (consolidated)
        this.registerElement('timeUnitPianoRoll', (config) => {
            const element = new TimeUnitPianoRollElement(config.id || 'timeUnitPianoRoll', config);
            return element;
        }, TimeUnitPianoRollElement.getConfigSchema());

    }
}

// Singleton instance
export const sceneElementRegistry = new SceneElementRegistry();
