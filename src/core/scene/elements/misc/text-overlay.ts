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

const measureLineWidth = (text: string, font: string, letterSpacing = 0): number => {
    try {
        if (typeof OffscreenCanvas !== 'undefined') {
            const c = new OffscreenCanvas(1, 1);
            const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
            if (ctx) {
                ctx.font = font;
                if (letterSpacing !== 0) (ctx as any).letterSpacing = letterSpacing + 'px';
                const w = ctx.measureText(text).width || 0;
                if (letterSpacing !== 0) (ctx as any).letterSpacing = '0px';
                return w;
            }
        }
        if (typeof document !== 'undefined') {
            const c = document.createElement('canvas');
            const ctx = c.getContext('2d');
            if (ctx) {
                ctx.font = font;
                if (letterSpacing !== 0) (ctx as any).letterSpacing = letterSpacing + 'px';
                const w = ctx.measureText(text).width || 0;
                if (letterSpacing !== 0) (ctx as any).letterSpacing = '0px';
                return w;
            }
        }
    } catch {}
    const m = font.match(/(\d*\.?\d+)px/);
    const fs = m ? parseFloat(m[1]) : 16;
    return text.length * fs * 0.6 + text.length * letterSpacing;
};

export class TextOverlayElement extends SceneElement {
    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Text',
                description: 'Multi-line text display',
                category: 'Misc',
                presets: [
                    { id: 'titleCard', label: 'Title Card', values: { text: 'Title Goes Here' } },
                    { id: 'callToAction', label: 'Call To Action', values: { text: 'Subscribe for more' } },
                ],
            },
            [
                tab.content([
                    {
                        id: 'textContent',
                        label: 'Content',
                        collapsed: false,
                        description: 'Edit the copy that appears on screen.',
                        properties: [
                            prop.longString('text', 'Text Content', 'Sample Text', {
                                description: 'The text content to display. Use newlines for multiple lines.',
                            }),
                            prop.number('lineSpacing', 'Line Spacing (px)', 4, { min: 0, max: 80, step: 1 }),
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

        const text = (props.text ?? 'Sample Text') as string;
        const fontSelection = props.fontFamily ?? 'Inter|400';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 36;
        const color = applyOpacity(props.color ?? '#ffffff', props.opacity ?? 1);
        const textAlign = (props.textAlign ?? 'center') as CanvasTextAlign;
        const blendMode = (props.blendMode ?? 'source-over') as GlobalCompositeOperation;
        const letterSpacing = props.letterSpacing ?? 0;
        const lineSpacing = props.lineSpacing ?? 4;

        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;

        const lines = text.split(/\r?\n/);
        const lineHeight = fontSize + lineSpacing;
        const totalHeight = lines.length * fontSize + Math.max(0, lines.length - 1) * lineSpacing;
        const startY = -totalHeight / 2;

        lines.forEach((line, i) => {
            const y = startY + i * lineHeight;
            const textEl = new Text(0, y, line, font, color, textAlign, 'top');
            textEl.letterSpacing = letterSpacing;
            textEl.blendMode = blendMode === 'source-over' ? null : blendMode;
            if (props.strokeColor && (props.strokeWidth ?? 0) > 0) {
                textEl.setStroke(props.strokeColor, props.strokeWidth);
            }
            renderObjects.push(textEl);
        });

        if (props.showBackground) {
            const paddingX = props.backgroundPaddingX ?? 8;
            const paddingY = props.backgroundPaddingY ?? 4;
            const maxLineWidth = Math.max(1, ...lines.map((l) => measureLineWidth(l, font, letterSpacing)));
            const bgColor = applyOpacity(props.backgroundColor ?? '#000000', props.backgroundOpacity ?? 0.8);
            const bgX =
                textAlign === 'center'
                    ? -maxLineWidth / 2 - paddingX
                    : textAlign === 'right'
                      ? -maxLineWidth - paddingX
                      : -paddingX;
            const bg = new Rectangle(
                bgX,
                startY - paddingY,
                maxLineWidth + paddingX * 2,
                totalHeight + paddingY * 2,
                bgColor
            );
            bg.cornerRadius = props.backgroundCornerRadius ?? 4;
            renderObjects.unshift(bg);
        }

        return renderObjects;
    }
}
