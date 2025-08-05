// Bound Background element for rendering the main background with property bindings
import { BoundSceneElement } from './bound-base';
import { Rectangle } from '../render-objects/index.js';
import { ConfigSchema, RenderObjectInterface } from '../types.js';

export class BoundBackgroundElement extends BoundSceneElement {

    constructor(id: string = 'boundBackground', config: { [key: string]: any } = {}) {
        super('boundBackground', id, config);
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Bound Background',
            description: 'Solid background color for the visualization with property bindings',
            category: 'layout',
            properties: {
                ...super.getConfigSchema().properties,
                backgroundColor: {
                    type: 'color',
                    label: 'Background Color',
                    default: '#1a1a1a',
                    description: 'Background color for the visualization'
                }
            }
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
