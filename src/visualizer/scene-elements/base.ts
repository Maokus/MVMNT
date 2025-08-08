// Enhanced Base SceneElement class with Property Binding System
import { RenderObjectInterface, ConfigSchema, SceneElementInterface } from '../types.js';
import { EmptyRenderObject } from '../render-objects/empty.js';
import { 
    PropertyBinding, 
    ConstantBinding, 
    MacroBinding, 
    PropertyBindingUtils, 
    PropertyBindingData,
    BindingType
} from '../property-bindings';
import { globalMacroManager } from '../macro-manager';

export class SceneElement implements SceneElementInterface {
    public type: string;
    public id: string | null;
    
    // Property bindings - these replace direct property storage
    protected bindings: Map<string, PropertyBinding> = new Map();
    
    // Cache for frequently accessed values
    private _cachedValues: Map<string, any> = new Map();
    private _cacheValid: Map<string, boolean> = new Map();

    constructor(type: string, id: string | null = null, config: { [key: string]: any } = {}) {
        this.type = type;
        this.id = id;
        
        // Initialize default bindings from schema
        this._initializeDefaultBindings();
        
        // Apply configuration, converting values to bindings
        this._applyConfig(config);
        
        // Set up macro change listener to invalidate cache
        this._setupMacroListener();
    }

    /**
     * Set up listener for macro changes to invalidate cache
     */
    private _setupMacroListener(): void {
        globalMacroManager.addListener((eventType: 'macroValueChanged' | 'macroCreated' | 'macroDeleted' | 'macroAssigned' | 'macroUnassigned' | 'macrosImported', data: any) => {
            console.log(`[MacroListener] Event: ${eventType}, data:`, data);
            if (eventType === 'macroValueChanged') {
                // Invalidate cache for properties bound to this macro
                this.bindings.forEach((binding, key) => {
                    if (binding instanceof MacroBinding && binding.getMacroId() === data.name) {
                        console.log(`[MacroListener] Invalidating cache for property '${key}' bound to macro '${data.name}'`);
                        this._cacheValid.set(key, false);
                    }
                });
            } else if (eventType === 'macroDeleted') {
                // Convert all macro bindings for this macro to constant bindings
                this.bindings.forEach((binding, key) => {
                    if (binding instanceof MacroBinding && binding.getMacroId() === data.name) {
                        console.log(`[MacroListener] Converting macro binding for property '${key}' to constant binding due to macro '${data.name}' deletion`);
                        // Get the last known value before conversion
                        const currentValue = binding.getValue();
                        // Convert to constant binding
                        this.bindings.set(key, new ConstantBinding(currentValue));
                        this._cacheValid.set(key, false);
                    }
                });
            }
        });
    }

