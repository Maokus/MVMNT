// Example scene element to demonstrate the new property grouping system
import { SceneElement } from './base';
import { Rectangle, Text } from '../render-objects/index.js';
import { ConfigSchema, RenderObjectInterface } from '../types.js';

export class ExampleGroupedElement extends SceneElement {

    constructor(id: string = 'exampleGrouped', config: { [key: string]: any } = {}) {
        super('exampleGrouped', id, config);
        
        // Set some defaults
        const defaults = {
            title: 'Hello World',
            subtitle: 'Demo Text',
            backgroundColor: '#333333',
            textColor: '#ffffff',
            borderWidth: 2,
            borderColor: '#0e639c',
            animationSpeed: 1,
            showBorder: true
        };
        
        // Apply defaults only for properties not already in config
        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in config)) {
                this.setProperty(key, value);
            }
        }
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Demo Element',
            description: 'Example element showcasing property grouping',
            category: 'demo',
            properties: {
                ...super.getConfigSchema().properties,
                
                // Content properties
                title: {
                    type: 'string',
                    label: 'Title',
                    default: 'Hello World',
                    description: 'Main title text to display'
                },
                subtitle: {
                    type: 'string',
                    label: 'Subtitle',
                    default: 'Demo Text',
                    description: 'Secondary text below the title'
                },
                
                // Appearance properties
                backgroundColor: {
                    type: 'color',
                    label: 'Background',
                    default: '#333333',
                    description: 'Background color of the element'
                },
                textColor: {
                    type: 'color',
                    label: 'Text Color',
                    default: '#ffffff',
                    description: 'Color of the text content'
                },
                borderWidth: {
                    type: 'number',
                    label: 'Border Width',
                    default: 2,
                    min: 0,
                    max: 10,
                    step: 1,
                    description: 'Width of the border in pixels'
                },
                borderColor: {
                    type: 'color',
                    label: 'Border Color',
                    default: '#0e639c',
                    description: 'Color of the border'
                },
                showBorder: {
                    type: 'boolean',
                    label: 'Show Border',
                    default: true,
                    description: 'Whether to display the border'
                },
                
                // Behavior properties
                animationSpeed: {
                    type: 'range',
                    label: 'Animation Speed',
                    default: 1,
                    min: 0.1,
                    max: 3,
                    step: 0.1,
                    description: 'Speed multiplier for animations'
                }
            }
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObjectInterface[] = [];
        
        // Get properties from bindings
        const title = this.getProperty('title') as string;
        const subtitle = this.getProperty('subtitle') as string;
        const backgroundColor = this.getProperty('backgroundColor') as string;
        const textColor = this.getProperty('textColor') as string;
        const borderWidth = this.getProperty('borderWidth') as number;
        const showBorder = this.getProperty('showBorder') as boolean;
        
        // Create background rectangle
        const bgRect = new Rectangle(0, 0, 300, 120, backgroundColor);
        renderObjects.push(bgRect);
        
        // Create border if enabled
        if (showBorder && borderWidth > 0) {
            const borderRect = new Rectangle(0, 0, 300, 120, 'transparent');
            // Note: This is a simplified border - actual implementation would need proper border rendering
            renderObjects.push(borderRect);
        }
        
        // Create title text
        const titleFont = `bold 24px Arial, sans-serif`;
        const titleText = new Text(150, 40, title, titleFont, textColor, 'center', 'middle');
        renderObjects.push(titleText);
        
        // Create subtitle text
        const subtitleFont = `normal 16px Arial, sans-serif`;
        const subtitleText = new Text(150, 80, subtitle, subtitleFont, textColor, 'center', 'middle');
        renderObjects.push(subtitleText);

        return renderObjects;
    }
}
