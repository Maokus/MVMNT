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
            'Transform Test',
            'bold 24px Arial',
            '#FFFFFF',
            'center',
            'middle'
        );
        renderObjects.push(titleText);

        // Subtitle text below the rectangle
        const subtitleText = new Text(
            width * 0.5,
            height * 0.75,
            'All objects transform together',
            '16px Arial',
            '#CCCCCC',
            'center',
            'middle'
        );
        renderObjects.push(subtitleText);

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
        const centerX = width * 0.5;
        const centerY = height * 0.5;
        
        const horizontalLine = new Line(
            width * 0.2, 
            centerY, 
            width * 0.8, 
            centerY, 
            'rgba(255, 255, 0, 0.5)', 
            1
        );
        renderObjects.push(horizontalLine);

        const verticalLine = new Line(
            centerX, 
            height * 0.15, 
            centerX, 
            height * 0.85, 
            'rgba(255, 255, 0, 0.5)', 
            1
        );
        renderObjects.push(verticalLine);

        return renderObjects;
    }
}
