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
     * This method implements a matrix-based group transformation system where all render objects
     * in the scene element transform together around a configurable anchor point. The transformation
     * matrix follows the formula: G = T_anchor * R * Sk * S * T_anchor^-1
     * 
     * This ensures that when you have multiple objects (e.g., two squares at (0,0) and (100,0))
     * and apply a 90° rotation, they rotate as a unified group around the anchor point rather than
     * each rotating around their individual centers.
     * 
     * @param config - Current visualization configuration
     * @param targetTime - Current time to render at
     * @returns Array of RenderObjects to render with transforms applied
     */
    buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible) return [];

        // Call the child class implementation to build the base render objects
        const renderObjects = this._buildRenderObjects(config, targetTime);

        if (renderObjects.length === 0) return [];

        // Calculate the bounding box and anchor point for transformation
        const bounds = this._calculateSceneElementBounds(renderObjects);
        const anchorX = bounds.x + bounds.width * this.anchorX;
        const anchorY = bounds.y + bounds.height * this.anchorY;

        // Compute the group transformation matrix: G = T_anchor * R * Sk * S * T_anchor^-1
        const groupMatrix = this._computeGroupTransformMatrix(anchorX, anchorY);

        // Apply scene-level transforms to each render object using matrix composition
        return renderObjects.map(obj => {
            // Create a position-only matrix for the object (individual transforms preserved separately)
            const objPositionMatrix = [1, 0, 0, 1, obj.x, obj.y];
            
            // Apply group transformation to the object's position
            const transformedPosition = this._multiplyMatrices(groupMatrix, objPositionMatrix);
            
            // Extract the new position
            const newX = transformedPosition[4];
            const newY = transformedPosition[5];
            
            // For individual object transforms, we need to consider how they compose with group transforms
            // The group scale affects the object's existing scale
            const finalScaleX = obj.scaleX * this.globalScaleX;
            const finalScaleY = obj.scaleY * this.globalScaleY;
            
            // The group rotation affects the object's existing rotation
            const finalRotation = obj.rotation + this.globalRotation;
            
            // The group skew affects the object's existing skew
            const finalSkewX = obj.skewX + this.globalSkewX;
            const finalSkewY = obj.skewY + this.globalSkewY;
            
            // Apply the final transforms to the render object
            obj.setPosition(newX + this.offsetX, newY + this.offsetY);
            obj.setScale(finalScaleX, finalScaleY);
            obj.setRotation(finalRotation);
            obj.setSkew(finalSkewX, finalSkewY);
            obj.setOpacity(obj.opacity * this.globalOpacity);
            obj.setVisible(obj.visible && this.visible);
            
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
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Compute the group transformation matrix for the scene element
     * Formula: G = T_anchor * R * Sk * S * T_anchor^-1
     * @param anchorX - Anchor point X coordinate in world space
     * @param anchorY - Anchor point Y coordinate in world space
     * @returns 3x3 transformation matrix as flat array [a, b, c, d, e, f] representing:
     *          | a  c  e |
     *          | b  d  f |
     *          | 0  0  1 |
     */
    protected _computeGroupTransformMatrix(anchorX: number, anchorY: number): number[] {
        // Start with identity matrix
        let matrix = [1, 0, 0, 1, 0, 0]; // [a, b, c, d, e, f]
        
        // Step 1: Translate to anchor point
        matrix = this._multiplyMatrices([1, 0, 0, 1, -anchorX, -anchorY], matrix);
        
        // Step 2: Apply scaling
        matrix = this._multiplyMatrices([this.globalScaleX, 0, 0, this.globalScaleY, 0, 0], matrix);
        
        // Step 3: Apply skew
        matrix = this._multiplyMatrices([1, Math.tan(this.globalSkewY), Math.tan(this.globalSkewX), 1, 0, 0], matrix);
        
        // Step 4: Apply rotation
        const cos = Math.cos(this.globalRotation);
        const sin = Math.sin(this.globalRotation);
        matrix = this._multiplyMatrices([cos, sin, -sin, cos, 0, 0], matrix);
        
        // Step 5: Translate back from anchor point
        matrix = this._multiplyMatrices([1, 0, 0, 1, anchorX, anchorY], matrix);
        
        return matrix;
    }

    /**
     * Multiply two 2D transformation matrices
     * @param a - First matrix [a, b, c, d, e, f]
     * @param b - Second matrix [a, b, c, d, e, f]
     * @returns Result matrix [a, b, c, d, e, f]
     */
    protected _multiplyMatrices(a: number[], b: number[]): number[] {
        const [a1, b1, c1, d1, e1, f1] = a;
        const [a2, b2, c2, d2, e2, f2] = b;
        
        return [
            a1 * a2 + c1 * b2,           // a
            b1 * a2 + d1 * b2,           // b  
            a1 * c2 + c1 * d2,           // c
            b1 * c2 + d1 * d2,           // d
            a1 * e2 + c1 * f2 + e1,      // e
            b1 * e2 + d1 * f2 + f1       // f
        ];
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
