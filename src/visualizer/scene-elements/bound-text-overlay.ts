// Bound Text overlay element for displaying a single line of text with property bindings
import { BoundSceneElement } from './bound-base';
import { Text } from '../render-objects/index.js';
import { ConfigSchema, RenderObjectInterface } from '../types.js';

export class BoundTextOverlayElement extends BoundSceneElement {

    constructor(id: string = 'boundTextOverlay', config: { [key: string]: any } = {}) {
        super('boundTextOverlay', id, config);
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Bound Text Element',
            description: 'Single line text display with property bindings',
            category: 'info',
            properties: {
                ...super.getConfigSchema().properties,
                justification: {
                    type: 'select',
                    label: 'Justification',
                    default: 'center',
                    options: [
                        { value: 'left', label: 'Left' },
                        { value: 'center', label: 'Center' },
                        { value: 'right', label: 'Right' }
                    ],
                    description: 'Text alignment and anchor point'
                },
                x: {
                    type: 'number',
                    label: 'X Position',
                    default: 200,
                    min: 0,
                    max: 800,
                    step: 1,
                    description: 'Horizontal position of the reference point'
                },
                y: {
                    type: 'number',
                    label: 'Y Position',
                    default: 100,
                    min: 0,
                    max: 800,
                    step: 1,
                    description: 'Vertical position of the reference point'
                },
                text: {
                    type: 'string',
                    label: 'Text',
                    default: 'Sample Text',
                    description: 'The text to display'
                },
                fontFamily: {
                    type: 'select',
                    label: 'Font Family',
                    default: 'Arial',
                    options: [
                        { value: 'Arial', label: 'Arial' },
                        { value: 'Helvetica', label: 'Helvetica' },
                        { value: 'Times New Roman', label: 'Times New Roman' },
                        { value: 'Georgia', label: 'Georgia' },
                        { value: 'Verdana', label: 'Verdana' },
                        { value: 'Trebuchet MS', label: 'Trebuchet MS' },
                        { value: 'Impact', label: 'Impact' },
                        { value: 'Courier New', label: 'Courier New' }
                    ],
                    description: 'Font family for the text'
                },
                fontWeight: {
                    type: 'select',
                    label: 'Font Weight',
                    default: 'bold',
                    options: [
                        { value: 'normal', label: 'Normal' },
                        { value: 'bold', label: 'Bold' },
                        { value: '100', label: 'Thin' },
                        { value: '300', label: 'Light' },
                        { value: '500', label: 'Medium' },
                        { value: '700', label: 'Bold' },
                        { value: '900', label: 'Black' }
                    ],
                    description: 'Font weight for the text'
                },
                fontSize: {
                    type: 'number',
                    label: 'Font Size',
                    default: 36,
                    min: 8,
                    max: 120,
                    step: 1,
                    description: 'Font size in pixels'
                },
                color: {
                    type: 'color',
                    label: 'Text Color',
                    default: '#ffffff',
                    description: 'Color of the text'
                }
            }
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObjectInterface[] = [];

        // Get properties from bindings
        const justification = this.getProperty('justification') as 'left' | 'center' | 'right';
        const x = this.getProperty('x') as number;
        const y = this.getProperty('y') as number;
        const text = this.getProperty('text') as string;
        const fontFamily = this.getProperty('fontFamily') as string;
        const fontWeight = this.getProperty('fontWeight') as string;
        const fontSize = this.getProperty('fontSize') as number;
        const color = this.getProperty('color') as string;

        // Use the element's own x,y coordinates for text positioning
        const align = justification; // 'left', 'center', 'right'

        // Create text render object using element's own position
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
        const textElement = new Text(x, y, text, font, color, align, 'top');
        renderObjects.push(textElement);

        return renderObjects;
    }
}
