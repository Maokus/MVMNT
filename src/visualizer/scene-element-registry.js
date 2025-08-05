// Scene Element Registry for dynamic element creation
import {
    BoundTimeUnitPianoRollElement,
    BoundBackgroundElement,
    BoundImageElement,
    BoundProgressDisplayElement,
    BoundTextOverlayElement,
    BoundTimeDisplayElement
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

        // Register the bound time unit piano roll
        this.registerElement('boundTimeUnitPianoRoll', (config) => {
            const element = new BoundTimeUnitPianoRollElement(config.id || 'boundTimeUnitPianoRoll', config);
            return element;
        }, BoundTimeUnitPianoRollElement.getConfigSchema());

        // Register bound background element
        this.registerElement('boundBackground', (config) => {
            const element = new BoundBackgroundElement(config.id || 'boundBackground', config);
            return element;
        }, BoundBackgroundElement.getConfigSchema());

        // Register bound image element
        this.registerElement('boundImage', (config) => {
            const element = new BoundImageElement(config.id || 'boundImage', config);
            return element;
        }, BoundImageElement.getConfigSchema());

        // Register bound progress display element
        this.registerElement('boundProgressDisplay', (config) => {
            const element = new BoundProgressDisplayElement(config.id || 'boundProgressDisplay', config);
            return element;
        }, BoundProgressDisplayElement.getConfigSchema());

        // Register bound text overlay element
        this.registerElement('boundTextOverlay', (config) => {
            const element = new BoundTextOverlayElement(config.id || 'boundTextOverlay', config);
            return element;
        }, BoundTextOverlayElement.getConfigSchema());

        // Register bound time display element
        this.registerElement('boundTimeDisplay', (config) => {
            const element = new BoundTimeDisplayElement(config.id || 'boundTimeDisplay', config);
            return element;
        }, BoundTimeDisplayElement.getConfigSchema());


    }
}

// Singleton instance
export const sceneElementRegistry = new SceneElementRegistry();
