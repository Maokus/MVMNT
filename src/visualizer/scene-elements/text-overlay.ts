// Text overlay element for displaying a single line of text with property bindings
import { SceneElement } from './base';
import { Text } from '../render-objects/index.js';
import { ConfigSchema, RenderObjectInterface } from '../types.js';

export class TextOverlayElement extends SceneElement {

    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Text',
            description: 'Single line text display',
            category: 'info',
            properties: {
                ...super.getConfigSchema().properties,
                text: {
                    type: 'string',
                    label: 'Text',
                    default: 'Sample Text',
                    description: 'The text content to display'
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
                    description: 'Choose the font family for text rendering'
                },
                fontWeight: {
                    type: 'select',
                    label: 'Weight',
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
                    description: 'Set the font weight (thickness) of the text'
                },
                fontSize: {
                    type: 'number',
                    label: 'Size',
                    default: 36,
                    min: 8,
                    max: 120,
                    step: 1,
                    description: 'Font size in pixels'
                },
                color: {
                    type: 'color',
                    label: 'Color',
                    default: '#ffffff',
                    description: 'Text color'
                }
            }
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObjectInterface[] = [];

        // Get properties from bindings
        const text = this.getProperty('text') as string;
        const fontFamily = this.getProperty('fontFamily') as string;
        const fontWeight = this.getProperty('fontWeight') as string;
        const fontSize = this.getProperty('fontSize') as number;
        const color = this.getProperty('color') as string;

        // Create text render object at origin (positioning handled by transform system)
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
        const textElement = new Text(0, 0, text, font, color, 'center', 'middle');
        renderObjects.push(textElement);

        return renderObjects;
    }

}
