// Test scene element to demonstrate the anchor point transformation system
import { SceneElement } from './base';
import { Rectangle, Text, Line } from '../render-objects/index.js';
import { RenderObjectInterface } from '../types';

export class TestAnchorTransformElement extends SceneElement {
    constructor(id = 'testAnchorTransform', config: { [key: string]: any } = {}) {
        super('testAnchorTransform', id, config);
        this._applyConfig();
    }

    static getConfigSchema() {
        return {
            name: 'Test Anchor Transform',
            description: 'Test element showing multiple render objects transforming around a common anchor point',
            category: 'test',
            properties: {
                ...super.getConfigSchema().properties,
                showExample: {
                    type: 'boolean' as const,
                    label: 'Show Example',
                    default: true,
                    description: 'Show example render objects for testing'
                }
            }
        };
    }

    protected _applyConfig(): void {
        super._applyConfig();
        // Additional configuration can go here
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        const renderObjects: RenderObjectInterface[] = [];
        const { canvas } = config;
        const { width, height } = canvas;

        if (!this.config.showExample) return renderObjects;

        // Create a few different render objects positioned in different areas
        // These will all transform around a common anchor point
        
        // Main rectangle
        const mainRect = new Rectangle(
            width * 0.3, 
            height * 0.3, 
            width * 0.4, 
            height * 0.4, 
            'rgba(100, 150, 255, 0.7)',
            null,
            2
        );
        mainRect.setStroke('rgba(255, 255, 255, 0.8)', 2);
        renderObjects.push(mainRect);

        // Title text above the rectangle
        const titleText = new Text(
            width * 0.5,
            height * 0.25,
            'Anchor Point Transform Test',
            'bold 24px Arial',
            '#FFFFFF',
            'center',
            'middle'
        );
        renderObjects.push(titleText);

        // Subtitle text showing current anchor point
        const anchorInfo = `Anchor: (${this.anchorX.toFixed(2)}, ${this.anchorY.toFixed(2)})`;
        const subtitleText = new Text(
            width * 0.5,
            height * 0.75,
            anchorInfo,
            '16px Arial',
            '#CCCCCC',
            'center',
            'middle'
        );
        renderObjects.push(subtitleText);

        // Instructions text
        const instructionText = new Text(
            width * 0.5,
            height * 0.8,
            'Try rotating: All objects should rotate around the anchor point',
            '14px Arial',
            '#AAAAAA',
            'center',
            'middle'
        );
        renderObjects.push(instructionText);

        // Corner markers to show the extent of the scene element
        const topLeftMarker = new Rectangle(
            width * 0.25, 
            height * 0.2, 
            10, 
            10, 
            '#FF0000'
        );
        renderObjects.push(topLeftMarker);

        const bottomRightMarker = new Rectangle(
            width * 0.65, 
            height * 0.8, 
            10, 
            10, 
            '#FF0000'
        );
        renderObjects.push(bottomRightMarker);

        // Cross lines to show anchor point visualization  
        const bounds = this._calculateBounds(renderObjects);
        const anchorPixelX = bounds.x + bounds.width * this.anchorX;
        const anchorPixelY = bounds.y + bounds.height * this.anchorY;
        
        // Horizontal line through anchor
        const horizontalLine = new Line(
            bounds.x, 
            anchorPixelY, 
            bounds.x + bounds.width, 
            anchorPixelY, 
            'rgba(255, 255, 0, 0.8)', 
            2
        );
        renderObjects.push(horizontalLine);

        // Vertical line through anchor
        const verticalLine = new Line(
            anchorPixelX, 
            bounds.y, 
            anchorPixelX, 
            bounds.y + bounds.height, 
            'rgba(255, 255, 0, 0.8)', 
            2
        );
        renderObjects.push(verticalLine);

        // Anchor point marker
        const anchorMarker = new Rectangle(
            anchorPixelX - 5, 
            anchorPixelY - 5, 
            10, 
            10, 
            '#FFFF00'
        );
        anchorMarker.setStroke('#FF0000', 2);
        renderObjects.push(anchorMarker);

        return renderObjects;
    }

    // Helper method to calculate bounds before transforms are applied
    private _calculateBounds(renderObjects: RenderObjectInterface[]) {
        if (renderObjects.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const obj of renderObjects) {
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
}
