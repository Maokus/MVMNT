// Background element for rendering the main background with property bindings
import { SceneElement } from './base';
import { Rectangle } from '../render-objects/index.js';
import { EnhancedConfigSchema, RenderObjectInterface } from '../types.js';

export class BackgroundElement extends SceneElement {

    constructor(id: string = 'background', config: { [key: string]: any } = {}) {
        super('background', id, config);
        // Only set defaults if not already specified in config
        const defaults = {
            anchorX: 0,
            anchorY: 0,
            offsetX: 0,
            offsetY: 0,
            zIndex: -1000, // Ensure background is always at the back
            backgroundColor: '#1a1a1a' // Default background color
        };
        
        // Apply defaults only for properties not already in config
        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in config)) {
                this.setProperty(key, value);
            }
        }
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Background',
            description: 'Solid background color for the visualization',
            category: 'layout',
            groups: [
                ...base.groups,
                {
                    id: 'appearance',
                    label: 'Appearance',
                    collapsed: false,
                    properties: [
                        {
                            key: 'backgroundColor',
                            type: 'color',
                            label: 'Background Color',
                            default: '#1a1a1a',
                            description: 'Background color for the visualization'
                        }
                    ]
                }
            ]
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.getProperty('visible')) return [];

        const { canvas } = config;
        const renderObjects: RenderObjectInterface[] = [];
        
        // Get background color from property binding
        const backgroundColor = this.getProperty('backgroundColor') as string;
        
        // Main background
        const background = new Rectangle(0, 0, canvas.width, canvas.height, backgroundColor);
        renderObjects.push(background);
        return renderObjects;
    }
}
