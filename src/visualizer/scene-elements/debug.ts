// Background element for rendering the main background
import { SceneElement } from './base';
import { Line, Rectangle, Text } from '../render-objects/index.js';
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

        const testGrid = false;
        const testRect = true;
        const testDots = true;
        const anchorVis = false;

        if(testGrid){
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
            }
        }

        if(testRect){
            const testRect1 = new Rectangle(100, 100, 100, 100, "#FF0000");
            renderObjects.push(testRect1);

            const testRect2 = new Rectangle(300, 500, 200, 100, "#00FF00");
            renderObjects.push(testRect2);

            const testRect3 = new Rectangle(1000, 800, 100, 100, "#0000FF");
            renderObjects.push(testRect3);


        }

        if(testDots){
            for(let i=0; i<10; i++){
                for(let j=0; j<10; j++){
                    var testDot = new Rectangle(i*100, j*100, 5, 5, "#FFFFFF");
                    var testCoords = new Text( i*100 + 10, j*100 + 10,`(${i*100}, ${j*100})`, "Arial 20px", "#FFFFFF");
                    renderObjects.push(testDot);
                    renderObjects.push(testCoords);
                }
            }
        }

        if(anchorVis && renderObjects.length > 0){
                const bounds = this._calculateSceneElementBounds(renderObjects);
                const anchorPixelX = bounds.x + bounds.width * this.anchorX;
                const anchorPixelY = bounds.y + bounds.height * this.anchorY;
                
                // Draw cross lines through anchor point
                const horizontalLine = new Line(
                    bounds.x, anchorPixelY, 
                    bounds.x + bounds.width, anchorPixelY, 
                    "#FFFF00", 2
                );
                const verticalLine = new Line(
                    anchorPixelX, bounds.y, 
                    anchorPixelX, bounds.y + bounds.height, 
                    "#FFFF00", 2
                );
                
                // Draw anchor point marker
                const anchorMarker = new Rectangle(
                    anchorPixelX - 5, anchorPixelY - 5, 
                    10, 10, 
                    "#FFFF00"
                );
                
                renderObjects.push(horizontalLine, verticalLine, anchorMarker);
                
                // Add text showing anchor coordinates
                const anchorText = new Text(
                    anchorPixelX + 15, anchorPixelY - 15,
                    `Anchor: (${this.anchorX.toFixed(2)}, ${this.anchorY.toFixed(2)})`,
                    "Arial 16px",
                    "#FFFFFF"
                );
                renderObjects.push(anchorText);
            }

        return renderObjects;
    }

    setBackgroundColor(color: string): this {
        this.backgroundColor = color;
        return this;
    }

    // Debug method to test transforms
    setDebugTransforms(rotation: number = 0, skewX: number = 0, skewY: number = 0): this {
        this.setElementRotation(rotation);
        this.setElementSkewX(skewX);
        this.setElementSkewY(skewY);
        console.log(`Debug transforms set: rotation=${rotation}, skewX=${skewX}, skewY=${skewY}`);
        console.log(`Current anchor point: (${this.anchorX}, ${this.anchorY})`);
        return this;
    }

    // Test anchor point changes
    setTestAnchor(anchorX: number, anchorY: number): this {
        this.anchorX = anchorX;
        this.anchorY = anchorY;
        console.log(`Anchor point changed to: (${anchorX}, ${anchorY})`);
        return this;
    }
}
