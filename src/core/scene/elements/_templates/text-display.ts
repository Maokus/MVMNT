// Template: SDK 2 text display element.
import { definePluginElement } from '@mvmnt/plugin-sdk';
import { Rectangle, Text, type RenderObject } from '@mvmnt/plugin-sdk/render';

interface TextDisplayProps extends Readonly<Record<string, unknown>> {
    readonly textContent: string;
    readonly fontSize: number;
    readonly fontFamily: string;
    readonly textColor: string;
    readonly textAlign: 'left' | 'center' | 'right';
    readonly textBaseline: 'top' | 'middle' | 'bottom';
    readonly showBackground: boolean;
    readonly backgroundColor: string;
    readonly backgroundPadding: number;
}

const parseFont = (selection: string): { family: string; weight: string } => {
    const [family = 'Inter', weight = '400'] = selection.split('|');
    return { family: family.trim() || 'Inter', weight: weight.trim() || '400' };
};

export const textDisplay = definePluginElement<TextDisplayProps, undefined>({
    type: 'text-display',
    metadata: { name: 'Text Display', description: 'Display customizable text', category: 'Custom' },
    schema: { tabs: [{ id: 'properties', label: 'Properties', groups: [
        { id: 'textContent', label: 'Text Content', collapsed: false, properties: [
            { key: 'textContent', label: 'Text', type: 'string', default: 'Hello World' },
            { key: 'fontSize', label: 'Font Size (px)', type: 'number', default: 36, min: 8, max: 160, step: 1 },
            { key: 'fontFamily', label: 'Font Family', type: 'font', default: 'Inter' },
        ] },
        { id: 'textFormatting', label: 'Formatting', collapsed: false, properties: [
            { key: 'textColor', label: 'Text Color', type: 'colorAlpha', default: '#FFFFFFFF' },
            { key: 'textAlign', label: 'Alignment', type: 'select', default: 'left', options: [
                { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
            ] },
            { key: 'textBaseline', label: 'Baseline', type: 'select', default: 'top', options: [
                { label: 'Top', value: 'top' }, { label: 'Middle', value: 'middle' }, { label: 'Bottom', value: 'bottom' },
            ] },
            { key: 'showBackground', label: 'Show Background', type: 'boolean', default: false },
            { key: 'backgroundColor', label: 'Background Color', type: 'colorAlpha', default: '#00000080' },
            { key: 'backgroundPadding', label: 'Background Padding', type: 'number', default: 16, min: 0, max: 100, step: 1 },
        ] },
    ] }] },
    capabilities: { required: [], optional: [] },
    render(props) {
        if (!props.textContent.trim()) return [];
        const objects: RenderObject[] = [];
        const textWidth = props.textContent.length * props.fontSize * 0.6;
        const textHeight = props.fontSize * 1.2;
        if (props.showBackground) {
            let x = props.textAlign === 'center' ? -textWidth / 2 : props.textAlign === 'right' ? -textWidth : 0;
            let y = props.textBaseline === 'middle' ? -textHeight / 2 : props.textBaseline === 'bottom' ? -textHeight : 0;
            x -= props.backgroundPadding;
            y -= props.backgroundPadding;
            objects.push(new Rectangle(x, y, textWidth + props.backgroundPadding * 2, textHeight + props.backgroundPadding * 2, {
                fillColor: props.backgroundColor,
            }));
        }
        const font = parseFont(props.fontFamily);
        objects.push(new Text(0, 0, props.textContent, `${font.weight} ${props.fontSize}px ${font.family}, sans-serif`, {
            color: props.textColor, align: props.textAlign, baseline: props.textBaseline,
        }));
        return objects;
    },
});
