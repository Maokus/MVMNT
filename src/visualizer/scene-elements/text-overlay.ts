// Text overlay element for displaying a single line of text with property bindings
import { SceneElement } from './base';
import { Text } from '../render-objects';
import { EnhancedConfigSchema, RenderObjectInterface } from '../types.js';
import { ensureFontLoaded } from '../../utils/font-loader';

export class TextOverlayElement extends SceneElement {
    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Text',
            description: 'Single line text display',
            category: 'info',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        {
                            key: 'text',
                            type: 'string',
                            label: 'Text',
                            default: 'Sample Text',
                            description: 'The text content to display',
                        },
                    ],
                },
                {
                    id: 'appearance',
                    label: 'Appearance',
                    collapsed: false,
                    properties: [
                        {
                            key: 'fontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Choose the font family (Google Fonts supported)',
                        },
                        {
                            key: 'fontWeight',
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
                                { value: '900', label: 'Black' },
                            ],
                            description: 'Set the font weight (thickness) of the text',
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Size',
                            default: 36,
                            min: 8,
                            max: 120,
                            step: 1,
                            description: 'Font size in pixels',
                        },
                        { key: 'color', type: 'color', label: 'Color', default: '#ffffff', description: 'Text color' },
                    ],
                },
            ],
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

        // Ensure font is loaded if it's a Google Font
        if (fontFamily) ensureFontLoaded(fontFamily);
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
        const textElement = new Text(0, 0, text, font, color, 'center', 'middle');
        renderObjects.push(textElement);

        return renderObjects;
    }
}
