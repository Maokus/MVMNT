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

        const testRect1 = new Rectangle(100, 100, 100, 100, "#FF0000");
        renderObjects.push(testRect1);

        const testRect2 = new Rectangle(300, 500, 200, 100, "#00FF00");
        renderObjects.push(testRect2);

        const testRect3 = new Rectangle(1000, 800, 100, 100, "#0000FF");
        renderObjects.push(testRect3);

        return renderObjects;
    }

    setBackgroundColor(color: string): this {
        this.backgroundColor = color;
        return this;
    }
}
