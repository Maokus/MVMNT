// Base SceneElement class for declarative scene definition
export class SceneElement {
    constructor(type, id = null, config = {}) {
        this.type = type;
        this.id = id;
        this.visible = true;
        this.zIndex = 0; // For layering control
        this.config = { ...config }; // Store configuration object
    }

    /**
     * Abstract method for building RenderObjects from this element
     * @param {Object} config - Current visualization configuration
     * @param {number} targetTime - Current time to render at
     * @returns {RenderObject[]} Array of RenderObjects to render
     */
    buildRenderObjects(config, targetTime) {
        throw new Error('buildRenderObjects must be implemented by subclasses');
    }

    /**
     * Static method to get the configuration schema for this element type
     * Should be overridden by subclasses
     * @returns {Object} Configuration schema object
     */
    static getConfigSchema() {
        return {
            name: 'Base Element',
            description: 'Base scene element',
            category: 'general',
            properties: {
                id: {
                    type: 'string',
                    label: 'Element ID',
                    default: ''
                },
                visible: {
                    type: 'boolean',
                    label: 'Visible',
                    default: true
                },
                zIndex: {
                    type: 'number',
                    label: 'Layer (Z-Index)',
                    default: 0,
                    min: 0,
                    max: 100,
                    step: 1
                }
            }
        };
    }

    /**
     * Update element configuration
     * @param {Object} newConfig - New configuration values
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._applyConfig();
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return {
            id: this.id,
            type: this.type,
            visible: this.visible,
            zIndex: this.zIndex,
            ...this.config
        };
    }

    /**
     * Apply configuration to element properties
     * Should be overridden by subclasses to handle specific properties
     */
    _applyConfig() {
        if (this.config.visible !== undefined) {
            this.setVisible(this.config.visible);
        }
        if (this.config.zIndex !== undefined) {
            this.setZIndex(this.config.zIndex);
        }
    }

    setVisible(visible) {
        this.visible = visible;
        return this;
    }

    setZIndex(zIndex) {
        this.zIndex = zIndex;
        return this;
    }
}
