// Text overlay element for displaying a single line of text with property bindings
import { SceneElement } from './base';
import { RenderObject, Text } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';

export class TextOverlayElement extends SceneElement {
    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            name: 'Text',
            description: 'Single line text display',
            category: 'Layout',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'textContent',
                    label: 'Content',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Edit the copy that appears on screen.',
                    properties: [
                        {
                            key: 'text',
                            type: 'string',
                            label: 'Text Content',
                            default: 'Sample Text',
                            description: 'The text content to display.',
                        },
                    ],
                    presets: [
                        { id: 'titleCard', label: 'Title Card', values: { text: 'Title Goes Here' } },
                        { id: 'callToAction', label: 'Call To Action', values: { text: 'Subscribe for more' } },
                    ],
                },
                {
                    id: 'typography',
                    label: 'Typography',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Control font styling for the text element.',
                    properties: [
                        {
                            key: 'fontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Choose the font family (Google Fonts supported).',
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Font Size (px)',
                            default: 36,
                            min: 8,
                            max: 160,
                            step: 1,
                            description: 'Font size in pixels.',
                        },
                        {
                            key: 'color',
                            type: 'color',
                            label: 'Text Color',
                            default: '#ffffff',
                            description: 'Color used when rendering the text.',
                        },
                    ],
                    presets: [
                        {
                            id: 'headline',
                            label: 'Headline',
                            values: { fontFamily: 'Inter|700', fontSize: 48, color: '#ffffff' },
                        },
                        {
                            id: 'subtitle',
                            label: 'Subtitle',
                            values: { fontFamily: 'Inter|500', fontSize: 28, color: '#94a3b8' },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObject[] = [];

        // Get properties from bindings
        const text = this.getProperty('text') as string;
        const fontSelection = this.getProperty('fontFamily') as string; // may be family or family|weight
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = this.getProperty('fontSize') as number;
        const color = this.getProperty('color') as string;

        // Ensure font is loaded if it's a Google Font
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
        const textElement = new Text(0, 0, text, font, color, 'center', 'middle');
        renderObjects.push(textElement);

        return renderObjects;
    }
}
