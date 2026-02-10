// Template: Text Display Element
// Displays customizable text with various formatting options
import { SceneElement, asNumber, asTrimmedString, type PropertyTransform } from '@core/scene/elements/base';
import { Text, Rectangle, type RenderObject } from '@core/render/render-objects';
import type { EnhancedConfigSchema, SceneElementInterface } from '@core/types';

const normalizeTextAlign: PropertyTransform<'left' | 'center' | 'right', SceneElementInterface> = (value, element) => {
    const normalized = asTrimmedString(value, element)?.toLowerCase();
    if (normalized === 'center') return 'center';
    if (normalized === 'right') return 'right';
    return 'left';
};

const normalizeTextBaseline: PropertyTransform<'top' | 'middle' | 'bottom', SceneElementInterface> = (value, element) => {
    const normalized = asTrimmedString(value, element)?.toLowerCase();
    if (normalized === 'middle') return 'middle';
    if (normalized === 'bottom') return 'bottom';
    return 'top';
};

export class TextDisplayElement extends SceneElement {
    constructor(id: string = 'textDisplay', config: Record<string, unknown> = {}) {
        super('text-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        
        return {
            ...base,
            name: 'Text Display',
            description: 'Display customizable text',
            category: 'Custom',
            groups: [
                ...basicGroups,
                {
                    id: 'textContent',
                    label: 'Text Content',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'textContent',
                            type: 'string',
                            label: 'Text',
                            default: 'Hello World',
                            description: 'Text to display',
                            runtime: { transform: asTrimmedString, defaultValue: 'Hello World' },
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 48,
                            min: 8,
                            max: 200,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 48 },
                        },
                        {
                            key: 'fontFamily',
                            type: 'string',
                            label: 'Font Family',
                            default: 'Inter, sans-serif',
                            description: 'CSS font family',
                            runtime: { transform: asTrimmedString, defaultValue: 'Inter, sans-serif' },
                        },
                    ],
                },
                {
                    id: 'textFormatting',
                    label: 'Formatting',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'textColor',
                            type: 'colorAlpha',
                            label: 'Text Color',
                            default: '#FFFFFFFF',
                            runtime: { transform: asTrimmedString, defaultValue: '#FFFFFFFF' },
                        },
                        {
                            key: 'textAlign',
                            type: 'select',
                            label: 'Alignment',
                            default: 'left',
                            options: [
                                { label: 'Left', value: 'left' },
                                { label: 'Center', value: 'center' },
                                { label: 'Right', value: 'right' },
                            ],
                            runtime: { transform: normalizeTextAlign, defaultValue: 'left' },
                        },
                        {
                            key: 'textBaseline',
                            type: 'select',
                            label: 'Baseline',
                            default: 'top',
                            options: [
                                { label: 'Top', value: 'top' },
                                { label: 'Middle', value: 'middle' },
                                { label: 'Bottom', value: 'bottom' },
                            ],
                            runtime: { transform: normalizeTextBaseline, defaultValue: 'top' },
                        },
                        {
                            key: 'showBackground',
                            type: 'boolean',
                            label: 'Show Background',
                            default: false,
                            runtime: {
                                transform: (value) => {
                                    if (typeof value === 'boolean') return value;
                                    if (typeof value === 'string') {
                                        return value.toLowerCase() === 'true';
                                    }
                                    return false;
                                },
                                defaultValue: false
                            },
                        },
                        {
                            key: 'backgroundColor',
                            type: 'colorAlpha',
                            label: 'Background Color',
                            default: '#00000080',
                            runtime: { transform: asTrimmedString, defaultValue: '#00000080' },
                        },
                        {
                            key: 'backgroundPadding',
                            type: 'number',
                            label: 'Background Padding',
                            default: 16,
                            min: 0,
                            max: 100,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 16 },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
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
            
            objects.push(
                new Rectangle(
                    bgX,
                    bgY,
                    bgWidth,
                    bgHeight,
                    props.backgroundColor
                )
            );
        }
        
        // Render text
        const font = `${props.fontSize}px ${props.fontFamily}`;
        objects.push(
            new Text(
                0,
                0,
                props.textContent,
                font,
                props.textColor,
                props.textAlign,
                props.textBaseline
            )
        );
        
        return objects;
    }
}
