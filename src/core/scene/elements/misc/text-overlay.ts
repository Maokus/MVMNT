// Text overlay element for displaying a single line of text with property bindings
import {
    SceneElement,
    type EnhancedConfigSchema,
    prop,
    insertElementGroups,
    ensureFontLoaded,
    parseFontSelection,
    propGroup,
    tab,
} from '@mvmnt/plugin-sdk';
import { type RenderObject, Text, Rectangle } from '@mvmnt/plugin-sdk/render';
import { applyOpacity } from '@utils/color';

export class TextOverlayElement extends SceneElement {
    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Text',
                description: 'Single line text display',
                category: 'Misc',
            },
            [
                tab.content([
                    {
                        id: 'textContent',
                        label: 'Content',
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
                ]),
                tab.appearance([
                    propGroup.appearance({ blendMode: true }),
                    propGroup.typography({ stroke: true }),
                    propGroup.container(),
                ]),
            ]
        );
    }

    protected _buildRenderObjects(_config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const renderObjects: RenderObject[] = [];

        const text = props.text ?? 'Sample Text';
        const fontSelection = props.fontFamily ?? 'Inter|400';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 36;
        const color = applyOpacity(props.color ?? '#ffffff', props.opacity ?? 1);
        const textAlign = (props.textAlign ?? 'center') as CanvasTextAlign;
        const blendMode = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;
        const letterSpacing = props.letterSpacing ?? 0;

        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;

        const textElement = new Text(0, 0, text, font, color, textAlign, 'middle');
        textElement.letterSpacing = letterSpacing;
        textElement.blendMode = blendMode === 'source-over' ? null : blendMode;
        if (props.strokeColor && (props.strokeWidth ?? 0) > 0) {
            textElement.setStroke(props.strokeColor, props.strokeWidth);
        }

        renderObjects.push(textElement);

        if (props.showBackground) {
            const paddingX = props.backgroundPaddingX ?? 8;
            const paddingY = props.backgroundPaddingY ?? 4;
            const approxWidth = fontSize * text.length * 0.6;
            const approxHeight = fontSize * 1.3;
            const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
            const bg = new Rectangle(
                -(approxWidth / 2) - paddingX,
                -(approxHeight / 2) - paddingY,
                approxWidth + paddingX * 2,
                approxHeight + paddingY * 2,
                bgColor
            );
            bg.cornerRadius = props.backgroundCornerRadius ?? 4;
            renderObjects.unshift(bg);
        }

        return renderObjects;
    }
}
