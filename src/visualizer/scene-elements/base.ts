// Base SceneElement class for declarative scene definition
import { RenderObjectInterface, ConfigSchema, SceneElementInterface } from '../types.js';
import { EmptyRenderObject } from '../render-objects/empty.js';

export class SceneElement implements SceneElementInterface {
    public type: string;
    public id: string | null;
    public visible: boolean = true;
    public zIndex: number = 0; // For layering control
    
    // Element transform properties (applied to all render objects)
    public offsetX: number = 0;
    public offsetY: number = 0;
    public elementScaleX: number = 1;
    public elementScaleY: number = 1;
    public elementRotation: number = 0; // in radians
    public elementSkewX: number = 0; // in radians
    public elementSkewY: number = 0; // in radians
    
    // Anchor point properties (for transform origin)
    public anchorX: number = 0.5; // 0.0 = left, 0.5 = center, 1.0 = right
    public anchorY: number = 0.5; // 0.0 = top, 0.5 = center, 1.0 = bottom
    
    // Element visibility properties
    public elementOpacity: number = 1;
    
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
            this.elementScaleX,
            this.elementScaleY,
            this.elementOpacity
        );

        // Set anchor offset for proper rotation/scaling center
        // The anchor offset is relative to the container's position
        containerObject.setAnchorOffset(anchorPixelX, anchorPixelY);

        // Set additional transform properties
        containerObject.setRotation(this.elementRotation);
        containerObject.setSkew(this.elementSkewX, this.elementSkewY);
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

        // Add anchor point visualization if enabled
        if (config.showAnchorPoints) {
            containerObject.setAnchorVisualizationData(bounds, this.anchorX, this.anchorY);
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
        let validBoundsCount = 0;

        for (const obj of renderObjects) {
            const bounds = obj.getBounds();
            
            // Validate bounds - catch potential issues early
            if (!this._validateBounds(bounds, obj)) {
                console.warn(`Invalid bounds detected for ${obj.constructor.name}:`, bounds);
                continue;
            }
            
            // Count valid bounds
            validBoundsCount++;
            
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }

        // If no valid bounds were found, return empty bounds
        if (validBoundsCount === 0) {
            console.warn(`No valid bounds found for scene element ${this.id}, returning empty bounds`);
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        const result = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
        
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
                // Element transform controls (applied to all render objects)
                offsetX: {
                    type: 'number',
                    label: 'Offset X',
                    default: 0,
                    min: -10000,
                    max: 10000,
                    step: 1,
                    description: 'Element horizontal position offset'
                },
                offsetY: {
                    type: 'number',
                    label: 'Offset Y',
                    default: 0,
                    min: -10000,
                    max: 10000,
                    step: 1,
                    description: 'Element vertical position offset'
                },
                elementScaleX: {
                    type: 'number',
                    label: 'Element Scale X',
                    default: 1,
                    min: 0.01,
                    max: 5,
                    step: 0.01,
                    description: 'Element horizontal scaling factor'
                },
                elementScaleY: {
                    type: 'number',
                    label: 'Element Scale Y',
                    default: 1,
                    min: 0.01,
                    max: 5,
                    step: 0.01,
                    description: 'Element vertical scaling factor'
                },
                elementRotation: {
                    type: 'number',
                    label: 'Element Rotation (degrees)',
                    default: 0,
                    min: -360,
                    max: 360,
                    step: 1,
                    description: 'Element rotation angle in degrees'
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
                // Element skew controls
                elementSkewX: {
                    type: 'number',
                    label: 'Element Skew X (degrees)',
                    default: 0,
                    min: -45,
                    max: 45,
                    step: 1,
                    description: 'Element horizontal skew angle in degrees'
                },
                elementSkewY: {
                    type: 'number',
                    label: 'Element Skew Y (degrees)',
                    default: 0,
                    min: -45,
                    max: 45,
                    step: 1,
                    description: 'Element vertical skew angle in degrees'
                },
                // Element visibility controls
                elementOpacity: {
                    type: 'number',
                    label: 'Element Opacity',
                    default: 1,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Element transparency level (0 = invisible, 1 = opaque)'
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
            elementScaleX: this.elementScaleX,
            elementScaleY: this.elementScaleY,
            elementRotation: this.elementRotation * (180 / Math.PI), // Convert to degrees for UI
            anchorX: this.anchorX,
            anchorY: this.anchorY,
            elementSkewX: this.elementSkewX * (180 / Math.PI), // Convert to degrees for UI
            elementSkewY: this.elementSkewY * (180 / Math.PI), // Convert to degrees for UI
            elementOpacity: this.elementOpacity,
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
        // Element transform properties
        if (this.config.offsetX !== undefined) {
            this.setOffsetX(this.config.offsetX);
        }
        if (this.config.offsetY !== undefined) {
            this.setOffsetY(this.config.offsetY);
        }
        if (this.config.elementScaleX !== undefined) {
            this.setElementScaleX(this.config.elementScaleX);
        }
        if (this.config.elementScaleY !== undefined) {
            this.setElementScaleY(this.config.elementScaleY);
        }
        if (this.config.elementRotation !== undefined) {
            this.setElementRotation(this.config.elementRotation);
        }
        if (this.config.anchorX !== undefined) {
            this.setAnchorX(this.config.anchorX);
        }
        if (this.config.anchorY !== undefined) {
            this.setAnchorY(this.config.anchorY);
        }
        if (this.config.elementSkewX !== undefined) {
            this.setElementSkewX(this.config.elementSkewX);
        }
        if (this.config.elementSkewY !== undefined) {
            this.setElementSkewY(this.config.elementSkewY);
        }
        // Element visibility properties
        if (this.config.elementOpacity !== undefined) {
            this.setElementOpacity(this.config.elementOpacity);
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

    // Element transform setters
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

    setElementScaleX(scaleX: number): this {
        this.elementScaleX = scaleX;
        return this;
    }

    setElementScaleY(scaleY: number): this {
        this.elementScaleY = scaleY;
        return this;
    }

    setElementScale(scaleX: number, scaleY: number = scaleX): this {
        this.elementScaleX = scaleX;
        this.elementScaleY = scaleY;
        return this;
    }

    setElementRotation(rotation: number): this {
        // Convert degrees to radians if the value seems to be in degrees
        this.elementRotation = rotation * (Math.PI / 180);
        return this;
    }

    setElementRotationRadians(rotation: number): this {
        this.elementRotation = rotation;
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

    // Element skew setters
    setElementSkewX(skewX: number): this {
        // Convert degrees to radians if the value seems to be in degrees
        this.elementSkewX = skewX * (Math.PI / 180);
        return this;
    }

    setElementSkewY(skewY: number): this {
        // Convert degrees to radians if the value seems to be in degrees
        this.elementSkewY = skewY * (Math.PI / 180);
        return this;
    }

    setElementSkew(skewX: number, skewY: number): this {
        this.setElementSkewX(skewX);
        this.setElementSkewY(skewY);
        return this;
    }

    // Element visibility setters
    setElementOpacity(opacity: number): this {
        this.elementOpacity = Math.max(0, Math.min(1, opacity));
        return this;
    }

    // Backward compatibility methods - map to new property names
    setGlobalScaleX(scaleX: number): this {
        return this.setElementScaleX(scaleX);
    }

    setGlobalScaleY(scaleY: number): this {
        return this.setElementScaleY(scaleY);
    }

    setGlobalScale(scaleX: number, scaleY: number = scaleX): this {
        return this.setElementScale(scaleX, scaleY);
    }

    setGlobalRotation(rotation: number): this {
        return this.setElementRotation(rotation);
    }

    setGlobalRotationRadians(rotation: number): this {
        return this.setElementRotationRadians(rotation);
    }

    setGlobalSkewX(skewX: number): this {
        return this.setElementSkewX(skewX);
    }

    setGlobalSkewY(skewY: number): this {
        return this.setElementSkewY(skewY);
    }

    setGlobalSkew(skewX: number, skewY: number): this {
        return this.setElementSkew(skewX, skewY);
    }

    setGlobalOpacity(opacity: number): this {
        return this.setElementOpacity(opacity);
    }

    // Backward compatibility getters
    get globalScaleX(): number { return this.elementScaleX; }
    get globalScaleY(): number { return this.elementScaleY; }
    get globalRotation(): number { return this.elementRotation; }
    get globalSkewX(): number { return this.elementSkewX; }
    get globalSkewY(): number { return this.elementSkewY; }
    get globalOpacity(): number { return this.elementOpacity; }
}
