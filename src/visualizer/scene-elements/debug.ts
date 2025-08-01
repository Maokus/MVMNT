// Background element for rendering the main background
import { SceneElement } from './base';
import { Rectangle } from '../render-objects/index.js';
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

        const { canvas } = config;
        const renderObjects: RenderObjectInterface[] = [];
        
        // Main background - mark it as a background element so it doesn't affect transforms
        const background = new Rectangle(0, 0, canvas.width, canvas.height, this.backgroundColor);
        (background as any).isBackground = true; // Mark as background for bounds calculation
        renderObjects.push(background);

        const testRect1 = new Rectangle(100, 100, 100, 100, "#FF0000");
        renderObjects.push(testRect1);

        const testRect2 = new Rectangle(300, 500, 200, 100, "#00FF00");
        renderObjects.push(testRect2);

        const testRect3 = new Rectangle(1000, 800, 100, 100, "#0000FF");
        renderObjects.push(testRect3);

        return renderObjects;
    }

    /**
     * Override bounding box calculation to exclude the main background rectangle
     * This allows transforms to work around the debug squares rather than the entire canvas
     */
    protected _calculateSceneElementBounds(renderObjects: RenderObjectInterface[]): { x: number, y: number, width: number, height: number } {
        // Filter out background elements for bounds calculation
        const nonBackgroundObjects = renderObjects.filter(obj => !(obj as any).isBackground);
        
        if (nonBackgroundObjects.length === 0) {
            // If only background elements exist, fall back to default behavior
            return super._calculateSceneElementBounds(renderObjects);
        }

        // Calculate bounds based only on non-background objects
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const obj of nonBackgroundObjects) {
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
