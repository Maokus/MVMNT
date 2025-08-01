// Background element for rendering the main background
import { SceneElement } from './base';
import { Rectangle } from '../render-objects/index.js';
import { ConfigSchema, BackgroundElementConfig, RenderObjectInterface } from '../types.js';

export class BackgroundElement extends SceneElement {
    public backgroundColor: string = '#1a1a1a'; // Default dark background

    constructor(id: string = 'background', config: BackgroundElementConfig = {}) {
        super('background', id, config);
        this._applyConfig();
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Background',
            description: 'Solid background color for the visualization',
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

    protected _applyConfig(): void {
        super._applyConfig();
        if (this.config.backgroundColor !== undefined) {
            this.backgroundColor = this.config.backgroundColor;
        }
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible) return [];

        const { canvas } = config;
        const renderObjects: RenderObjectInterface[] = [];
        
        // Main background
        const background = new Rectangle(0, 0, canvas.width, canvas.height, this.backgroundColor);
        renderObjects.push(background);

        // Test objects to demonstrate anchor point transformation
        // These should transform together around the same anchor point
        
        // Small test rectangle in the center
        const testRect = new Rectangle(
            canvas.width * 0.4, 
            canvas.height * 0.4, 
            canvas.width * 0.2, 
            canvas.height * 0.2, 
            'rgba(255, 100, 100, 0.5)'
        );
        renderObjects.push(testRect);

        // Test rectangle in top-left
        const testRect2 = new Rectangle(
            canvas.width * 0.1, 
            canvas.height * 0.1, 
            canvas.width * 0.1, 
            canvas.height * 0.1, 
            'rgba(100, 255, 100, 0.7)'
        );
        renderObjects.push(testRect2);

        // Test rectangle in bottom-right
        const testRect3 = new Rectangle(
            canvas.width * 0.8, 
            canvas.height * 0.8, 
            canvas.width * 0.1, 
            canvas.height * 0.1, 
            'rgba(100, 100, 255, 0.7)'
        );
        renderObjects.push(testRect3);
        
        return renderObjects;
    }

    setBackgroundColor(color: string): this {
        this.backgroundColor = color;
        return this;
    }
}
