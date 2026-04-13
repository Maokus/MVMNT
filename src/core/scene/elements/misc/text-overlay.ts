// Text overlay element for displaying a single line of text with property bindings
import { SceneElement } from '../base';
import { RenderObject, Text } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';

export class TextOverlayElement extends SceneElement {
    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Text',
            description: 'Single line text display',
            category: 'Misc',
        }, [
            {
                id: 'textContent',
                label: 'Content',
                variant: 'basic',
                collapsed: false,
                description: 'Edit the copy that appears on screen.',
                properties: [
                    prop.string('text', 'Text Content', 'Sample Text', {
                        description: 'The text content to display.',
                    }),
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
                    prop.font('fontFamily', 'Font Family', 'Inter', {
                        description: 'Choose the font family (Google Fonts supported).',
                    }),
                    prop.number('fontSize', 'Font Size (px)', 36, {
                        min: 8, max: 160, step: 1,
                        description: 'Font size in pixels.',
                    }),
                    prop.color('color', 'Text Color', '#ffffff', {
                        description: 'Color used when rendering the text.',
                    }),
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
        ]);
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const renderObjects: RenderObject[] = [];

        // Get properties from bindings
        const text = props.text ?? 'Sample Text';
        const fontSelection = props.fontFamily ?? 'Inter'; // may be family or family|weight
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 36;
        const color = props.color ?? '#ffffff';

        // Ensure font is loaded if it's a Google Font
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
        const textElement = new Text(0, 0, text, font, color, 'center', 'middle');
        renderObjects.push(textElement);

        return renderObjects;
    }
}
