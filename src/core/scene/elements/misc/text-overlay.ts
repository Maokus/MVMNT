import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { applyOpacity } from '@utils/color';
import { createBuiltInDefinitionElementClass } from '@core/scene/plugins/built-in-definition';
import { parseFontSelection } from '@fonts/font-loader';

const measureLineWidth = (text: string, font: string, spacing: number): number => {
    try {
        const canvas =
            typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
        const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
        if (context) {
            context.font = font;
            return context.measureText(text).width + text.length * spacing;
        }
    } catch {
        /* deterministic estimate below */
    }
    const size = Number(font.match(/(\d*\.?\d+)px/)?.[1] ?? 16);
    return text.length * (size * 0.6 + spacing);
};
interface Props extends Readonly<Record<string, unknown>> {
    readonly text: string;
    readonly lineSpacing: number;
    readonly color: string;
    readonly opacity: number;
    readonly blendMode: GlobalCompositeOperation;
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly textAlign: CanvasTextAlign;
    readonly letterSpacing: number;
    readonly strokeColor: string;
    readonly strokeWidth: number;
    readonly showBackground: boolean;
    readonly backgroundColor: string;
    readonly backgroundOpacity: number;
    readonly backgroundPaddingX: number;
    readonly backgroundPaddingY: number;
    readonly backgroundCornerRadius: number;
}
export const textOverlay = definePluginElement<Props, undefined>({
    type: 'textOverlay',
    metadata: { name: 'Text', description: 'Multi-line text display', category: 'Misc' },
    schema: {
        tabs: [
            {
                id: 'content',
                label: 'Content',
                groups: [
                    {
                        id: 'textContent',
                        label: 'Content',
                        collapsed: false,
                        properties: [
                            { key: 'text', label: 'Text Content', type: 'longString', default: 'Sample Text' },
                            {
                                key: 'lineSpacing',
                                label: 'Line Spacing (px)',
                                type: 'number',
                                default: 4,
                                min: 0,
                                max: 80,
                                step: 1,
                            },
                        ],
                    },
                ],
            },
            {
                id: 'appearance',
                label: 'Appearance',
                groups: [
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            { key: 'color', label: 'Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                            { key: 'opacity', label: 'Opacity', type: 'range', default: 1, min: 0, max: 1, step: 0.01 },
                            {
                                key: 'blendMode',
                                label: 'Blend Mode',
                                type: 'select',
                                default: 'source-over',
                                options: [
                                    { value: 'source-over', label: 'Normal' },
                                    { value: 'screen', label: 'Screen' },
                                    { value: 'multiply', label: 'Multiply' },
                                ],
                            },
                        ],
                    },
                    {
                        id: 'typography',
                        label: 'Typography',
                        collapsed: false,
                        properties: [
                            { key: 'fontFamily', label: 'Font', type: 'font', default: 'Inter|400' },
                            { key: 'fontSize', label: 'Font Size', type: 'number', default: 36 },
                            {
                                key: 'textAlign',
                                label: 'Alignment',
                                type: 'select',
                                default: 'center',
                                options: [
                                    { value: 'left', label: 'Left' },
                                    { value: 'center', label: 'Center' },
                                    { value: 'right', label: 'Right' },
                                ],
                            },
                            { key: 'letterSpacing', label: 'Letter Spacing', type: 'number', default: 0 },
                            { key: 'strokeColor', label: 'Stroke Color', type: 'colorAlpha', default: '#000000' },
                            { key: 'strokeWidth', label: 'Stroke Width', type: 'number', default: 0, min: 0 },
                        ],
                    },
                    {
                        id: 'container',
                        label: 'Container',
                        collapsed: true,
                        properties: [
                            { key: 'showBackground', label: 'Show Background', type: 'boolean', default: false },
                            {
                                key: 'backgroundColor',
                                label: 'Background Color',
                                type: 'colorAlpha',
                                default: '#000000',
                            },
                            {
                                key: 'backgroundOpacity',
                                label: 'Background Opacity',
                                type: 'range',
                                default: 0.8,
                                min: 0,
                                max: 1,
                            },
                            { key: 'backgroundPaddingX', label: 'Horizontal Padding', type: 'number', default: 8 },
                            { key: 'backgroundPaddingY', label: 'Vertical Padding', type: 'number', default: 4 },
                            { key: 'backgroundCornerRadius', label: 'Corner Radius', type: 'number', default: 4 },
                        ],
                    },
                ],
            },
        ],
    },
    capabilities: { required: [], optional: [] },
    render(props) {
        const objects: RenderObject[] = [];
        const selected = parseFontSelection(props.fontFamily);
        const font = `${selected.weight ?? '400'} ${props.fontSize}px ${selected.family || 'Inter'}, sans-serif`;
        const lines = props.text.split(/\r?\n/);
        const totalHeight = lines.length * props.fontSize + Math.max(0, lines.length - 1) * props.lineSpacing;
        const startY = -totalHeight / 2;
        lines.forEach((line, index) => {
            const item = new Text(0, startY + index * (props.fontSize + props.lineSpacing), line, font, {
                color: applyOpacity(props.color, props.opacity),
                align: props.textAlign,
                baseline: 'top',
            });
            item.letterSpacing = props.letterSpacing;
            item.blendMode = props.blendMode === 'source-over' ? null : props.blendMode;
            if (props.strokeWidth > 0) item.setStroke(props.strokeColor, props.strokeWidth);
            objects.push(item);
        });
        if (props.showBackground) {
            const width = Math.max(1, ...lines.map((line) => measureLineWidth(line, font, props.letterSpacing)));
            const x = props.textAlign === 'center' ? -width / 2 : props.textAlign === 'right' ? -width : 0;
            const bg = new Rectangle(
                x - props.backgroundPaddingX,
                startY - props.backgroundPaddingY,
                width + props.backgroundPaddingX * 2,
                totalHeight + props.backgroundPaddingY * 2,
                { fillColor: applyOpacity(props.backgroundColor, props.backgroundOpacity) }
            );
            bg.cornerRadius = props.backgroundCornerRadius;
            objects.unshift(bg);
        }
        return objects;
    },
});
export const TextOverlayElement = createBuiltInDefinitionElementClass(textOverlay);
