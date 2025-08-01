// Text element for displaying a single line of text
import { SceneElement } from './base';
import { Text } from '../render-objects/index.js';
import { ConfigSchema, TextOverlayElementConfig, RenderObjectInterface } from '../types.js';

export class TextOverlayElement extends SceneElement {
    public justification: 'left' | 'center' | 'right' = 'center'; // Text alignment
    public x: number = 200; // X coordinate of reference point
    public y: number = 100; // Y coordinate of reference point
    public text: string = 'Sample Text'; // The text to display
    public fontFamily: string = 'Arial'; // Font family
    public fontWeight: string = 'bold'; // Font weight
    public fontSize: number = 36; // Font size
    public color: string = '#ffffff'; // Text color

    constructor(id: string = 'textOverlay', justification: 'left' | 'center' | 'right' = 'center', config: TextOverlayElementConfig = {}) {
        super('textOverlay', id, { justification, ...config });
        this.justification = justification;
        this._applyConfig();
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Text Element',
            description: 'Single line text display',
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

    protected _applyConfig(): void {
        super._applyConfig();
        if (this.config.justification !== undefined) {
            this.justification = this.config.justification;
        }
        if (this.config.x !== undefined) {
            this.x = this.config.x;
        }
        if (this.config.y !== undefined) {
            this.y = this.config.y;
        }
        if (this.config.text !== undefined) {
            this.text = this.config.text;
        }
        if (this.config.fontFamily !== undefined) {
            this.fontFamily = this.config.fontFamily;
        }
        if (this.config.fontWeight !== undefined) {
            this.fontWeight = this.config.fontWeight;
        }
        if (this.config.fontSize !== undefined) {
            this.fontSize = this.config.fontSize;
        }
        if (this.config.color !== undefined) {
            this.color = this.config.color;
        }
    }

    buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible) return [];

        const renderObjects: RenderObjectInterface[] = [];

        // Use the x,y coordinates directly with the justification as alignment
        const align = this.justification; // 'left', 'center', 'right'

        // Create text render object
        const font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}, sans-serif`;
        const textElement = new Text(this.x, this.y, this.text, font, this.color, align, 'top');
        renderObjects.push(textElement);

        return renderObjects;
    }

    setJustification(justification: 'left' | 'center' | 'right'): this {
        this.justification = justification;
        return this;
    }

    setX(x: number): this {
        this.x = x;
        return this;
    }

    setY(y: number): this {
        this.y = y;
        return this;
    }

    setText(text: string): this {
        this.text = text;
        return this;
    }

    setFontFamily(fontFamily: string): this {
        this.fontFamily = fontFamily;
        return this;
    }

    setFontWeight(fontWeight: string): this {
        this.fontWeight = fontWeight;
        return this;
    }

    setFontSize(fontSize: number): this {
        this.fontSize = fontSize;
        return this;
    }

    setColor(color: string): this {
        this.color = color;
        return this;
    }
}