    /**
     * Initialize default bindings from the element's config schema
     */
    private _initializeDefaultBindings(): void {
        const schema = (this.constructor as any).getConfigSchema();
        if (schema && schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties as any)) {
                if (key !== 'id' && key !== 'type' && (propSchema as any).default !== undefined) {
                    this.bindings.set(key, new ConstantBinding((propSchema as any).default));
                }
            }
        }
        
        // Set default bindings for base properties
        this.bindings.set('visible', new ConstantBinding(true));
        this.bindings.set('zIndex', new ConstantBinding(0));
        this.bindings.set('offsetX', new ConstantBinding(0));
        this.bindings.set('offsetY', new ConstantBinding(0));
        this.bindings.set('elementScaleX', new ConstantBinding(1));
        this.bindings.set('elementScaleY', new ConstantBinding(1));
        this.bindings.set('elementRotation', new ConstantBinding(0));
        this.bindings.set('elementSkewX', new ConstantBinding(0));
        this.bindings.set('elementSkewY', new ConstantBinding(0));
        this.bindings.set('anchorX', new ConstantBinding(0.5));
        this.bindings.set('anchorY', new ConstantBinding(0.5));
        this.bindings.set('elementOpacity', new ConstantBinding(1));
    }

    /**
     * Get a property value through its binding
     */
    protected getProperty<T>(key: string): T {
        // Check cache first
        if (this._cacheValid.get(key)) {
            return this._cachedValues.get(key);
        }

        const binding = this.bindings.get(key);
        if (!binding) {
            console.warn(`No binding found for property '${key}' in element ${this.id}`);
            return undefined as T;
        }

        const value = binding.getValue();
        
        // Cache the value
        this._cachedValues.set(key, value);
        this._cacheValid.set(key, true);
        
        return value;
    }

    /**
     * Set a property value through its binding
     */
    protected setProperty<T>(key: string, value: T): void {
        const binding = this.bindings.get(key);
        if (!binding) {
            // Create a new constant binding
            this.bindings.set(key, new ConstantBinding(value));
        } else {
            binding.setValue(value);
        }
        
        // Invalidate cache
        this._cacheValid.set(key, false);
    }

    /**
     * Bind a property to a macro
     */
    bindToMacro(propertyKey: string, macroId: string): void {
        console.log(`[bindToMacro] Binding property '${propertyKey}' to macro '${macroId}'`);
        this.bindings.set(propertyKey, new MacroBinding(macroId));
        this._cacheValid.set(propertyKey, false);
    }

    /**
     * Convert a property to a constant binding
     */
    unbindFromMacro(propertyKey: string): void {
        const binding = this.bindings.get(propertyKey);
        if (binding instanceof MacroBinding) {
            // Get the current value and make it constant
            const currentValue = binding.getValue();
            this.bindings.set(propertyKey, new ConstantBinding(currentValue));
            this._cacheValid.set(propertyKey, false);
        }
    }

    /**
     * Get property binding for inspection
     */
    getBinding(propertyKey: string): PropertyBinding | undefined {
        return this.bindings.get(propertyKey);
    }

    /**
     * Set property binding directly
     */
    setBinding(propertyKey: string, binding: PropertyBinding): void {
        this.bindings.set(propertyKey, binding);
        this._cacheValid.set(propertyKey, false);
    }

    /**
     * Check if a property is bound to a specific macro
     */
    isBoundToMacro(propertyKey: string, macroId: string): boolean {
        const binding = this.bindings.get(propertyKey);
        return PropertyBindingUtils.isBoundToMacro(binding, macroId);
    }

    /**
     * Get all properties that are bound to macros
     */
    getMacroBoundProperties(): { [propertyKey: string]: string } {
        const result: { [propertyKey: string]: string } = {};
        this.bindings.forEach((binding, key) => {
            if (binding instanceof MacroBinding) {
                result[key] = binding.getMacroId();
            }
        });
        return result;
    }

    /**
     * Search through bindings for bindings of a certain type
     * @param bindingType - The type of binding to search for ('macro' | 'constant')
     * @returns Array of objects containing property path and binding details
     */
    getBindingsByType(bindingType: BindingType): Array<{ propertyPath: string; binding: PropertyBinding }> {
        const result: Array<{ propertyPath: string; binding: PropertyBinding }> = [];
        this.bindings.forEach((binding, propertyPath) => {
            if (binding.type === bindingType) {
                result.push({ propertyPath, binding });
            }
        });
        return result;
    }

    /**
     * Get all macro bindings for a specific macro
     * @param macroId - The ID of the macro to search for
     * @returns Array of property paths that are bound to this macro
     */
    getMacroBindingsForMacro(macroId: string): string[] {
        const result: string[] = [];
        this.bindings.forEach((binding, propertyPath) => {
            if (binding instanceof MacroBinding && binding.getMacroId() === macroId) {
                result.push(propertyPath);
            }
        });
        return result;
    }

    // Property getters using the binding system
    get visible(): boolean { return this.getProperty('visible'); }
    get zIndex(): number { return this.getProperty('zIndex'); }
    get offsetX(): number { return this.getProperty('offsetX'); }
    get offsetY(): number { return this.getProperty('offsetY'); }
    get elementScaleX(): number { return this.getProperty('elementScaleX'); }
    get elementScaleY(): number { return this.getProperty('elementScaleY'); }
    get elementRotation(): number { return this.getProperty('elementRotation'); }
    get elementSkewX(): number { return this.getProperty('elementSkewX'); }
    get elementSkewY(): number { return this.getProperty('elementSkewY'); }
    get anchorX(): number { return this.getProperty('anchorX'); }
    get anchorY(): number { return this.getProperty('anchorY'); }
    get elementOpacity(): number { return this.getProperty('elementOpacity'); }

    // Backward compatibility properties
    get globalScaleX(): number { return this.elementScaleX; }
    get globalScaleY(): number { return this.elementScaleY; }
    get globalRotation(): number { return this.elementRotation; }
    get globalSkewX(): number { return this.elementSkewX; }
    get globalSkewY(): number { return this.elementSkewY; }
    get globalOpacity(): number { return this.elementOpacity; }
    get config(): { [key: string]: any } { return this.getConfig(); }

    /**
     * Template method for building RenderObjects with automatic transform application
     * Child classes should override _buildRenderObjects instead
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
        const containerObject = new EmptyRenderObject(
            this.offsetX - anchorPixelX,
            this.offsetY - anchorPixelY,
            this.elementScaleX,
            this.elementScaleY,
            this.elementOpacity
        );

        // Set anchor offset for proper rotation/scaling center
        containerObject.setAnchorOffset(anchorPixelX, anchorPixelY);
        containerObject.setRotation(this.elementRotation);
        containerObject.setSkew(this.elementSkewX, this.elementSkewY);
        containerObject.setVisible(this.visible);

        // Add all child render objects to the container
        for (const childObj of childRenderObjects) {
            if (childObj) {
                containerObject.addChild(childObj);
            }
        }

        // Add anchor point visualization if enabled
        if (config.showAnchorPoints) {
            containerObject.setAnchorVisualizationData(bounds, this.anchorX, this.anchorY);
        }

        return [containerObject];
    }

    /**
     * Abstract method for child classes to implement their specific rendering logic
     */
    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        // Default implementation returns empty array
        return [];
    }

    /**
     * Calculate the bounding box of all child render objects
     */
    private _calculateSceneElementBounds(renderObjects: RenderObjectInterface[]): { x: number, y: number, width: number, height: number } {
        if (renderObjects.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let validBoundsCount = 0;

        for (const obj of renderObjects) {
            if (obj && typeof obj.getBounds === 'function') {
                const bounds = obj.getBounds();
                if (this._validateBounds(bounds, obj)) {
                    minX = Math.min(minX, bounds.x);
                    minY = Math.min(minY, bounds.y);
                    maxX = Math.max(maxX, bounds.x + bounds.width);
                    maxY = Math.max(maxY, bounds.y + bounds.height);
                    validBoundsCount++;
                }
            }
        }

        if (validBoundsCount === 0) {
            console.warn(`No valid bounds found for scene element ${this.id}, returning empty bounds`);
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Validate bounds object for correctness
     */
    private _validateBounds(bounds: any, obj?: any): boolean {
        if (!bounds || typeof bounds !== 'object') {
            return false;
        }
        
        const { x, y, width, height } = bounds;
        
        if (typeof x !== 'number' || typeof y !== 'number' || 
            typeof width !== 'number' || typeof height !== 'number') {
            return false;
        }
        
        if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) {
            return false;
        }
        
        if (width < 0 || height < 0) {
            console.warn(`Negative dimensions detected in bounds:`, bounds, obj?.constructor?.name);
            return false;
        }
        
        return true;
    }

    /**
     * Get the configuration schema for this element type
     */
    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Bound Base Element',
            description: 'Base scene element with property bindings',
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
                anchorX: {
                    type: 'number',
                    label: 'Anchor X',
                    default: 0.5,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Horizontal anchor point for transforms'
                },
                anchorY: {
                    type: 'number',
                    label: 'Anchor Y',
                    default: 0.5,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Vertical anchor point for transforms'
                },
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
                elementOpacity: {
                    type: 'number',
                    label: 'Element Opacity',
                    default: 1,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Element transparency (0 = transparent, 1 = opaque)'
                }
            }
        };
    }

    /**
     * Get current configuration including binding information
     */
    getConfig(): { [key: string]: any } {
        const config: { [key: string]: any } = {
            id: this.id,
            type: this.type
        };

        // Add all bound properties with their current values
        this.bindings.forEach((binding, key) => {
            config[key] = binding.getValue();
        });

        return config;
    }

    /**
     * Get configuration with binding metadata for serialization
     */
    getSerializableConfig(): { [key: string]: any } {
        const config: { [key: string]: any } = {
            id: this.id,
            type: this.type
        };

        // Add all bindings in serialized form
        this.bindings.forEach((binding, key) => {
            console.log(`[getSerializableConfig] Serializing binding for ${key}:`, binding);
            config[key] = binding.serialize();
        });

        return config;
    }

    /**
     * Apply configuration from either raw values or binding data
     */
    protected _applyConfig(config: { [key: string]: any }): void {
        console.log(`[BoundSceneElement] Applying config for ${this.id}:`, config);
        
        for (const [key, value] of Object.entries(config)) {
            if (key === 'id' || key === 'type') continue;

            // Check if this is binding data
            if (value && typeof value === 'object' && value.type && (value.type === 'constant' || value.type === 'macro')) {
                // This is serialized binding data
                this.bindings.set(key, PropertyBinding.fromSerialized(value as PropertyBindingData));
            } else {
                // This is a raw value, create a constant binding
                this.bindings.set(key, new ConstantBinding(value));
            }
            
            this._cacheValid.set(key, false);
        }
    }

    /**
     * Update configuration with new values
     */
    updateConfig(newConfig: { [key: string]: any }): this {
        console.log(`[BoundSceneElement] Updating config for ${this.id}:`, newConfig);
        this._applyConfig(newConfig);
        return this;
    }

    // Setter methods that work with the binding system
    setVisible(visible: boolean): this {
        this.setProperty('visible', visible);
        return this;
    }

    setZIndex(zIndex: number): this {
        this.setProperty('zIndex', zIndex);
        return this;
    }

    setOffsetX(offsetX: number): this {
        this.setProperty('offsetX', offsetX);
        return this;
    }

    setOffsetY(offsetY: number): this {
        this.setProperty('offsetY', offsetY);
        return this;
    }

    setOffset(offsetX: number, offsetY: number): this {
        this.setProperty('offsetX', offsetX);
        this.setProperty('offsetY', offsetY);
        return this;
    }

    setElementScaleX(scaleX: number): this {
        this.setProperty('elementScaleX', scaleX);
        return this;
    }

    setElementScaleY(scaleY: number): this {
        this.setProperty('elementScaleY', scaleY);
        return this;
    }

    setElementScale(scaleX: number, scaleY: number = scaleX): this {
        this.setProperty('elementScaleX', scaleX);
        this.setProperty('elementScaleY', scaleY);
        return this;
    }

    setElementRotation(rotation: number): this {
        // Convert degrees to radians
        this.setProperty('elementRotation', rotation * (Math.PI / 180));
        return this;
    }

    setElementRotationRadians(rotation: number): this {
        this.setProperty('elementRotation', rotation);
        return this;
    }

    setAnchorX(anchorX: number): this {
        this.setProperty('anchorX', Math.max(0, Math.min(1, anchorX)));
        return this;
    }

    setAnchorY(anchorY: number): this {
        this.setProperty('anchorY', Math.max(0, Math.min(1, anchorY)));
        return this;
    }

    setAnchor(anchorX: number, anchorY: number): this {
        this.setAnchorX(anchorX);
        this.setAnchorY(anchorY);
        return this;
    }

    setElementSkewX(skewX: number): this {
        // Convert degrees to radians
        this.setProperty('elementSkewX', skewX * (Math.PI / 180));
        return this;
    }

    setElementSkewY(skewY: number): this {
        // Convert degrees to radians
        this.setProperty('elementSkewY', skewY * (Math.PI / 180));
        return this;
    }

    setElementSkew(skewX: number, skewY: number): this {
        this.setElementSkewX(skewX);
        this.setElementSkewY(skewY);
        return this;
    }

    setElementOpacity(opacity: number): this {
        this.setProperty('elementOpacity', Math.max(0, Math.min(1, opacity)));
        return this;
    }

    // Backward compatibility methods
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
}
