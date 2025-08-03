// Base SceneElement class for declarative scene definition
import { RenderObjectInterface, ConfigSchema, SceneElementInterface } from '../types.js';
import { EmptyRenderObject } from '../render-objects/empty.js';

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
    public globalSkewX: number = 0; // in radians
    public globalSkewY: number = 0; // in radians
    
    // Anchor point properties (for transform origin)
    public anchorX: number = 0.5; // 0.0 = left, 0.5 = center, 1.0 = right
    public anchorY: number = 0.5; // 0.0 = top, 0.5 = center, 1.0 = bottom
    
    // Global visibility properties
    public globalOpacity: number = 1;
    
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
     * 
     * TRANSFORMATION SYSTEM:
     * This method creates an EmptyRenderObject container that applies the scene element's
     * global transforms (position, scale, rotation, skew) and then renders all the child
     * render objects within that transformed context. This maintains proper separation
     * of concerns between scene elements and canvas operations.
     * 
     * @param config - Current visualization configuration
     * @param targetTime - Current time to render at
     * @returns Array of RenderObjects to render with transforms applied
     */
    buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible) return [];

        // Call the child class implementation to build the base render objects
        const childRenderObjects = this._buildRenderObjects(config, targetTime);

        if (childRenderObjects.length === 0) return [];

        // Calculate the bounding box and anchor point for transformation
        const bounds = this._calculateSceneElementBounds(childRenderObjects);
        const anchorPixelX = bounds.x + bounds.width * this.anchorX;
        const anchorPixelY = bounds.y + bounds.height * this.anchorY;

        // Create an empty render object that will contain all child objects
        // This object handles the group transformation
        // Position it so that when the anchor point is at (0,0) locally,
        // it appears at (offsetX, offsetY) globally
        const containerObject = new EmptyRenderObject(
            this.offsetX - anchorPixelX, // Position offset accounting for anchor
            this.offsetY - anchorPixelY,
            this.globalScaleX,
            this.globalScaleY,
            this.globalOpacity
        );

        // Set additional transform properties
        containerObject.setRotation(this.globalRotation);
        containerObject.setSkew(this.globalSkewX, this.globalSkewY);
        containerObject.setVisible(this.visible);

        // Add all child render objects to the container
        // Children keep their original positions relative to the bounding box
        // The container's position offset handles the anchor point adjustment
        for (const childObj of childRenderObjects) {
            if (childObj) {
                // Don't modify child positions - they maintain their relative positions
                // within the scene element's bounding box
                containerObject.addChild(childObj);
            }
        }

        // Return the container as the single render object for this scene element
        return [containerObject];
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
     * Calculate the bounding box that encompasses all render objects in this scene element
     * @param renderObjects - Array of render objects to calculate bounds for
     * @returns Bounding box containing all render objects
     */
    protected _calculateSceneElementBounds(renderObjects: RenderObjectInterface[]): { x: number, y: number, width: number, height: number } {
        if (renderObjects.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        // Calculate the min/max bounds across all render objects
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const obj of renderObjects) {
            const bounds = obj.getBounds();
            
            // Validate bounds - catch potential issues early
            if (!this._validateBounds(bounds, obj)) {
                console.warn(`Invalid bounds detected for ${obj.constructor.name}:`, bounds);
                continue;
            }
            
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }

        const result = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
        
        // Debug logging for bounds calculation (can be disabled in production)
        if (process.env.NODE_ENV === 'development') {
            console.debug(`Scene element ${this.id} bounds:`, {
                objects: renderObjects.length,
                bounds: result,
                anchor: { x: this.anchorX, y: this.anchorY },
                computedAnchor: { 
                    x: result.x + result.width * this.anchorX, 
                    y: result.y + result.height * this.anchorY 
                }
            });
        }

        return result;
    }
    
    /**
     * Validate bounds object for correctness
     * @param bounds - Bounds object to validate
     * @param obj - The render object (for debugging)
     * @returns True if bounds are valid
     */
    private _validateBounds(bounds: any, obj?: any): boolean {
        if (!bounds || typeof bounds !== 'object') {
            return false;
        }
        
        const { x, y, width, height } = bounds;
        
        // Check for required properties
        if (typeof x !== 'number' || typeof y !== 'number' || 
            typeof width !== 'number' || typeof height !== 'number') {
            return false;
        }
        
        // Check for invalid values
        if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) {
            return false;
        }
        
        // Check for negative dimensions (usually indicates an error)
        if (width < 0 || height < 0) {
            console.warn(`Negative dimensions detected in bounds:`, bounds, obj?.constructor?.name);
            return false;
        }
        
        return true;
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
                },
                // Global skew controls
                globalSkewX: {
                    type: 'number',
                    label: 'Global Skew X (degrees)',
                    default: 0,
                    min: -45,
                    max: 45,
                    step: 1,
                    description: 'Global horizontal skew angle in degrees'
                },
                globalSkewY: {
                    type: 'number',
                    label: 'Global Skew Y (degrees)',
                    default: 0,
                    min: -45,
                    max: 45,
                    step: 1,
                    description: 'Global vertical skew angle in degrees'
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
            anchorX: this.anchorX,
            anchorY: this.anchorY,
            globalSkewX: this.globalSkewX * (180 / Math.PI), // Convert to degrees for UI
            globalSkewY: this.globalSkewY * (180 / Math.PI), // Convert to degrees for UI
            globalOpacity: this.globalOpacity,
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
        if (this.config.anchorX !== undefined) {
            this.setAnchorX(this.config.anchorX);
        }
        if (this.config.anchorY !== undefined) {
            this.setAnchorY(this.config.anchorY);
        }
        if (this.config.globalSkewX !== undefined) {
            this.setGlobalSkewX(this.config.globalSkewX);
        }
        if (this.config.globalSkewY !== undefined) {
            this.setGlobalSkewY(this.config.globalSkewY);
        }
        // Global visibility properties
        if (this.config.globalOpacity !== undefined) {
            this.setGlobalOpacity(this.config.globalOpacity);
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

    // Global skew setters
    setGlobalSkewX(skewX: number): this {
        // Convert degrees to radians if the value seems to be in degrees
        this.globalSkewX = skewX * (Math.PI / 180);
        return this;
    }

    setGlobalSkewY(skewY: number): this {
        // Convert degrees to radians if the value seems to be in degrees
        this.globalSkewY = skewY * (Math.PI / 180);
        return this;
    }

    setGlobalSkew(skewX: number, skewY: number): this {
        this.setGlobalSkewX(skewX);
        this.setGlobalSkewY(skewY);
        return this;
    }

    // Global visibility setters
    setGlobalOpacity(opacity: number): this {
        this.globalOpacity = Math.max(0, Math.min(1, opacity));
        return this;
    }
}
