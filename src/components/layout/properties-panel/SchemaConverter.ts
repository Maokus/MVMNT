import { PropertyGroup, PropertyDefinition, EnhancedConfigSchema } from '../../types';

/**
 * Utility to convert legacy config schemas to the new grouped format
 */
export class SchemaConverter {
    /**
     * Convert a legacy schema to the new grouped format
     */
    static convertToGroupedSchema(legacySchema: any): EnhancedConfigSchema {
        const groups: PropertyGroup[] = [];
        
        // Create property groups based on logical groupings
        const transformProperties: PropertyDefinition[] = [];
        const appearanceProperties: PropertyDefinition[] = [];
        const contentProperties: PropertyDefinition[] = [];
        const behaviorProperties: PropertyDefinition[] = [];
        
        // Categorize properties
        for (const [key, propSchema] of Object.entries(legacySchema.properties || {})) {
            const property = SchemaConverter.convertProperty(key, propSchema as any);
            
            if (SchemaConverter.isTransformProperty(key)) {
                transformProperties.push(property);
            } else if (SchemaConverter.isAppearanceProperty(key)) {
                appearanceProperties.push(property);
            } else if (SchemaConverter.isContentProperty(key)) {
                contentProperties.push(property);
            } else {
                behaviorProperties.push(property);
            }
        }
        
        // Create groups
        if (transformProperties.length > 0) {
            groups.push({
                id: 'transform',
                label: 'Transform',
                collapsed: false,
                properties: transformProperties
            });
        }
        
        if (appearanceProperties.length > 0) {
            groups.push({
                id: 'appearance',
                label: 'Appearance',
                collapsed: false,
                properties: appearanceProperties
            });
        }
        
        if (contentProperties.length > 0) {
            groups.push({
                id: 'content',
                label: 'Content',
                collapsed: false,
                properties: contentProperties
            });
        }
        
        if (behaviorProperties.length > 0) {
            groups.push({
                id: 'behavior',
                label: 'Behavior',
                collapsed: true,
                properties: behaviorProperties
            });
        }
        
        return {
            name: legacySchema.name || 'Element',
            description: legacySchema.description || '',
            category: legacySchema.category,
            groups
        };
    }
    
    /**
     * Convert a single property from legacy format to new format
     */
    private static convertProperty(key: string, propSchema: any): PropertyDefinition {
        return {
            key,
            type: propSchema.type,
            label: propSchema.label || key,
            description: propSchema.description,
            default: propSchema.default,
            min: propSchema.min,
            max: propSchema.max,
            step: propSchema.step,
            options: propSchema.options,
            accept: propSchema.accept
        };
    }
    
    /**
     * Check if a property belongs to the Transform group
     */
    private static isTransformProperty(key: string): boolean {
        const transformKeys = [
            'offsetX', 'offsetY', 'anchorX', 'anchorY',
            'elementScaleX', 'elementScaleY', 'elementRotation',
            'elementSkewX', 'elementSkewY', 'zIndex'
        ];
        return transformKeys.includes(key);
    }
    
    /**
     * Check if a property belongs to the Appearance group
     */
    private static isAppearanceProperty(key: string): boolean {
        const appearanceKeys = [
            'elementOpacity', 'visible', 'color', 'backgroundColor',
            'fontSize', 'fontFamily', 'fontWeight', 'strokeColor',
            'strokeWidth', 'fillColor'
        ];
        return appearanceKeys.includes(key) || key.includes('Color') || key.includes('Opacity');
    }
    
    /**
     * Check if a property belongs to the Content group
     */
    private static isContentProperty(key: string): boolean {
        const contentKeys = [
            'text', 'image', 'file', 'src', 'content', 'message',
            'title', 'subtitle'
        ];
        return contentKeys.includes(key) || key.includes('text') || key.includes('Text');
    }
}
