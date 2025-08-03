// Background element for rendering the main background
import { SceneElement } from './base';
import { Line, Rectangle } from '../render-objects/index.js';
import { ConfigSchema, BackgroundElementConfig, RenderObjectInterface } from '../types.js';

export class DebugElement extends SceneElement {
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

        const renderObjects: RenderObjectInterface[] = [];

        /*
        for (let i=-10; i < 50; i++) {
            for (let j=0; j < 40; j++) {
                var testLine = new Line(50*j+5, 100 + (i * 50), 50*(j+1), 100 + (i * 50), "#FFFFFF", 1);
                renderObjects.push(testLine);
            }
        }

        for (let i=-10; i < 50; i++) {
            for (let j=0; j < 40; j++) {
                var testLine2 = new Line(50*j, 100 + (i * 50), 50*(j), 100 + ((i+1) * 50)+5, "#FFFFFF", 1);
                renderObjects.push(testLine2);
            }
        }
        for (let i=-10; i < 50; i++) {
            for (let j=0; j < 40; j++) {
                var testLine3 = new Line(50*j, 100 + (i * 50), 50*(j+1), 100 + ((i+1) * 50)+5, "#FF0000", 1);
                renderObjects.push(testLine3);
            }
        }*/

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

    // Debug method to test transforms
    setDebugTransforms(rotation: number = 0, skewX: number = 0, skewY: number = 0): this {
        this.globalRotation = rotation;
        this.globalSkewX = skewX;
        this.globalSkewY = skewY;
        console.log(`Background transforms set: rotation=${rotation}, skewX=${skewX}, skewY=${skewY}`);
        return this;
    }
}
