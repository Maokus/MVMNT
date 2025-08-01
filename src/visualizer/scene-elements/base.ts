// Base SceneElement class for declarative scene definition
import { RenderObjectInterface, ConfigSchema, SceneElementInterface } from '../types.js';

export class SceneElement implements SceneElementInterface {
    public type: string;
    public id: string | null;
    public visible: boolean = true;
    public zIndex: number = 0; // For layering control
    
    // Global transform properties (applied to all render objects)
    public offsetX: number = 0;
    public offsetY: number = 0;
    public globalScaleX: number = 1;
    public globalScaleY: number = 1;
    public globalRotation: number = 0; // in radians
    
    // Global visibility properties
    public globalOpacity: number = 1;
    
    // Anchor point for global transforms (0-1 range)
    public anchorX: number = 0.5; // 0 = left, 0.5 = center, 1 = right
    public anchorY: number = 0.5; // 0 = top, 0.5 = center, 1 = bottom
    
    public config: { [key: string]: any }; // Store configuration object

    constructor(type: string, id: string | null = null, config: { [key: string]: any } = {}) {
        this.type = type;
        this.id = id;
        this.config = { ...config }; // Store configuration object
        this._applyConfig();
    }

    /**
     * Template method for building RenderObjects with automatic transform application
     * Child classes should override _buildRenderObjects instead
     * @param config - Current visualization configuration
     * @param targetTime - Current time to render at
     * @returns Array of RenderObjects to render with transforms applied
     */
    buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible) return [];

        // Call the child class implementation
        const renderObjects = this._buildRenderObjects(config, targetTime);

        // Apply global transforms and visibility to all render objects
        return renderObjects.map(obj => {
            // Set global transform properties on each render object
            obj.globalOffsetX = this.offsetX;
            obj.globalOffsetY = this.offsetY;
            obj.globalScaleX = this.globalScaleX;
            obj.globalScaleY = this.globalScaleY;
            obj.globalRotation = this.globalRotation;
            obj.globalOpacity = this.globalOpacity;
            obj.globalAnchorX = this.anchorX;
            obj.globalAnchorY = this.anchorY;
            
            // Apply visibility
            obj.visible = obj.visible && this.visible;
            
            return obj;
        });
    }

    /**
     * Abstract method for child classes to implement their specific RenderObject creation
     * This replaces the old buildRenderObjects method that child classes used to override
     * @param config - Current visualization configuration
     * @param targetTime - Current time to render at
     * @returns Array of RenderObjects to render (before global transforms)
     */
    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        throw new Error('_buildRenderObjects must be implemented by subclasses');
    }

    /**
     * Static method to get the configuration schema for this element type
     * Should be overridden by subclasses
     * @returns Configuration schema object
     */
    static getConfigSchema(): ConfigSchema {
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
                },
                // Global transform controls (applied to all render objects)
                offsetX: {
                    type: 'number',
                    label: 'Offset X',
                    default: 0,
                    min: -1000,
                    max: 1000,
                    step: 1,
                    description: 'Global horizontal position offset'
                },
                offsetY: {
                    type: 'number',
                    label: 'Offset Y',
                    default: 0,
                    min: -1000,
                    max: 1000,
                    step: 1,
                    description: 'Global vertical position offset'
                },
                globalScaleX: {
                    type: 'number',
                    label: 'Global Scale X',
                    default: 1,
                    min: 0.01,
                    max: 5,
                    step: 0.01,
                    description: 'Global horizontal scaling factor'
                },
                globalScaleY: {
                    type: 'number',
                    label: 'Global Scale Y',
                    default: 1,
                    min: 0.01,
                    max: 5,
                    step: 0.01,
                    description: 'Global vertical scaling factor'
                },
                globalRotation: {
                    type: 'number',
                    label: 'Global Rotation (degrees)',
                    default: 0,
                    min: -360,
                    max: 360,
                    step: 1,
                    description: 'Global rotation angle in degrees'
                },
                // Global visibility controls
                globalOpacity: {
                    type: 'number',
                    label: 'Global Opacity',
                    default: 1,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Global transparency level (0 = invisible, 1 = opaque)'
                },
                // Anchor point controls
                anchorX: {
                    type: 'number',
                    label: 'Anchor X',
                    default: 0.5,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Horizontal anchor point for transforms (0 = left, 0.5 = center, 1 = right)'
                },
                anchorY: {
                    type: 'number',
                    label: 'Anchor Y',
                    default: 0.5,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Vertical anchor point for transforms (0 = top, 0.5 = center, 1 = bottom)'
                }
            }
        };
    }

    /**
     * Update element configuration
     * @param newConfig - New configuration values
     */
    updateConfig(newConfig: { [key: string]: any }): void {
        this.config = { ...this.config, ...newConfig };
        this._applyConfig();
    }

    /**
     * Get current configuration
     * @returns Current configuration
     */
    getConfig(): { [key: string]: any } {
        return {
            id: this.id,
            type: this.type,
            visible: this.visible,
            zIndex: this.zIndex,
            offsetX: this.offsetX,
            offsetY: this.offsetY,
            globalScaleX: this.globalScaleX,
            globalScaleY: this.globalScaleY,
            globalRotation: this.globalRotation * (180 / Math.PI), // Convert to degrees for UI
            globalOpacity: this.globalOpacity,
            anchorX: this.anchorX,
            anchorY: this.anchorY,
            ...this.config
        };
    }

    /**
     * Apply configuration to element properties
     * Should be overridden by subclasses to handle specific properties
     */
    protected _applyConfig(): void {
        if (this.config.visible !== undefined) {
            this.setVisible(this.config.visible);
        }
        if (this.config.zIndex !== undefined) {
            this.setZIndex(this.config.zIndex);
        }
        // Global transform properties
        if (this.config.offsetX !== undefined) {
            this.setOffsetX(this.config.offsetX);
        }
        if (this.config.offsetY !== undefined) {
            this.setOffsetY(this.config.offsetY);
        }
        if (this.config.globalScaleX !== undefined) {
            this.setGlobalScaleX(this.config.globalScaleX);
        }
        if (this.config.globalScaleY !== undefined) {
            this.setGlobalScaleY(this.config.globalScaleY);
        }
        if (this.config.globalRotation !== undefined) {
            this.setGlobalRotation(this.config.globalRotation);
        }
        // Global visibility properties
        if (this.config.globalOpacity !== undefined) {
            this.setGlobalOpacity(this.config.globalOpacity);
        }
        // Anchor point properties
        if (this.config.anchorX !== undefined) {
            this.setAnchorX(this.config.anchorX);
        }
        if (this.config.anchorY !== undefined) {
            this.setAnchorY(this.config.anchorY);
        }
    }

    setVisible(visible: boolean): this {
        this.visible = visible;
        return this;
    }

    setZIndex(zIndex: number): this {
        this.zIndex = zIndex;
        return this;
    }

    // Global transform setters
    setOffsetX(offsetX: number): this {
        this.offsetX = offsetX;
        return this;
    }

    setOffsetY(offsetY: number): this {
        this.offsetY = offsetY;
        return this;
    }

    setOffset(offsetX: number, offsetY: number): this {
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        return this;
    }

    setGlobalScaleX(scaleX: number): this {
        this.globalScaleX = scaleX;
        return this;
    }

    setGlobalScaleY(scaleY: number): this {
        this.globalScaleY = scaleY;
        return this;
    }

    setGlobalScale(scaleX: number, scaleY: number = scaleX): this {
        this.globalScaleX = scaleX;
        this.globalScaleY = scaleY;
        return this;
    }

    setGlobalRotation(rotation: number): this {
        // Convert degrees to radians if the value seems to be in degrees
        this.globalRotation = rotation * (Math.PI / 180);
        return this;
    }

    setGlobalRotationRadians(rotation: number): this {
        this.globalRotation = rotation;
        return this;
    }

    // Global visibility setters
    setGlobalOpacity(opacity: number): this {
        this.globalOpacity = Math.max(0, Math.min(1, opacity));
        return this;
    }

    // Anchor point setters
    setAnchorX(anchorX: number): this {
        this.anchorX = Math.max(0, Math.min(1, anchorX));
        return this;
    }

    setAnchorY(anchorY: number): this {
        this.anchorY = Math.max(0, Math.min(1, anchorY));
        return this;
    }

    setAnchor(anchorX: number, anchorY: number): this {
        this.setAnchorX(anchorX);
        this.setAnchorY(anchorY);
        return this;
    }
}
