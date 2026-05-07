// Template: Text Display Element
// Displays customizable text with various formatting options
import {
    SceneElement,
    prop,
    insertElementGroups,
    tab,
    Text,
    Rectangle,
    type RenderObject,
    parseFontSelection,
    ensureFontLoaded,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class TextDisplayElement extends SceneElement {
    constructor(id: string = 'textDisplay', config: Record<string, unknown> = {}) {
        super('text-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Text Display',
                description: 'Display customizable text',
                category: 'Custom',
            },
            [
                tab.properties([
                    {
                        id: 'textContent',
                        label: 'Text Content',
                        collapsed: false,
                        properties: [
                            prop.string('textContent', 'Text', 'Hello World', { description: 'Text to display' }),
                            prop.number('fontSize', 'Font Size (px)', 36, {
                                min: 8,
                                max: 160,
                                step: 1,
                                description: 'Font size in pixels.',
                            }),
                            prop.font('fontFamily', 'Font Family', 'Inter', {
                                description: 'Choose the font family (Google Fonts supported).',
                            }),
                        ],
                    },
                    {
                        id: 'textFormatting',
                        label: 'Formatting',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('textColor', 'Text Color', '#FFFFFFFF'),
                            prop.select('textAlign', 'Alignment', 'left', [
                                { label: 'Left', value: 'left' },
                                { label: 'Center', value: 'center' },
                                { label: 'Right', value: 'right' },
                            ]),
                            prop.select('textBaseline', 'Baseline', 'top', [
                                { label: 'Top', value: 'top' },
                                { label: 'Middle', value: 'middle' },
                                { label: 'Bottom', value: 'bottom' },
                            ]),
                            prop.boolean('showBackground', 'Show Background', false),
                            prop.colorAlpha('backgroundColor', 'Background Color', '#00000080'),
                            prop.number('backgroundPadding', 'Background Padding', 16, { min: 0, max: 100, step: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        if (!props.textContent || props.textContent.trim() === '') {
            return objects;
        }

        // Estimate text dimensions (rough approximation)
        const charWidth = props.fontSize * 0.6; // Approximate character width
        const textWidth = props.textContent.length * charWidth;
        const textHeight = props.fontSize * 1.2; // Approximate line height

        // Show background if enabled
        if (props.showBackground) {
            let bgX = -props.backgroundPadding;
            let bgY = -props.backgroundPadding;
            let bgWidth = textWidth + props.backgroundPadding * 2;
            let bgHeight = textHeight + props.backgroundPadding * 2;

            // Adjust for text alignment
            if (props.textAlign === 'center') {
                bgX = -textWidth / 2 - props.backgroundPadding;
            } else if (props.textAlign === 'right') {
                bgX = -textWidth - props.backgroundPadding;
            }

            // Adjust for baseline
            if (props.textBaseline === 'middle') {
                bgY = -textHeight / 2 - props.backgroundPadding;
            } else if (props.textBaseline === 'bottom') {
                bgY = -textHeight - props.backgroundPadding;
            }

            objects.push(new Rectangle(bgX, bgY, bgWidth, bgHeight, props.backgroundColor));
        }

        // Render text
        const fontSelection = props.fontFamily ?? 'Inter'; // may be family or family|weight
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 36;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;

        objects.push(new Text(0, 0, props.textContent, font, props.textColor, props.textAlign, props.textBaseline));

        return objects;
    }
}
